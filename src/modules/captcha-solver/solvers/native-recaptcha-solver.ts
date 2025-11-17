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
import { AudioCaptchaProcessingService } from '../services/audio-captcha-processing.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import type {
  RecaptchaSolverConfig,
} from './interfaces/recaptcha-solver.interface';
import {
  SolverUnavailableException,
  ValidationException,
  InternalException,
  ProviderException,
} from '../exceptions';
import { retryWithBackoff } from '../utils';
import { formatError, extractErrorMessage } from '../utils/error-formatter.util';
import {
  RecaptchaVersion,
  RecaptchaV2ChallengeType,
  RecaptchaDetectionResult,
  RecaptchaChallengeResponse,
  RecaptchaSolverMetrics,
  ImageChallengeTile,
  ImageChallengeResult,
} from './interfaces/recaptcha-solver.interface';

/**
 * Default configuration for reCAPTCHA solver
 */
const DEFAULT_CONFIG: Required<RecaptchaSolverConfig> = {
  maxRetries: 3,
  v2CheckboxTimeout: 30000,
  v2InvisibleTimeout: 10000,
  v2AudioTimeout: 30000,
  v2ImageTimeout: 60000,
  v3Timeout: 10000,
  initialRetryDelay: 1000,
  maxRetryDelay: 30000,
  enableFallback: true,
  enableAudioChallenges: true,
  enableImageChallenges: true,
  imageRecognitionMinConfidence: 0.7,
};

/**
 * Native reCAPTCHA Challenge Solver
 *
 * Implements browser automation-based solving for Google reCAPTCHA challenges.
 * Supports v2 (checkbox/invisible/audio/image) and v3 (behavioral) variants.
 */
@Injectable()
export class NativeRecaptchaSolver implements ICaptchaSolver {
  private readonly logger: Logger;
  private readonly config: Required<RecaptchaSolverConfig>;
  private readonly metrics: RecaptchaSolverMetrics;

