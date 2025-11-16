import { Injectable, Logger } from '@nestjs/common';
import { Page, Frame } from 'playwright';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { CaptchaWidgetType } from '../services/interfaces/widget-interaction.interface';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { AudioCaptchaProcessingService } from '../services/audio-captcha-processing.service';
import {
  HcaptchaChallengeType,
  HcaptchaDifficulty,
  HcaptchaDetectionResult,
  HcaptchaChallengeResponse,
  HcaptchaSolverConfig,
  HcaptchaSolverMetrics,
} from './interfaces/hcaptcha-solver.interface';

/**
 * Default configuration for hCAPTCHA solver
 */
const DEFAULT_CONFIG: Required<HcaptchaSolverConfig> = {
  maxRetries: 3,
  checkboxTimeout: 30000,
  invisibleTimeout: 10000,
  audioTimeout: 30000,
  accessibilityTimeout: 30000,
  initialRetryDelay: 1000,
  maxRetryDelay: 30000,
  enableFallback: true,
  enableAudioChallenges: true,
  enableAccessibilityChallenges: true,
  enableDifficultyDetection: true,
  adaptiveRetry: true,
};

/**
 * Native hCAPTCHA Challenge Solver
 *
 * Implements browser automation-based solving for hCAPTCHA challenges.
 * Supports checkbox, invisible, audio, and accessibility challenge variants.
 */
@Injectable()
export class NativeHcaptchaSolver implements ICaptchaSolver {
  private readonly logger: Logger;
  private readonly config: Required<HcaptchaSolverConfig>;
  private readonly metrics: HcaptchaSolverMetrics;

