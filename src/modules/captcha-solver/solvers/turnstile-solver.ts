import { Injectable, Logger } from '@nestjs/common';
import type { Page, Frame } from 'playwright';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { CaptchaWidgetType } from '../services/interfaces/widget-interaction.interface';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import type {
  TurnstileSolverConfig,
} from './interfaces/turnstile-solver.interface';
import {
  TurnstileWidgetMode,
  TurnstileDetectionResult,
  TurnstileChallengeResponse,
  TurnstileSolverMetrics,
} from './interfaces/turnstile-solver.interface';

/**
 * Default configuration for Turnstile solver
 */
const DEFAULT_CONFIG: Required<TurnstileSolverConfig> = {
  maxRetries: 3,
  managedTimeout: 30000,
  nonInteractiveTimeout: 10000,
  invisibleTimeout: 10000,
  initialRetryDelay: 1000,
  maxRetryDelay: 30000,
  enableFallback: true,
};

/**
 * Native Turnstile Challenge Solver
 * 
 * Implements browser automation-based solving for Cloudflare Turnstile challenges.
 * Supports managed (interactive), non-interactive (automatic), and invisible modes.
 */
@Injectable()
export class TurnstileSolver implements ICaptchaSolver {
  private readonly logger: Logger;
  private readonly config: Required<TurnstileSolverConfig>;
  private readonly metrics: TurnstileSolverMetrics;