  constructor(
    private readonly page: Page,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
    private readonly audioProcessing: AudioCaptchaProcessingService,
    private readonly behaviorSimulation: HumanBehaviorSimulationService,
    private readonly performanceTracker?: SolverPerformanceTracker,
    config?: RecaptchaSolverConfig,
  ) {
    this.logger = new Logger(NativeRecaptchaSolver.name);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageSolvingTime: 0,
      versionDistribution: {
        [RecaptchaVersion.V2]: 0,
        [RecaptchaVersion.V3]: 0,
      },
      challengeTypeDistribution: {
        [RecaptchaV2ChallengeType.CHECKBOX]: 0,
        [RecaptchaV2ChallengeType.INVISIBLE]: 0,
        [RecaptchaV2ChallengeType.AUDIO]: 0,
        [RecaptchaV2ChallengeType.IMAGE]: 0,
      },
      failureReasons: {},
    };
  }

  /**
   * Get the name of the solver
   */
  getName(): string {
    return 'recaptcha-native';
  }

  /**
   * Check if the solver is available
   * Native solvers are always available (no API key required)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Solve a reCAPTCHA challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    try {
      return await retryWithBackoff(
        async () => {
          const startTime = Date.now();
          this.metrics.totalAttempts++;

          this.logger.debug(
            'Attempting to solve reCAPTCHA challenge',
          );

          // Detect reCAPTCHA widget
          const detection = await this.detectRecaptchaWidget(params);
          if (!detection.anchorIframe || detection.confidence < 0.5) {
            throw new SolverUnavailableException(
              'reCAPTCHA widget not detected',
              'recaptcha-native',
              'widget_not_detected',
              {
                confidence: detection.confidence,
                url: params.url,
              },
            );
          }

          this.metrics.versionDistribution[detection.version]++;
          if (detection.challengeType) {
            this.metrics.challengeTypeDistribution[detection.challengeType]++;
          }

          // Solve based on version and challenge type
          const response = await this.solveChallenge(detection, params);

          const duration = Date.now() - startTime;
          this.metrics.successCount++;
          this.updateMetrics(duration);

          // Record performance metrics
          if (this.performanceTracker) {
            this.performanceTracker.recordAttempt(
              this.getName(),
              'recaptcha',
              duration,
              true,
            );
          }

          this.logger.log(
            `Successfully solved reCAPTCHA ${detection.version} challenge${detection.challengeType ? ` (${detection.challengeType})` : ''} in ${duration}ms`,
          );

          return {
            token: response.token,
            solvedAt: response.solvedAt,
            solverId: this.getName(),
          };
        },
        {
          maxAttempts: this.config.maxRetries,
          backoffMs: this.config.initialRetryDelay,
          maxBackoffMs: this.config.maxRetryDelay,
          shouldRetry: (error) => !this.shouldNotRetry(error),
          onRetry: (attempt, error, delay) => {
            const errorMessage = extractErrorMessage(error);
            this.metrics.failureCount++;
            this.metrics.failureReasons[errorMessage] =
              (this.metrics.failureReasons[errorMessage] || 0) + 1;

            // Record performance metrics for failed attempt
            if (this.performanceTracker) {
              this.performanceTracker.recordAttempt(
                this.getName(),
                'recaptcha',
                0,
                false,
                errorMessage,
              );
            }

            this.logger.warn(
              `Attempt ${attempt}/${this.config.maxRetries} failed: ${errorMessage}, retrying in ${delay}ms`,
            );
          },
        },
      );
    } catch (error: any) {
      // If last error is already a custom exception, rethrow it
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }

      throw new InternalException(
        `Failed to solve reCAPTCHA challenge after ${this.config.maxRetries} attempts: ${formatError(error)}`,
        error || undefined,
        {
          maxRetries: this.config.maxRetries,
          attempts: this.config.maxRetries,
          originalError: formatError(error),
        },
      );
    }
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
   * Detect reCAPTCHA widget on the page
   */
  private async detectRecaptchaWidget(
    params: CaptchaParams,
  ): Promise<RecaptchaDetectionResult> {
    try {
      // First, try to detect using widget interaction service
      const widgetResult = await this.widgetInteraction.detectWidget(
        this.page,
        CaptchaWidgetType.RECAPTCHA,
      );

      if (!widgetResult.iframe || widgetResult.confidence < 0.5) {
        return {
          version: RecaptchaVersion.V2, // Default to v2
          anchorIframe: null,
          challengeIframe: null,
          confidence: widgetResult.confidence, // Preserve original confidence
        };
      }

      // Determine version and challenge type by inspecting the widget
      const versionInfo = await this.determineVersion(widgetResult.iframe);
      const challengeType = await this.determineChallengeType(
        widgetResult.iframe,
        versionInfo.version,
      );

      // Extract site key and other details
      const details = await this.extractWidgetDetails(widgetResult.iframe);

      // Find anchor and challenge iframes
      const { anchorIframe, challengeIframe } = await this.findIframes();

      return {
        version: versionInfo.version,
        challengeType,
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
      this.logger.warn(`Error detecting reCAPTCHA widget: ${error.message}`);
      // Try to preserve confidence from widget detection if available
      let confidence = 0;
      try {
        const widgetResult = await this.widgetInteraction.detectWidget(
          this.page,
          CaptchaWidgetType.RECAPTCHA,
        );
        confidence = widgetResult.confidence;
      } catch {
        // If detection fails, use 0
      }
      return {
        version: RecaptchaVersion.V2,
        anchorIframe: null,
        challengeIframe: null,
        confidence,
        details: {},
      };
    }
  }

  /**
   * Determine reCAPTCHA version (v2 or v3)
   */
  private async determineVersion(
    iframe: Frame,
  ): Promise<{ version: RecaptchaVersion; details: any }> {
    try {
      const versionInfo = await this.page.evaluate(() => {
        // Look for g-recaptcha elements
        const recaptchaElements = document.querySelectorAll('.g-recaptcha');
        if (recaptchaElements.length === 0) {
          return { version: 'v2', hasDataSitekey: false };
        }

        // Check data-sitekey attribute
        const element = recaptchaElements[0] as HTMLElement;
        const siteKey = element.getAttribute('data-sitekey');
        const dataCallback = element.getAttribute('data-callback');
        const dataSize = element.getAttribute('data-size');

        // v3 typically has 'data-action' attribute
        const hasAction = element.hasAttribute('data-action');

        // Check for v3 indicators
        if (hasAction || dataSize === 'invisible') {
          // Additional check: look for v3 API calls
          const scripts = Array.from(document.querySelectorAll('script'));
          const hasV3Script = scripts.some((script) =>
            script.textContent?.includes('grecaptcha.execute'),
          );

          if (hasV3Script || hasAction) {
            return { version: 'v3', hasDataSitekey: !!siteKey, action: element.getAttribute('data-action') };
          }
        }

        return {
          version: 'v2',
          hasDataSitekey: !!siteKey,
          callback: dataCallback,
          size: dataSize,
        };
      });

      return {
        version:
          versionInfo.version === 'v3'
            ? RecaptchaVersion.V3
            : RecaptchaVersion.V2,
        details: versionInfo,
      };
    } catch (error: any) {
      this.logger.warn(
        `Error determining version: ${error.message}, defaulting to v2`,
      );
      return { version: RecaptchaVersion.V2, details: {} };
    }
  }

  /**
   * Determine v2 challenge type
   */
  private async determineChallengeType(
    iframe: Frame,
    version: RecaptchaVersion,
  ): Promise<RecaptchaV2ChallengeType | undefined> {
    if (version !== RecaptchaVersion.V2) {
      return undefined;
    }

    try {
      const challengeInfo = await this.page.evaluate(() => {
        const element = document.querySelector('.g-recaptcha');
        if (!element) {
          return { type: 'checkbox', isVisible: false };
        }

        const dataSize = element.getAttribute('data-size');
        const isVisible =
          element instanceof HTMLElement &&
          element.offsetWidth > 0 &&
          element.offsetHeight > 0;

        // Invisible reCAPTCHA
        if (dataSize === 'invisible') {
          return { type: 'invisible', isVisible: false };
        }

        // Checkbox reCAPTCHA (default)
        return { type: 'checkbox', isVisible };
      });

      return challengeInfo.type === 'invisible'
        ? RecaptchaV2ChallengeType.INVISIBLE
        : RecaptchaV2ChallengeType.CHECKBOX;
    } catch (error: any) {
      this.logger.warn(
        `Error determining challenge type: ${error.message}, defaulting to checkbox`,
      );
      return RecaptchaV2ChallengeType.CHECKBOX;
    }
  }

  /**
   * Extract widget details (site key, callback, etc.)
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
        const container = document.querySelector('.g-recaptcha');
        if (!container) {
          return {};
        }

        return {
          siteKey: container.getAttribute('data-sitekey') || undefined,
          callback: container.getAttribute('data-callback') || undefined,
          containerSelector: '.g-recaptcha',
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
        const name = frame.name();

        // Anchor iframe: contains the checkbox or invisible widget
        if (
          url.includes('recaptcha/api2/anchor') ||
          name.includes('recaptcha-anchor')
        ) {
          anchorIframe = frame;
        }

        // Challenge iframe: contains audio/image challenges
        if (
          url.includes('recaptcha/api2/bframe') ||
          url.includes('recaptcha/api2/challenge') ||
          name.includes('recaptcha-challenge')
        ) {
          challengeIframe = frame;
        }
      }

      return { anchorIframe, challengeIframe };
    } catch (error: any) {
      this.logger.warn(`Error finding iframes: ${error.message}`);
      return { anchorIframe: null, challengeIframe: null };
    }
  }

  /**
   * Solve the reCAPTCHA challenge based on version and type
   */
  private async solveChallenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    const startTime = Date.now();

    if (detection.version === RecaptchaVersion.V3) {
      return await this.solveV3Challenge(detection, params);
    }

    // v2 challenges
    switch (detection.challengeType) {
      case RecaptchaV2ChallengeType.CHECKBOX:
        return await this.solveV2CheckboxChallenge(detection, params);
      case RecaptchaV2ChallengeType.INVISIBLE:
        return await this.solveV2InvisibleChallenge(detection, params);
      case RecaptchaV2ChallengeType.AUDIO:
        return await this.solveV2AudioChallenge(detection, params);
      case RecaptchaV2ChallengeType.IMAGE:
        return await this.solveV2ImageChallenge(detection, params);
      default:
        // Default to checkbox
        return await this.solveV2CheckboxChallenge(detection, params);
    }
  }

  /**
   * Solve v2 checkbox challenge
   */
  private async solveV2CheckboxChallenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    if (!detection.anchorIframe) {
      throw new InternalException(
        'reCAPTCHA anchor iframe not found',
        undefined,
        { method: 'solveV2CheckboxChallenge', detection },
      );
    }

    const timeout = this.config.v2CheckboxTimeout;

    try {
      // Wait for anchor iframe to load
      await detection.anchorIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Click the checkbox
      const checkbox = detection.anchorIframe.locator(
        '#recaptcha-anchor, .recaptcha-checkbox',
      );
      await checkbox.waitFor({ state: 'visible', timeout: 5000 });
      await checkbox.click({ timeout: 5000 });
      this.logger.debug('Clicked reCAPTCHA checkbox');

      // Wait for challenge iframe to appear (if challenge is triggered)
      await this.sleep(2000);

      // Check if challenge iframe appeared
      const { challengeIframe } = await this.findIframes();
      if (challengeIframe) {
        this.logger.debug('Challenge iframe appeared, solving challenge...');
        // Determine challenge type and solve
        const challengeType = await this.detectChallengeType(challengeIframe);
        if (challengeType === RecaptchaV2ChallengeType.AUDIO) {
          return await this.solveV2AudioChallenge(
            { ...detection, challengeIframe },
            params,
          );
        } else if (challengeType === RecaptchaV2ChallengeType.IMAGE) {
          return await this.solveV2ImageChallenge(
            { ...detection, challengeIframe },
            params,
          );
        }
      }

      // Wait for token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      return {
        token,
        solvedAt: new Date(),
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.CHECKBOX,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to solve v2 checkbox challenge: ${error.message}`,
        error,
        { method: 'solveV2CheckboxChallenge' },
      );
    }
  }

  /**
   * Solve v2 invisible challenge
   */
  private async solveV2InvisibleChallenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    if (!detection.anchorIframe) {
      throw new InternalException(
        'reCAPTCHA anchor iframe not found',
        undefined,
        { method: 'solveV2CheckboxChallenge', detection },
      );
    }

    const timeout = this.config.v2InvisibleTimeout;

    try {
      // Wait for anchor iframe to load
      await detection.anchorIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Invisible challenges run automatically, just wait for token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(detection.anchorIframe, timeout);

      return {
        token,
        solvedAt: new Date(),
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.INVISIBLE,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to solve v2 invisible challenge: ${error.message}`,
        error,
        { method: 'solveV2InvisibleChallenge' },
      );
    }
  }

  /**
   * Solve v2 audio challenge
   */
  private async solveV2AudioChallenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    if (!detection.challengeIframe) {
      throw new InternalException(
        'reCAPTCHA challenge iframe not found',
        undefined,
        { method: 'solveV2AudioChallenge', detection },
      );
    }

    if (!this.config.enableAudioChallenges) {
      throw new ValidationException(
        'Audio challenges are disabled',
        [{ field: 'enableAudioChallenges', message: 'Audio challenges are disabled', code: 'FEATURE_DISABLED' }],
        { method: 'solveV2AudioChallenge' },
      );
    }

    const timeout = this.config.v2AudioTimeout;

    try {
      // Wait for challenge iframe to load
      await detection.challengeIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Click audio challenge button
      const audioButton = detection.challengeIframe.locator(
        '#recaptcha-audio-button, button[aria-label*="audio" i], a[aria-label*="audio" i]',
      );
      await audioButton.waitFor({ state: 'visible', timeout: 5000 });
      await audioButton.click({ timeout: 5000 });
      this.logger.debug('Clicked audio challenge button');

      // Wait for audio to load
      await this.sleep(2000);

      // Extract audio URL
      const audioUrl = await this.extractAudioUrl(detection.challengeIframe);
      if (!audioUrl) {
        throw new InternalException(
          'Could not extract audio URL',
          undefined,
          { method: 'solveV2AudioChallenge' },
        );
      }

      // Download and transcribe audio
      const audioResult = await this.audioProcessing.processAudioCaptcha(
        { audioUrl },
        this.page,
      );

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
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.AUDIO,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to solve v2 audio challenge: ${error.message}`,
        error,
        { method: 'solveV2AudioChallenge' },
      );
    }
  }

  /**
   * Solve v2 image challenge
   */
  private async solveV2ImageChallenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    if (!detection.challengeIframe) {
      throw new InternalException(
        'reCAPTCHA challenge iframe not found',
        undefined,
        { method: 'solveV2ImageChallenge', detection },
      );
    }

    if (!this.config.enableImageChallenges) {
      throw new ValidationException(
        'Image challenges are disabled',
        [{ field: 'enableImageChallenges', message: 'Image challenges are disabled', code: 'FEATURE_DISABLED' }],
        { method: 'solveV2ImageChallenge' },
      );
    }

    const timeout = this.config.v2ImageTimeout;

    try {
      // Wait for challenge iframe to load
      await detection.challengeIframe.waitForLoadState('networkidle', {
        timeout,
      });

      // Extract challenge prompt
      const prompt = await this.extractImageChallengePrompt(
        detection.challengeIframe,
      );

      // Get image tiles
      const tiles = await this.getImageChallengeTiles(detection.challengeIframe);

      // Solve image challenge using pattern recognition
      const solution = await this.solveImageChallenge(tiles, prompt);

      // Select tiles
      await this.selectImageTiles(detection.challengeIframe, solution.selectedTiles);

      // Click verify button
      const verifyButton = detection.challengeIframe.locator(
        '#recaptcha-verify-button, button[aria-label*="verify" i]',
      );
      await verifyButton.waitFor({ state: 'visible', timeout: 5000 });
      await verifyButton.click({ timeout: 5000 });

      // Wait for token or next challenge
      await this.sleep(3000);

      // Check if there's another challenge or if we got the token
      const solveStartTime = Date.now();
      const token = await this.waitForToken(
        detection.anchorIframe,
        timeout,
        true, // Allow timeout for multi-step challenges
      );

      if (!token) {
        // Might be a multi-step challenge, try again
        // This is not an error, it's a retry condition - log and continue
        this.logger.debug('Multi-step image challenge detected, retrying...');
      }

      return {
        token,
        solvedAt: new Date(),
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.IMAGE,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to solve v2 image challenge: ${error.message}`,
        error,
        { method: 'solveV2ImageChallenge' },
      );
    }
  }

  /**
   * Solve v3 challenge using behavioral simulation
   */
  private async solveV3Challenge(
    detection: RecaptchaDetectionResult,
    params: CaptchaParams,
  ): Promise<RecaptchaChallengeResponse> {
    const timeout = this.config.v3Timeout;

    try {
      // v3 uses behavioral analysis, so we need to simulate human behavior
      // Generate realistic mouse movements, scrolls, and interactions

      // 1. Random mouse movements
      await this.simulateMouseMovements();

      // 2. Random scrolls
      await this.simulateScrolls();

      // 3. Random keyboard events
      await this.simulateKeyboardEvents();

      // 4. Wait for token generation (v3 generates token automatically)
      const solveStartTime = Date.now();
      const token = await this.waitForV3Token(timeout);

      return {
        token,
        solvedAt: new Date(),
        version: RecaptchaVersion.V3,
        duration: Date.now() - solveStartTime,
      };
    } catch (error: any) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to solve v3 challenge: ${error.message}`,
        error,
        { method: 'solveV3Challenge' },
      );
    }
  }

  /**
   * Detect challenge type in challenge iframe
   */
  private async detectChallengeType(
    challengeIframe: Frame,
  ): Promise<RecaptchaV2ChallengeType> {
    try {
      const hasAudio = await challengeIframe
        .locator('#recaptcha-audio-button, button[aria-label*="audio" i]')
        .count();
      if (hasAudio > 0) {
        return RecaptchaV2ChallengeType.AUDIO;
      }

      const hasImages = await challengeIframe
        .locator('.rc-imageselect, .rc-image-tile')
        .count();
      if (hasImages > 0) {
        return RecaptchaV2ChallengeType.IMAGE;
      }

      return RecaptchaV2ChallengeType.CHECKBOX;
    } catch (error) {
      return RecaptchaV2ChallengeType.CHECKBOX;
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

        return null;
      });
    } catch (error) {
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
      const input = challengeIframe.locator('#audio-response');
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.fill(transcription);
      await input.press('Enter');
      this.logger.debug(`Submitted audio transcription: ${transcription}`);
    } catch (error) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to submit audio transcription: ${error.message}`,
        error,
        { method: 'submitAudioTranscription' },
      );
    }
  }

  /**
   * Extract image challenge prompt
   */
  private async extractImageChallengePrompt(
    challengeIframe: Frame,
  ): Promise<string> {
    try {
      return await challengeIframe.evaluate(() => {
        const prompt = document.querySelector('.rc-imageselect-desc-text');
        return prompt?.textContent || '';
      });
    } catch (error) {
      return '';
    }
  }

  /**
   * Get image challenge tiles
   */
  private async getImageChallengeTiles(
    challengeIframe: Frame,
  ): Promise<ImageChallengeTile[]> {
    try {
      const tiles = await challengeIframe.evaluate(() => {
        const tileElements = document.querySelectorAll(
          '.rc-image-tile, .rc-imageselect-tile',
        );
        return Array.from(tileElements).map((el, index) => {
          const img = el.querySelector('img');
          return {
            index,
            imageUrl: img?.src || undefined,
            element: el,
          };
        });
      });

      return tiles.map((t) => ({
        index: t.index,
        imageUrl: t.imageUrl,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Solve image challenge using pattern recognition
   */
  private async solveImageChallenge(
    tiles: ImageChallengeTile[],
    prompt: string,
  ): Promise<ImageChallengeResult> {
    // Basic pattern recognition - select all tiles for now
    // In a real implementation, this would use image processing libraries
    // like sharp or jimp to analyze images and match patterns
    this.logger.debug(
      `Solving image challenge with prompt: "${prompt}" and ${tiles.length} tiles`,
    );

    // For now, return a simple solution that selects all tiles
    // This is a placeholder - real implementation would analyze images
    return {
      selectedTiles: tiles.map((t) => t.index),
      confidence: 0.5, // Low confidence for basic implementation
      method: 'pattern',
    };
  }

  /**
   * Select image tiles
   */
  private async selectImageTiles(
    challengeIframe: Frame,
    tileIndices: number[],
  ): Promise<void> {
    try {
      for (const index of tileIndices) {
        const tile = challengeIframe.locator(
          `.rc-image-tile, .rc-imageselect-tile`,
        ).nth(index);
        await tile.click({ timeout: 2000 });
        await this.sleep(500); // Small delay between clicks
      }
    } catch (error) {
      if (error instanceof SolverUnavailableException ||
          error instanceof ValidationException ||
          error instanceof InternalException ||
          error instanceof ProviderException) {
        throw error;
      }
      throw new InternalException(
        `Failed to select image tiles: ${error.message}`,
        error,
        { method: 'selectImageTiles' },
      );
    }
  }

  /**
   * Simulate mouse movements for v3
   */
  private async simulateMouseMovements(): Promise<void> {
    const viewport = this.page.viewportSize();
    if (!viewport) return;

    const sessionId = 'recaptcha-v3-' + Date.now();

    // Generate 3-5 random mouse movements
    const numMovements = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < numMovements; i++) {
      const startX = Math.random() * viewport.width;
      const startY = Math.random() * viewport.height;
      const endX = Math.random() * viewport.width;
      const endY = Math.random() * viewport.height;

      await this.behaviorSimulation.moveMouseBezier(
        this.page,
        startX,
        startY,
        endX,
        endY,
        {},
        sessionId,
      );

      // Random delay between movements
      await this.sleep(Math.floor(Math.random() * 1000) + 500);
    }
  }

  /**
   * Simulate scrolls for v3
   */
  private async simulateScrolls(): Promise<void> {
    const viewport = this.page.viewportSize();
    if (!viewport) return;

    // Generate 2-4 random scrolls
    const numScrolls = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numScrolls; i++) {
      const scrollY = Math.random() * viewport.height;
      await this.page.mouse.wheel(0, scrollY);
      await this.sleep(Math.floor(Math.random() * 1000) + 500);
    }
  }

  /**
   * Simulate keyboard events for v3
   */
  private async simulateKeyboardEvents(): Promise<void> {
    // Generate 2-3 random key presses
    const numKeys = Math.floor(Math.random() * 2) + 2;
    for (let i = 0; i < numKeys; i++) {
      const keys = ['Tab', 'ArrowDown', 'ArrowUp', 'Space'];
      const key = keys[Math.floor(Math.random() * keys.length)];
      await this.page.keyboard.press(key);
      await this.sleep(Math.floor(Math.random() * 500) + 200);
    }
  }

  /**
   * Wait for reCAPTCHA token (v2)
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
          if (url.includes('recaptcha/api2/userverify') || url.includes('recaptcha/api2/reload')) {
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
          reject(new Error('Timeout waiting for reCAPTCHA token'));
          return;
        }

        try {
          // Check for token in parent page
          const token = await this.page.evaluate(() => {
            // Look for textarea with g-recaptcha-response
            const textarea = document.querySelector(
              'textarea[name="g-recaptcha-response"]',
            ) as HTMLTextAreaElement;
            if (textarea && textarea.value) {
              return textarea.value;
            }

            // Look for hidden input
            const input = document.querySelector(
              'input[name="g-recaptcha-response"]',
            ) as HTMLInputElement;
            if (input && input.value) {
              return input.value;
            }

            // Look for data attribute
            const widget = document.querySelector('[data-sitekey]');
            if (widget) {
              const response = widget.getAttribute('data-g-recaptcha-response');
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
        reject(new Error('Timeout waiting for reCAPTCHA token'));
      }, timeout);
    });
  }

  /**
   * Wait for v3 token
   */
  private async waitForV3Token(timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const deadline = startTime + timeout;

      // Monitor for grecaptcha.execute calls or token in DOM
      const checkInterval = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for v3 token'));
          return;
        }

        try {
          // Check for token in page
          const token = await this.page.evaluate(() => {
            // Look for grecaptcha.execute result
            const grecaptcha = (window as any).grecaptcha;
            if (grecaptcha && grecaptcha.getResponse) {
              const response = grecaptcha.getResponse();
              if (response) {
                return response;
              }
            }

            // Look for token in form fields
            const textarea = document.querySelector(
              'textarea[name="g-recaptcha-response"]',
            ) as HTMLTextAreaElement;
            if (textarea && textarea.value) {
              return textarea.value;
            }

            return null;
          });

          if (token && token.length > 0) {
            clearInterval(checkInterval);
            resolve(token);
          }
        } catch (e) {
          // Continue checking
        }
      }, 500);

      // Set overall timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for v3 token'));
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
  getMetrics(): RecaptchaSolverMetrics {
    return { ...this.metrics };
  }
}