  constructor(
    private readonly page: Page,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
    private readonly audioProcessing: AudioCaptchaProcessingService,
    private readonly performanceTracker?: SolverPerformanceTracker,
    config?: HcaptchaSolverConfig,
  ) {
    this.logger = new Logger(NativeHcaptchaSolver.name);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageSolvingTime: 0,
      challengeTypeDistribution: {
        [HcaptchaChallengeType.CHECKBOX]: 0,
        [HcaptchaChallengeType.INVISIBLE]: 0,
        [HcaptchaChallengeType.AUDIO]: 0,
        [HcaptchaChallengeType.ACCESSIBILITY]: 0,
      },
      difficultyDistribution: {
        [HcaptchaDifficulty.EASY]: 0,
        [HcaptchaDifficulty.MEDIUM]: 0,
        [HcaptchaDifficulty.HARD]: 0,
        [HcaptchaDifficulty.UNKNOWN]: 0,
      },
      failureReasons: {},
      audioTranscriptionAccuracy: 0,
    };
  }

  /**
   * Get the name of the solver
   */
  getName(): string {
    return 'hcaptcha-native';
  }

  /**
   * Check if the solver is available
   * Native solvers are always available (no API key required)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Solve an hCAPTCHA challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      this.metrics.totalAttempts++;
      let detection: HcaptchaDetectionResult | null = null;

      try {
        this.logger.debug(
          `Attempt ${attempt}/${this.config.maxRetries} to solve hCAPTCHA challenge`,
        );

        // Detect hCAPTCHA widget
        detection = await this.detectHcaptchaWidget(params);
        if (!detection.anchorIframe || detection.confidence < 0.5) {
          throw new Error('hCAPTCHA widget not detected');
        }

        // Detect difficulty if enabled
        if (this.config.enableDifficultyDetection) {
          const difficulty = await this.detectDifficulty(detection);
          if (difficulty) {
            detection.details = {
              ...detection.details,
              difficulty,
            };
            this.metrics.difficultyDistribution[difficulty]++;
          }
        }

        // Determine challenge type if not already detected
        if (!detection.challengeType) {
          detection.challengeType = await this.determineChallengeType(detection);
        }

        if (detection.challengeType) {
          this.metrics.challengeTypeDistribution[detection.challengeType]++;
        }

        // Solve based on challenge type
        const response = await this.solveChallenge(detection, params, attempt);

        const duration = Date.now() - startTime;
        this.metrics.successCount++;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'hcaptcha',
            duration,
            true,
          );
        }

        this.logger.log(
          `Successfully solved hCAPTCHA challenge${detection.challengeType ? ` (${detection.challengeType})` : ''} in ${duration}ms on attempt ${attempt}`,
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
            'hcaptcha',
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

        // Adaptive retry delay based on difficulty
        if (attempt < this.config.maxRetries) {
          const baseDelay = this.config.initialRetryDelay * Math.pow(2, attempt - 1);
          const delay = this.config.adaptiveRetry && detection
            ? this.calculateAdaptiveDelay(baseDelay, detection.details?.difficulty)
            : Math.min(baseDelay, this.config.maxRetryDelay);
          
          this.logger.debug(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to solve hCAPTCHA challenge after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Calculate adaptive retry delay based on difficulty
   */
  private calculateAdaptiveDelay(
    baseDelay: number,
    difficulty?: HcaptchaDifficulty,
  ): number {
    let multiplier = 1.0;

    switch (difficulty) {
      case HcaptchaDifficulty.HARD:
        multiplier = 1.5;
        break;
      case HcaptchaDifficulty.MEDIUM:
        multiplier = 1.2;
        break;
      case HcaptchaDifficulty.EASY:
        multiplier = 1.0;
        break;
      default:
        multiplier = 1.0;
    }

    return Math.min(baseDelay * multiplier, this.config.maxRetryDelay);
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
   * Detect hCAPTCHA widget on the page
   */
  private async detectHcaptchaWidget(
    params: CaptchaParams,
  ): Promise<HcaptchaDetectionResult> {
    try {
      // First, try to detect using widget interaction service
      const widgetResult = await this.widgetInteraction.detectWidget(
        this.page,
        CaptchaWidgetType.HCAPTCHA,
      );

      if (!widgetResult.iframe || widgetResult.confidence < 0.5) {
        return {
          anchorIframe: null,
          challengeIframe: null,
          confidence: 0,
        };
      }

      // Extract site key and other details
      const details = await this.extractWidgetDetails(widgetResult.iframe);

      // Find anchor and challenge iframes
      const { anchorIframe, challengeIframe } = await this.findIframes();

      return {
        anchorIframe: anchorIframe || widgetResult.iframe,
        challengeIframe,
        siteKey: details.siteKey,
        callback: details.callback,
        confidence: widgetResult.confidence,
        details: {
          ...details,
          anchorIframeSrc: anchorIframe?.url(),
          challengeIframeSrc: challengeIframe?.url(),
        },
      };
    } catch (error: any) {
      this.logger.warn(`Error detecting hCAPTCHA widget: ${error.message}`);
      return {
        anchorIframe: null,
        challengeIframe: null,
        confidence: 0,
      };
    }
  }

  /**
   * Extract widget details from the page
   */
  private async extractWidgetDetails(iframe: Frame): Promise<{
    siteKey?: string;
    callback?: string;
    containerSelector?: string;
    isVisible?: boolean;
    theme?: string;
    size?: string;
  }> {
    try {
      return await this.page.evaluate(() => {
        const hcaptchaElement = document.querySelector(
          '.h-captcha, [class*="h-captcha"], [data-sitekey*="hcaptcha"]',
        ) as HTMLElement;

        if (!hcaptchaElement) {
          return {};
        }

        return {
          siteKey: hcaptchaElement.getAttribute('data-sitekey') || undefined,
          callback: hcaptchaElement.getAttribute('data-callback') || undefined,
          containerSelector: '.h-captcha',
          isVisible: hcaptchaElement.offsetParent !== null,
          theme: hcaptchaElement.getAttribute('data-theme') || undefined,
          size: hcaptchaElement.getAttribute('data-size') || undefined,
        };
      });
    } catch (error: any) {
      this.logger.warn(`Failed to extract widget details: ${error.message}`);
      return {};
    }
  }

  /**
   * Find anchor and challenge iframes
   */
  private async findIframes(): Promise<{
    anchorIframe: Frame | null;
    challengeIframe: Frame | null;
  }> {
    try {
      const frames = this.page.frames();
      let anchorIframe: Frame | null = null;
      let challengeIframe: Frame | null = null;

      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('hcaptcha.com') || url.includes('hcaptcha')) {
          // Anchor iframe typically contains the checkbox
          if (url.includes('checkbox') || url.includes('anchor')) {
            anchorIframe = frame;
          }
          // Challenge iframe contains the actual challenge
          else if (url.includes('challenge') || url.includes('hcaptcha.com/challenges')) {
            challengeIframe = frame;
          } else if (!anchorIframe) {
            // Fallback: first hcaptcha iframe is likely the anchor
            anchorIframe = frame;
          }
        }
      }

      return { anchorIframe, challengeIframe };
    } catch (error: any) {
      this.logger.warn(`Failed to find iframes: ${error.message}`);
      return { anchorIframe: null, challengeIframe: null };
    }
  }

  /**
   * Determine challenge type
   */
  private async determineChallengeType(
    detection: HcaptchaDetectionResult,
  ): Promise<HcaptchaChallengeType> {
    try {
      // Check if challenge iframe exists (indicates a challenge is active)
      if (detection.challengeIframe) {
        // Check for audio button
        const hasAudio = await detection.challengeIframe
          .locator('button[aria-label*="audio" i], a[aria-label*="audio" i], #audio-button')
          .count();
        if (hasAudio > 0) {
          return HcaptchaChallengeType.AUDIO;
        }

        // Check for accessibility option
        const hasAccessibility = await detection.challengeIframe
          .locator('button[aria-label*="accessibility" i], a[aria-label*="accessibility" i], #accessibility-button')
          .count();
        if (hasAccessibility > 0) {
          return HcaptchaChallengeType.ACCESSIBILITY;
        }

        // Default to checkbox if challenge iframe exists
        return HcaptchaChallengeType.CHECKBOX;
      }

      // Check if invisible (no visible widget)
      if (detection.anchorIframe) {
        const isInvisible = await this.page.evaluate(() => {
          const element = document.querySelector('.h-captcha');
          return element && (element as HTMLElement).offsetParent === null;
        });

        if (isInvisible) {
          return HcaptchaChallengeType.INVISIBLE;
        }
      }

      return HcaptchaChallengeType.CHECKBOX;
    } catch (error: any) {
      this.logger.warn(`Error determining challenge type: ${error.message}`);
      return HcaptchaChallengeType.CHECKBOX;
    }
  }

  /**
   * Detect challenge difficulty
   */
  private async detectDifficulty(
    detection: HcaptchaDetectionResult,
  ): Promise<HcaptchaDifficulty | null> {
    if (!this.config.enableDifficultyDetection) {
      return null;
    }

    try {
      if (!detection.challengeIframe) {
        return HcaptchaDifficulty.UNKNOWN;
      }

      // Analyze challenge metadata
      const difficultyInfo = await detection.challengeIframe.evaluate(() => {
        // Check for difficulty indicators in the challenge
        const challengeText = document.body.textContent || '';
        const hasComplexPrompt = challengeText.length > 100;
        const hasMultipleSteps = document.querySelectorAll('.challenge-step').length > 1;
        const hasTimeLimit = !!document.querySelector('[data-time-limit]');

        // Count required selections
        const selectionElements = document.querySelectorAll(
          '[data-required], .required-selection',
        );
        const requiredSelections = selectionElements.length;

        return {
          hasComplexPrompt,
          hasMultipleSteps,
          hasTimeLimit,
          requiredSelections,
        };
      });

      // Determine difficulty based on indicators
      if (
        difficultyInfo.hasMultipleSteps ||
        difficultyInfo.requiredSelections > 3 ||
        difficultyInfo.hasTimeLimit
      ) {
        return HcaptchaDifficulty.HARD;
      } else if (
        difficultyInfo.hasComplexPrompt ||
        difficultyInfo.requiredSelections > 1
      ) {
        return HcaptchaDifficulty.MEDIUM;
      } else {
        return HcaptchaDifficulty.EASY;
      }
    } catch (error: any) {
      this.logger.debug(`Error detecting difficulty: ${error.message}`);
      return HcaptchaDifficulty.UNKNOWN;
    }
  }

  /**
   * Solve challenge based on type
   */
  private async solveChallenge(
    detection: HcaptchaDetectionResult,
    params: CaptchaParams,
    attempt: number,
  ): Promise<HcaptchaChallengeResponse> {
    const challengeType = detection.challengeType || HcaptchaChallengeType.CHECKBOX;

    switch (challengeType) {
      case HcaptchaChallengeType.CHECKBOX:
        return this.solveCheckboxChallenge(detection, params);
      case HcaptchaChallengeType.INVISIBLE:
        return this.solveInvisibleChallenge(detection, params);
      case HcaptchaChallengeType.AUDIO:
        return this.solveAudioChallenge(detection, params);
      case HcaptchaChallengeType.ACCESSIBILITY:
        return this.solveAccessibilityChallenge(detection, params);
      default:
        throw new Error(`Unknown challenge type: ${challengeType}`);
    }
  }

  /**
   * Solve checkbox challenge
   */
  private async solveCheckboxChallenge(
    detection: HcaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<HcaptchaChallengeResponse> {
    if (!detection.anchorIframe) {
      throw new Error('hCAPTCHA anchor iframe not found');
    }

    const timeout = this.config.checkboxTimeout;

    try {
      // Wait for anchor iframe to load
      await detection.anchorIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Click the checkbox
      const checkbox = detection.anchorIframe.locator(
        '#checkbox, input[type="checkbox"], .hcaptcha-checkbox',
      );
      await checkbox.waitFor({ state: 'visible', timeout: 5000 });
      await checkbox.click({ timeout: 5000 });
      this.logger.debug('Clicked hCAPTCHA checkbox');

      // Wait for challenge iframe to appear (if challenge is triggered)
      await this.sleep(2000);

      // Check if challenge appeared
      const { challengeIframe } = await this.findIframes();
      if (challengeIframe) {
        // Challenge appeared, need to solve it
        detection.challengeIframe = challengeIframe;
        const challengeType = await this.determineChallengeType(detection);
        
        if (challengeType === HcaptchaChallengeType.AUDIO) {
          return this.solveAudioChallenge(detection, params);
        } else if (challengeType === HcaptchaChallengeType.ACCESSIBILITY) {
          return this.solveAccessibilityChallenge(detection, params);
        }
      }

      // Wait for token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      return {
        token,
        solvedAt: new Date(),
        challengeType: HcaptchaChallengeType.CHECKBOX,
        duration: Date.now() - solveStartTime,
        difficulty: detection.details?.difficulty,
      };
    } catch (error: any) {
      throw new Error(`Failed to solve checkbox challenge: ${error.message}`);
    }
  }

  /**
   * Solve invisible challenge
   */
  private async solveInvisibleChallenge(
    detection: HcaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<HcaptchaChallengeResponse> {
    if (!detection.anchorIframe) {
      throw new Error('hCAPTCHA anchor iframe not found');
    }

    const timeout = this.config.invisibleTimeout;

    try {
      // Wait for anchor iframe to load
      await detection.anchorIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Invisible challenges typically trigger automatically
      // Wait a bit for the challenge to process
      await this.sleep(3000);

      // Wait for token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      if (!token) {
        // Might need to trigger callback manually
        if (detection.callback) {
          await this.triggerCallback(detection.callback);
          await this.sleep(2000);
          const retryToken = await this.waitForToken(
            detection.anchorIframe,
            timeout,
          );
          if (retryToken) {
            return {
              token: retryToken,
              solvedAt: new Date(),
              challengeType: HcaptchaChallengeType.INVISIBLE,
              duration: Date.now() - solveStartTime,
              difficulty: detection.details?.difficulty,
            };
          }
        }
        throw new Error('Token not generated for invisible challenge');
      }

      return {
        token,
        solvedAt: new Date(),
        challengeType: HcaptchaChallengeType.INVISIBLE,
        duration: Date.now() - solveStartTime,
        difficulty: detection.details?.difficulty,
      };
    } catch (error: any) {
      throw new Error(`Failed to solve invisible challenge: ${error.message}`);
    }
  }

  /**
   * Solve audio challenge
   */
  private async solveAudioChallenge(
    detection: HcaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<HcaptchaChallengeResponse> {
    if (!detection.challengeIframe) {
      throw new Error('hCAPTCHA challenge iframe not found');
    }

    if (!this.config.enableAudioChallenges) {
      throw new Error('Audio challenges are disabled');
    }

    const timeout = this.config.audioTimeout;

    try {
      // Wait for challenge iframe to load
      await detection.challengeIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Click accessibility button to reveal audio option
      const accessibilityButton = detection.challengeIframe.locator(
        'button[aria-label*="accessibility" i], a[aria-label*="accessibility" i], #accessibility-button',
      );
      const hasAccessibility = await accessibilityButton.count();
      
      if (hasAccessibility > 0) {
        await accessibilityButton.waitFor({ state: 'visible', timeout: 5000 });
        await accessibilityButton.click({ timeout: 5000 });
        this.logger.debug('Clicked accessibility button');
        await this.sleep(1000);
      }

      // Click audio challenge button
      const audioButton = detection.challengeIframe.locator(
        'button[aria-label*="audio" i], a[aria-label*="audio" i], #audio-button',
      );
      await audioButton.waitFor({ state: 'visible', timeout: 5000 });
      await audioButton.click({ timeout: 5000 });
      this.logger.debug('Clicked audio challenge button');

      // Wait for audio to load
      await this.sleep(2000);

      // Extract audio URL
      const audioUrl = await this.extractAudioUrl(detection.challengeIframe);
      if (!audioUrl) {
        throw new Error('Could not extract audio URL');
      }

      // Download and transcribe audio
      const audioResult = await this.audioProcessing.processAudioCaptcha(
        { audioUrl },
        this.page,
      );

      // Update transcription accuracy metric
      this.updateTranscriptionAccuracy(audioResult.confidence);

      // Submit transcription
      await this.submitAudioTranscription(
        detection.challengeIframe,
        audioResult.transcription,
      );

      // Wait for token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      return {
        token,
        solvedAt: new Date(),
        challengeType: HcaptchaChallengeType.AUDIO,
        duration: Date.now() - solveStartTime,
        difficulty: detection.details?.difficulty,
      };
    } catch (error: any) {
      throw new Error(`Failed to solve audio challenge: ${error.message}`);
    }
  }

  /**
   * Solve accessibility challenge
   */
  private async solveAccessibilityChallenge(
    detection: HcaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<HcaptchaChallengeResponse> {
    if (!detection.challengeIframe) {
      throw new Error('hCAPTCHA challenge iframe not found');
    }

    if (!this.config.enableAccessibilityChallenges) {
      throw new Error('Accessibility challenges are disabled');
    }

    const timeout = this.config.accessibilityTimeout;

    try {
      // Wait for challenge iframe to load
      await detection.challengeIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Click accessibility button
      const accessibilityButton = detection.challengeIframe.locator(
        'button[aria-label*="accessibility" i], a[aria-label*="accessibility" i], #accessibility-button',
      );
      await accessibilityButton.waitFor({ state: 'visible', timeout: 5000 });
      await accessibilityButton.click({ timeout: 5000 });
      this.logger.debug('Clicked accessibility challenge button');

      // Wait for text-based challenge to appear
      await this.sleep(2000);

      // Extract challenge text
      const challengeText = await detection.challengeIframe.evaluate(() => {
        const prompt = document.querySelector('.challenge-prompt, .prompt-text');
        return prompt?.textContent || '';
      });

      // For text-based challenges, we would need OCR or manual solving
      // For now, this is a placeholder that would need implementation
      this.logger.warn('Accessibility challenge detected but not fully implemented');

      // Wait for token (might be auto-generated)
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      if (!token) {
        throw new Error('Accessibility challenge solving not fully implemented');
      }

      return {
        token,
        solvedAt: new Date(),
        challengeType: HcaptchaChallengeType.ACCESSIBILITY,
        duration: Date.now() - solveStartTime,
        difficulty: detection.details?.difficulty,
      };
    } catch (error: any) {
      throw new Error(`Failed to solve accessibility challenge: ${error.message}`);
    }
  }

  /**
   * Extract audio URL from challenge iframe
   */
  private async extractAudioUrl(challengeIframe: Frame): Promise<string | null> {
    try {
      return await challengeIframe.evaluate(() => {
        const audioElement = document.querySelector('audio');
        if (audioElement?.src) {
          return audioElement.src;
        }

        // Look for audio source in iframe
        const source = document.querySelector('source[type*="audio"]');
        if (source) {
          return (source as HTMLSourceElement).src;
        }

        // Look for audio URL in script or data attributes
        const audioContainer = document.querySelector('[data-audio-url]');
        if (audioContainer) {
          return audioContainer.getAttribute('data-audio-url');
        }

        return null;
      });
    } catch (error: any) {
      this.logger.warn(`Failed to extract audio URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Submit audio transcription
   */
  private async submitAudioTranscription(
    challengeIframe: Frame,
    transcription: string,
  ): Promise<void> {
    try {
      const input = challengeIframe.locator(
        '#audio-response, input[type="text"][name*="audio"], textarea[name*="audio"]',
      );
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.fill(transcription);
      await input.press('Enter');
      this.logger.debug(`Submitted audio transcription: ${transcription}`);
    } catch (error: any) {
      throw new Error(`Failed to submit audio transcription: ${error.message}`);
    }
  }

  /**
   * Wait for hCAPTCHA token
   */
  private async waitForToken(
    iframe: Frame | null,
    timeout: number,
    allowTimeout: boolean = false,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const deadline = startTime + timeout;

      // Monitor network responses for token
      const responseHandler = async (response: any) => {
        try {
          const url = response.url();
          if (url.includes('hcaptcha.com') && url.includes('token')) {
            const responseBody = await response.text();
            const tokenMatch = responseBody.match(/"token"\s*:\s*"([^"]+)"/);

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

      // Also check DOM for token
      const checkInterval = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(checkInterval);
          this.page.off('response', responseHandler);
          if (allowTimeout) {
            resolve('');
            return;
          }
          reject(new Error('Timeout waiting for hCAPTCHA token'));
          return;
        }

        try {
          // Check for token in parent page
          const token = await this.page.evaluate(() => {
            // Look for textarea with h-captcha-response
            const textarea = document.querySelector(
              'textarea[name="h-captcha-response"]',
            ) as HTMLTextAreaElement;
            if (textarea && textarea.value) {
              return textarea.value;
            }

            // Look for hidden input
            const input = document.querySelector(
              'input[name="h-captcha-response"]',
            ) as HTMLInputElement;
            if (input && input.value) {
              return input.value;
            }

            // Look for g-recaptcha-response (hCAPTCHA sometimes uses this)
            const recaptchaTextarea = document.querySelector(
              'textarea[name="g-recaptcha-response"]',
            ) as HTMLTextAreaElement;
            if (recaptchaTextarea && recaptchaTextarea.value) {
              return recaptchaTextarea.value;
            }

            // Look for data attribute
            const widget = document.querySelector('[data-sitekey]');
            if (widget) {
              const response = widget.getAttribute('data-h-captcha-response');
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
        if (allowTimeout) {
          resolve('');
          return;
        }
        reject(new Error('Timeout waiting for hCAPTCHA token'));
      }, timeout);
    });
  }

  /**
   * Trigger callback function
   */
  private async triggerCallback(callbackName: string): Promise<void> {
    try {
      await this.page.evaluate((cbName) => {
        const callback = (window as any)[cbName];
        if (typeof callback === 'function') {
          callback();
        }
      }, callbackName);
      this.logger.debug(`Triggered callback: ${callbackName}`);
    } catch (error: any) {
      this.logger.warn(`Failed to trigger callback: ${error.message}`);
    }
  }

  /**
   * Submit form automatically
   */
  private async submitForm(): Promise<void> {
    try {
      await this.page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          form.submit();
        }
      });
      this.logger.debug('Submitted form automatically');
    } catch (error: any) {
      this.logger.warn(`Failed to submit form: ${error.message}`);
    }
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
   * Update transcription accuracy metric
   */
  private updateTranscriptionAccuracy(confidence: number): void {
    if (this.metrics.audioTranscriptionAccuracy === 0) {
      this.metrics.audioTranscriptionAccuracy = confidence;
    } else {
      this.metrics.audioTranscriptionAccuracy =
        this.metrics.audioTranscriptionAccuracy * 0.7 + confidence * 0.3;
    }
  }

  /**
   * Get solver metrics
   */
  getMetrics(): HcaptchaSolverMetrics {
    return { ...this.metrics };
  }
}