  constructor(
    private readonly page: Page,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
    private readonly performanceTracker?: SolverPerformanceTracker,
    config?: TurnstileSolverConfig,
  ) {
    this.logger = new Logger(TurnstileSolver.name);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageSolvingTime: 0,
      widgetTypeDistribution: {
        [TurnstileWidgetMode.MANAGED]: 0,
        [TurnstileWidgetMode.NON_INTERACTIVE]: 0,
        [TurnstileWidgetMode.INVISIBLE]: 0,
        [TurnstileWidgetMode.UNKNOWN]: 0,
      },
      failureReasons: {},
    };
  }

  /**
   * Get the name of the solver
   */
  getName(): string {
    return 'turnstile-native';
  }

  /**
   * Check if the solver is available
   * Native solvers are always available (no API key required)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Solve a Turnstile challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      this.metrics.totalAttempts++;

      try {
        this.logger.debug(
          `Attempt ${attempt}/${this.config.maxRetries} to solve Turnstile challenge`,
        );

        // Detect Turnstile widget
        const detection = await this.detectTurnstileWidget();
        if (!detection.iframe || detection.confidence < 0.5) {
          throw new Error('Turnstile widget not detected');
        }

        this.metrics.widgetTypeDistribution[detection.mode]++;

        // Solve based on widget mode
        const response = await this.solveChallenge(detection, params);

        const duration = Date.now() - startTime;
        this.metrics.successCount++;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'recaptcha', // Using recaptcha as challenge type for Turnstile
            duration,
            true,
          );
        }

        this.logger.log(
          `Successfully solved Turnstile challenge (${detection.mode}) in ${duration}ms on attempt ${attempt}`,
        );

        return {
          token: response.token,
          solvedAt: response.solvedAt,
          solverId: this.getName(),
        };
      } catch (error: any) {
        lastError = error;
        const duration = Date.now() - startTime;
        this.metrics.failureCount++;
        const errorMessage = error.message || 'Unknown error';
        this.metrics.failureReasons[errorMessage] =
          (this.metrics.failureReasons[errorMessage] || 0) + 1;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'recaptcha',
            duration,
            false,
            errorMessage,
          );
        }

        this.logger.warn(
          `Attempt ${attempt}/${this.config.maxRetries} failed: ${errorMessage}`,
        );

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }

        // Exponential backoff before retry
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(
            this.config.initialRetryDelay * Math.pow(2, attempt - 1),
            this.config.maxRetryDelay,
          );
          this.logger.debug(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to solve Turnstile challenge after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Determine if an error should not trigger a retry
   */
  private shouldNotRetry(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';

    // Don't retry on widget not detected errors
    if (errorMessage.includes('widget not detected')) {
      return true;
    }

    // Don't retry on invalid parameters
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('required')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Detect Turnstile widget on the page
   */
  private async detectTurnstileWidget(): Promise<TurnstileDetectionResult> {
    try {
      // First, try to detect using widget interaction service
      const widgetResult = await this.widgetInteraction.detectWidget(
        this.page,
        CaptchaWidgetType.TURNSTILE,
      );

      if (!widgetResult.iframe || widgetResult.confidence < 0.5) {
        return {
          mode: TurnstileWidgetMode.UNKNOWN,
          iframe: null,
          confidence: 0,
        };
      }

      // Determine widget mode by inspecting the widget
      const mode = await this.determineWidgetMode(widgetResult.iframe);

      // Extract site key and other details
      const details = await this.extractWidgetDetails(widgetResult.iframe);

      return {
        mode,
        iframe: widgetResult.iframe,
        confidence: widgetResult.confidence,
        details: {
          ...details,
          iframeSrc: widgetResult.iframeSrc,
        },
      };
    } catch (error: any) {
      this.logger.warn(`Error detecting Turnstile widget: ${error.message}`);
      return {
        mode: TurnstileWidgetMode.UNKNOWN,
        iframe: null,
        confidence: 0,
        details: {},
      };
    }
  }

  /**
   * Determine the widget mode (managed, non-interactive, or invisible)
   */
  private async determineWidgetMode(iframe: Frame): Promise<TurnstileWidgetMode> {
    try {
      const widgetInfo = await iframe.evaluate(() => {
        // Check for widget container
        const container = document.querySelector('.cf-turnstile');
        if (!container) {
          return { mode: 'unknown', hasInteractive: false, isVisible: false };
        }

        // Check if widget is visible
        const isVisible =
          container instanceof HTMLElement &&
          container.offsetWidth > 0 &&
          container.offsetHeight > 0;

        // Check for interactive elements (checkbox, button)
        const hasInteractive =
          !!document.querySelector('input[type="checkbox"]') ||
          !!document.querySelector('button') ||
          !!document.querySelector('[role="button"]');

        // Check data-mode attribute if present
        const dataMode = container.getAttribute('data-mode');
        const dataTheme = container.getAttribute('data-theme');
        const dataSize = container.getAttribute('data-size');

        return {
          mode: dataMode || (hasInteractive ? 'managed' : 'non-interactive'),
          hasInteractive,
          isVisible,
          theme: dataTheme,
          size: dataSize,
        };
      });

      // Determine mode based on widget characteristics
      if (widgetInfo.mode === 'managed' || widgetInfo.hasInteractive) {
        return TurnstileWidgetMode.MANAGED;
      } else if (!widgetInfo.isVisible) {
        return TurnstileWidgetMode.INVISIBLE;
      } else {
        return TurnstileWidgetMode.NON_INTERACTIVE;
      }
    } catch (error: any) {
      this.logger.warn(
        `Error determining widget mode: ${error.message}, defaulting to managed`,
      );
      return TurnstileWidgetMode.MANAGED;
    }
  }

  /**
   * Extract widget details (site key, theme, size, etc.)
   */
  private async extractWidgetDetails(iframe: Frame): Promise<{
    containerSelector?: string;
    isVisible?: boolean;
    theme?: string;
    size?: string;
  }> {
    try {
      return await iframe.evaluate(() => {
        const container = document.querySelector('.cf-turnstile');
        if (!container) {
          return {};
        }

        return {
          containerSelector: '.cf-turnstile',
          isVisible:
            container instanceof HTMLElement &&
            container.offsetWidth > 0 &&
            container.offsetHeight > 0,
          theme: container.getAttribute('data-theme') || undefined,
          size: container.getAttribute('data-size') || undefined,
        };
      });
    } catch (error: any) {
      this.logger.debug(`Error extracting widget details: ${error.message}`);
      return {};
    }
  }

  /**
   * Solve the Turnstile challenge based on widget mode
   */
  private async solveChallenge(
    detection: TurnstileDetectionResult,
    params: CaptchaParams,
  ): Promise<TurnstileChallengeResponse> {
    const startTime = Date.now();

    switch (detection.mode) {
      case TurnstileWidgetMode.MANAGED:
        return await this.solveManagedChallenge(detection, params);
      case TurnstileWidgetMode.NON_INTERACTIVE:
        return await this.solveNonInteractiveChallenge(detection, params);
      case TurnstileWidgetMode.INVISIBLE:
        return await this.solveInvisibleChallenge(detection, params);
      default:
        throw new Error(`Unsupported widget mode: ${detection.mode}`);
    }
  }

  /**
   * Solve managed (interactive) challenge
   */
  private async solveManagedChallenge(
    detection: TurnstileDetectionResult,
    params: CaptchaParams,
  ): Promise<TurnstileChallengeResponse> {
    if (!detection.iframe) {
      throw new Error('Turnstile iframe not found');
    }

    const timeout = this.config.managedTimeout;

    try {
      // Wait for widget to be ready
      await detection.iframe.waitForLoadState('networkidle', { timeout });

      // Look for checkbox or button to interact with
      const checkbox = detection.iframe.locator('input[type="checkbox"]');
      const button = detection.iframe.locator('button, [role="button"]');

      // Try clicking checkbox first
      try {
        await checkbox.waitFor({ state: 'visible', timeout: 5000 });
        await checkbox.click({ timeout: 5000 });
        this.logger.debug('Clicked Turnstile checkbox');
      } catch (e) {
        // If checkbox not found, try button
        try {
          await button.waitFor({ state: 'visible', timeout: 5000 });
          await button.click({ timeout: 5000 });
          this.logger.debug('Clicked Turnstile button');
        } catch (e2) {
          // If neither found, try clicking the container
          const container = detection.iframe.locator('.cf-turnstile');
          await container.click({ timeout: 5000 });
          this.logger.debug('Clicked Turnstile container');
        }
      }

      // Wait for challenge to complete and token to be generated
      const token = await this.waitForToken(detection.iframe, timeout);

      const solveStartTime = Date.now();
      return {
        token,
        solvedAt: new Date(),
        mode: TurnstileWidgetMode.MANAGED,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to solve managed Turnstile challenge: ${error.message}`,
      );
    }
  }

  /**
   * Solve non-interactive (automatic) challenge
   */
  private async solveNonInteractiveChallenge(
    detection: TurnstileDetectionResult,
    params: CaptchaParams,
  ): Promise<TurnstileChallengeResponse> {
    if (!detection.iframe) {
      throw new Error('Turnstile iframe not found');
    }

    const timeout = this.config.nonInteractiveTimeout;

    try {
      // Wait for widget to load
      await detection.iframe.waitForLoadState('networkidle', { timeout });

      // Non-interactive challenges solve automatically, just wait for token
      const token = await this.waitForToken(detection.iframe, timeout);

      const solveStartTime = Date.now();
      return {
        token,
        solvedAt: new Date(),
        mode: TurnstileWidgetMode.NON_INTERACTIVE,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to solve non-interactive Turnstile challenge: ${error.message}`,
      );
    }
  }

  /**
   * Solve invisible challenge
   */
  private async solveInvisibleChallenge(
    detection: TurnstileDetectionResult,
    params: CaptchaParams,
  ): Promise<TurnstileChallengeResponse> {
    if (!detection.iframe) {
      throw new Error('Turnstile iframe not found');
    }

    const timeout = this.config.invisibleTimeout;

    try {
      // Wait for widget to load
      await detection.iframe.waitForLoadState('networkidle', { timeout });

      // Invisible challenges run in background, wait for token
      const token = await this.waitForToken(detection.iframe, timeout);

      const solveStartTime = Date.now();
      return {
        token,
        solvedAt: new Date(),
        mode: TurnstileWidgetMode.INVISIBLE,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to solve invisible Turnstile challenge: ${error.message}`,
      );
    }
  }

  /**
   * Wait for Turnstile token to be generated
   * Monitors network requests to challenges.cloudflare.com and extracts token
   */
  private async waitForToken(
    iframe: Frame,
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const deadline = startTime + timeout;

      // Monitor network responses for token
      const responseHandler = async (response: any) => {
        try {
          const url = response.url();
          if (
            url.includes('challenges.cloudflare.com') ||
            url.includes('turnstile')
          ) {
            const responseBody = await response.text();
            // Try to extract token from response
            const tokenMatch = responseBody.match(
              /"token"\s*:\s*"([^"]+)"/,
            ) || responseBody.match(/"cf-turnstile-response"\s*:\s*"([^"]+)"/);

            if (tokenMatch && tokenMatch[1]) {
              this.page.off('response', responseHandler);
              resolve(tokenMatch[1]);
              return;
            }
          }
        } catch (e) {
          // Continue monitoring
        }
      };

      this.page.on('response', responseHandler);

      // Also check DOM for token in textarea or hidden input
      const checkInterval = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(checkInterval);
          this.page.off('response', responseHandler);
          reject(new Error('Timeout waiting for Turnstile token'));
          return;
        }

        try {
          // Check for token in parent page
          const token = await this.page.evaluate(() => {
            // Look for textarea with cf-turnstile-response
            const textarea = document.querySelector(
              'textarea[name="cf-turnstile-response"]',
            ) as HTMLTextAreaElement;
            if (textarea && textarea.value) {
              return textarea.value;
            }

            // Look for hidden input
            const input = document.querySelector(
              'input[name="cf-turnstile-response"]',
            ) as HTMLInputElement;
            if (input && input.value) {
              return input.value;
            }

            // Look for data attribute
            const widget = document.querySelector('[data-sitekey]');
            if (widget) {
              const response = widget.getAttribute('data-cf-turnstile-response');
              if (response) {
                return response;
              }
            }

            return null;
          });

          if (token && token.length > 0) {
            clearInterval(checkInterval);
            this.page.off('response', responseHandler);
            resolve(token);
          }
        } catch (e) {
          // Continue checking
        }
      }, 500);

      // Set overall timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        this.page.off('response', responseHandler);
        reject(new Error('Timeout waiting for Turnstile token'));
      }, timeout);
    });
  }

  /**
   * Update metrics after solving attempt
   */
  private updateMetrics(duration: number): void {
    this.metrics.successRate =
      this.metrics.totalAttempts > 0
        ? this.metrics.successCount / this.metrics.totalAttempts
        : 0;

    // Update average solving time (exponential moving average)
    if (this.metrics.averageSolvingTime === 0) {
      this.metrics.averageSolvingTime = duration;
    } else {
      this.metrics.averageSolvingTime =
        this.metrics.averageSolvingTime * 0.7 + duration * 0.3;
    }
  }

  /**
   * Get solver metrics
   */
  getMetrics(): TurnstileSolverMetrics {
    return { ...this.metrics };
  }
}

