import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import { DetectionService } from './detection.service';
import { SolverFactory } from '../factories/solver-factory.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { CostTrackingService } from './cost-tracking.service';
import { ProviderRegistryService } from './provider-registry.service';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
  AntiBotDetection,
} from '../interfaces/captcha-solver.interface';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
} from '../interfaces/detection.interface';

/**
 * Configuration for solver orchestration
 */
export interface OrchestrationConfig {
  /** Maximum retry attempts per solver type */
  maxRetries?: Record<string, number>;
  /** Timeout durations per solver type (in milliseconds) */
  timeouts?: Record<string, number>;
  /** Minimum confidence threshold for detection (0-1) */
  minConfidence?: number;
  /** Enable/disable 3rd party fallback */
  enableThirdPartyFallback?: boolean;
  /** Priority order for solver types */
  solverPriority?: string[];
}

/**
 * Result of orchestration attempt
 */
export interface OrchestrationResult {
  /** Whether the challenge was successfully solved */
  solved: boolean;
  /** The solution token if solved */
  solution?: CaptchaSolution;
  /** Detection results */
  detection?: AntiBotDetectionResult;
  /** Solver type used (if solved) */
  solverType?: string;
  /** Total duration in milliseconds */
  duration: number;
  /** Number of attempts made */
  attempts: number;
  /** Error message if failed */
  error?: string;
  /** Whether 3rd party provider was used */
  usedThirdParty?: boolean;
}

/**
 * Service for orchestrating captcha detection and solving
 * Coordinates between detection, solver selection, and solving attempts
 */
@Injectable()
export class SolverOrchestrationService {
  private readonly logger = new Logger(SolverOrchestrationService.name);
  private readonly defaultConfig: Required<OrchestrationConfig>;

  constructor(
    private readonly detectionService: DetectionService,
    private readonly solverFactory: SolverFactory,
    private readonly performanceTracker: SolverPerformanceTracker,
    private readonly costTracking: CostTrackingService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly configService: ConfigService,
  ) {
    // Load default configuration from environment variables
    this.defaultConfig = {
      maxRetries: this.loadRetryConfig(),
      timeouts: this.loadTimeoutConfig(),
      minConfidence: this.configService.get<number>(
        'CAPTCHA_MIN_CONFIDENCE',
        0.5,
      ),
      enableThirdPartyFallback: this.configService.get<boolean>(
        'CAPTCHA_ENABLE_THIRD_PARTY_FALLBACK',
        true,
      ),
      solverPriority: this.configService.get<string[]>(
        'CAPTCHA_SOLVER_PRIORITY',
        ['native', '2captcha', 'anticaptcha'],
      ),
    };
  }

  /**
   * Main orchestration method: detect and solve challenges
   */
  async detectAndSolve(
    page: Page,
    config?: OrchestrationConfig,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };
    let attempts = 0;

    try {
      // Step 1: Detect anti-bot systems
      this.logger.log('Starting detection phase...');
      const detectionResult = await this.detectChallenge(page, finalConfig);

      if (!detectionResult.detected) {
        this.logger.log('No anti-bot system detected');
        return {
          solved: true,
          duration: Date.now() - startTime,
          attempts: 0,
        };
      }

      this.logger.log(
        `Detected ${detectionResult.type} with confidence ${detectionResult.confidence.toFixed(2)}`,
      );

      // Step 2: Map detection to challenge type
      const challengeType = this.mapDetectionToChallengeType(
        detectionResult.type!,
      );

      if (!challengeType) {
        return {
          solved: false,
          detection: detectionResult,
          duration: Date.now() - startTime,
          attempts: 0,
          error: `Unsupported anti-bot system: ${detectionResult.type}`,
        };
      }

      // Step 3: Solve the challenge
      this.logger.log(`Attempting to solve ${challengeType} challenge...`);
      const solveResult = await this.solveChallenge(
        page,
        challengeType,
        detectionResult,
        finalConfig,
      );

      return {
        solved: solveResult.solved,
        solution: solveResult.solution,
        detection: detectionResult,
        solverType: solveResult.solverType,
        duration: Date.now() - startTime,
        attempts: solveResult.attempts,
        usedThirdParty: solveResult.usedThirdParty,
        error: solveResult.error,
      };
    } catch (error: any) {
      this.logger.error(`Orchestration failed: ${error.message}`, {
        error: error.stack,
      });
      return {
        solved: false,
        duration: Date.now() - startTime,
        attempts,
        error: error.message,
      };
    }
  }

  /**
   * Detect challenges on the page
   */
  private async detectChallenge(
    page: Page,
    config: Required<OrchestrationConfig>,
  ): Promise<AntiBotDetectionResult> {
    const detectionResult = await this.detectionService.detectAll(page, {
      minConfidence: config.minConfidence,
    });

    // Get the primary detection (highest confidence)
    if (detectionResult.primary) {
      return detectionResult.primary;
    }

    // If no primary, return first detection or create "not detected" result
    if (detectionResult.detections.length > 0) {
      return detectionResult.detections[0];
    }

    // Return "not detected" result
    return {
      detected: false,
      type: null,
      confidence: 0,
      details: {},
      detectedAt: new Date(),
      durationMs: detectionResult.totalDurationMs,
    };
  }

  /**
   * Map anti-bot system type to challenge type
   */
  private mapDetectionToChallengeType(
    systemType: AntiBotSystemType,
  ): CaptchaParams['type'] | null {
    const mapping: Record<AntiBotSystemType, CaptchaParams['type'] | null> =
      {
        [AntiBotSystemType.CLOUDFLARE]: 'recaptcha', // Cloudflare uses Turnstile/reCAPTCHA
        [AntiBotSystemType.DATADOME]: 'datadome',
        [AntiBotSystemType.AKAMAI]: null, // Akamai doesn't map directly
        [AntiBotSystemType.IMPERVA]: null, // Imperva doesn't map directly
        [AntiBotSystemType.RECAPTCHA]: 'recaptcha',
        [AntiBotSystemType.HCAPTCHA]: 'hcaptcha',
        [AntiBotSystemType.UNKNOWN]: null,
      };

    return mapping[systemType] || null;
  }

  /**
   * Solve a challenge with retry logic and fallback
   */
  private async solveChallenge(
    page: Page,
    challengeType: CaptchaParams['type'],
    detection: AntiBotDetectionResult,
    config: Required<OrchestrationConfig>,
  ): Promise<{
    solved: boolean;
    solution?: CaptchaSolution;
    solverType?: string;
    attempts: number;
    usedThirdParty?: boolean;
    error?: string;
  }> {
    let attempts = 0;
    const maxRetries = config.maxRetries[challengeType] || 3;

    // Step 1: Try built-in native solvers first
    this.logger.log('Attempting with built-in native solvers...');
    const nativeResult = await this.tryNativeSolvers(
      page,
      challengeType,
      detection,
      config,
      maxRetries,
    );

    if (nativeResult.solved) {
      return {
        ...nativeResult,
        attempts: nativeResult.attempts,
        usedThirdParty: false,
      };
    }

    attempts += nativeResult.attempts;

    // Step 2: Fallback to 3rd party providers if enabled
    if (config.enableThirdPartyFallback) {
      this.logger.log('Native solvers failed, attempting 3rd party fallback...');
      const thirdPartyResult = await this.tryThirdPartyProviders(
        page,
        challengeType,
        detection,
        config,
        maxRetries,
      );

      if (thirdPartyResult.solved) {
        return {
          ...thirdPartyResult,
          attempts: attempts + thirdPartyResult.attempts,
          usedThirdParty: true,
        };
      }

      attempts += thirdPartyResult.attempts;
    }

    return {
      solved: false,
      attempts,
      error: `All solving attempts failed after ${attempts} attempts`,
    };
  }

  /**
   * Try native solvers with retry logic
   */
  private async tryNativeSolvers(
    page: Page,
    challengeType: CaptchaParams['type'],
    detection: AntiBotDetectionResult,
    config: Required<OrchestrationConfig>,
    maxRetries: number,
  ): Promise<{
    solved: boolean;
    solution?: CaptchaSolution;
    solverType?: string;
    attempts: number;
    error?: string;
  }> {
    const timeout = config.timeouts[challengeType] || 30000;
    let attempts = 0;

    // Get available native solvers (those registered in the factory)
    const availableSolvers = this.solverFactory.getAvailableSolvers(
      challengeType,
    );

    // Filter to only native solvers (exclude 3rd party)
    const nativeSolvers = availableSolvers.filter(
      (solver) =>
        !solver.includes('2captcha') &&
        !solver.includes('anticaptcha') &&
        !solver.includes('third-party'),
    );

    if (nativeSolvers.length === 0) {
      this.logger.warn('No native solvers available');
      return { solved: false, attempts: 0, error: 'No native solvers available' };
    }

    // Try each native solver with retries
    for (const solverType of nativeSolvers) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attempts++;
        const attemptStartTime = Date.now();

        try {
          this.logger.log(
            `Attempt ${attempt}/${maxRetries} with native solver: ${solverType}`,
          );

          const solver = this.solverFactory.createSolver(solverType, page);
          if (!solver) {
            this.logger.warn(`Failed to create solver: ${solverType}`);
            continue;
          }

          // Create captcha params from detection
          const params = this.createCaptchaParams(page, challengeType, detection);

          // Execute with timeout
          const solution = await Promise.race([
            solver.solve(params),
            this.createTimeoutPromise(timeout),
          ]);

          const duration = Date.now() - attemptStartTime;

          // Record success
          this.performanceTracker.recordAttempt(
            solverType,
            challengeType,
            duration,
            true,
          );

          this.logger.log(
            `Successfully solved with ${solverType} in ${duration}ms`,
          );

          return {
            solved: true,
            solution,
            solverType,
            attempts,
          };
        } catch (error: any) {
          const duration = Date.now() - attemptStartTime;
          const errorMessage =
            error.message || 'Unknown error during solving';

          this.logger.warn(
            `Attempt ${attempt} failed with ${solverType}: ${errorMessage}`,
          );

          // Record failure
          this.performanceTracker.recordAttempt(
            solverType,
            challengeType,
            duration,
            false,
            errorMessage,
          );

          // If this is the last attempt for this solver, try next solver
          if (attempt === maxRetries) {
            break;
          }

          // Exponential backoff
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(backoffDelay);
        }
      }
    }

    return {
      solved: false,
      attempts,
      error: 'All native solver attempts failed',
    };
  }

  /**
   * Try 3rd party providers with retry logic
   */
  private async tryThirdPartyProviders(
    page: Page,
    challengeType: CaptchaParams['type'],
    detection: AntiBotDetectionResult,
    config: Required<OrchestrationConfig>,
    maxRetries: number,
  ): Promise<{
    solved: boolean;
    solution?: CaptchaSolution;
    solverType?: string;
    attempts: number;
    error?: string;
  }> {
    const timeout = config.timeouts[challengeType] || 60000; // Longer timeout for 3rd party
    let attempts = 0;

    // Get available 3rd party providers
    const availableProviders = await this.providerRegistry.getAvailableProviders();
    const availableProviderNames = availableProviders.map((p) => p.getName());
    const providerNames = config.solverPriority.filter((name) =>
      availableProviderNames.includes(name),
    );

    if (providerNames.length === 0) {
      this.logger.warn('No 3rd party providers available');
      return {
        solved: false,
        attempts: 0,
        error: 'No 3rd party providers available',
      };
    }

    // Try each provider with retries
    for (const providerName of providerNames) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attempts++;
        const attemptStartTime = Date.now();

        try {
          this.logger.log(
            `Attempt ${attempt}/${maxRetries} with 3rd party provider: ${providerName}`,
          );

          const provider = this.providerRegistry.getProvider(providerName);
          if (!provider) {
            this.logger.warn(`Provider not available: ${providerName}`);
            continue;
          }

          // Check if provider is available
          const isAvailable = await provider.isAvailable();
          if (!isAvailable) {
            this.logger.warn(`Provider ${providerName} is not available`);
            continue;
          }

          // Create captcha params
          const params = this.createCaptchaParams(page, challengeType, detection);

          // Execute with timeout
          const solution = await Promise.race([
            provider.solve(params),
            this.createTimeoutPromise(timeout),
          ]);

          const duration = Date.now() - attemptStartTime;

          // Record success and cost
          this.performanceTracker.recordAttempt(
            providerName,
            challengeType,
            duration,
            true,
          );
          this.costTracking.recordSuccess(providerName, challengeType);

          this.logger.log(
            `Successfully solved with ${providerName} in ${duration}ms`,
          );

          return {
            solved: true,
            solution,
            solverType: providerName,
            attempts,
          };
        } catch (error: any) {
          const duration = Date.now() - attemptStartTime;
          const errorMessage =
            error.message || 'Unknown error during solving';

          this.logger.warn(
            `Attempt ${attempt} failed with ${providerName}: ${errorMessage}`,
          );

          // Record failure
          this.performanceTracker.recordAttempt(
            providerName,
            challengeType,
            duration,
            false,
            errorMessage,
          );

          // If this is the last attempt for this provider, try next provider
          if (attempt === maxRetries) {
            break;
          }

          // Exponential backoff
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(backoffDelay);
        }
      }
    }

    return {
      solved: false,
      attempts,
      error: 'All 3rd party provider attempts failed',
    };
  }

  /**
   * Create captcha params from detection result
   */
  private createCaptchaParams(
    page: Page,
    challengeType: CaptchaParams['type'],
    detection: AntiBotDetectionResult,
  ): CaptchaParams {
    const url = page.url();

    // Extract sitekey from detection details if available
    const sitekey =
      detection.details?.sitekey ||
      detection.details?.siteKey ||
      detection.details?.dataSitekey;

    const params: CaptchaParams = {
      type: challengeType,
      url,
      sitekey,
    };

    // Add version for reCAPTCHA if detected
    if (challengeType === 'recaptcha') {
      const version = detection.details?.version || 'v2';
      params.version = version as 'v2' | 'v3';
      if (version === 'v3') {
        params.action = detection.details?.action || 'verify';
      }
    }

    return params;
  }

  /**
   * Create a timeout promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Solver timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load retry configuration from environment
   */
  private loadRetryConfig(): Record<string, number> {
    const defaults: Record<string, number> = {
      recaptcha: 3,
      hcaptcha: 3,
      datadome: 3,
      funcaptcha: 3,
    };

    // Try to load from environment
    const envRetries = this.configService.get<string>(
      'CAPTCHA_MAX_RETRIES',
      '',
    );

    if (envRetries) {
      try {
        const parsed = JSON.parse(envRetries);
        return { ...defaults, ...parsed };
      } catch (error) {
        this.logger.warn('Failed to parse CAPTCHA_MAX_RETRIES, using defaults');
      }
    }

    return defaults;
  }

  /**
   * Load timeout configuration from environment
   */
  private loadTimeoutConfig(): Record<string, number> {
    const defaults: Record<string, number> = {
      recaptcha: 30000, // 30 seconds
      hcaptcha: 30000,
      datadome: 45000, // 45 seconds (DataDome can be slower)
      funcaptcha: 30000,
    };

    // Try to load from environment
    const envTimeouts = this.configService.get<string>(
      'CAPTCHA_TIMEOUTS',
      '',
    );

    if (envTimeouts) {
      try {
        const parsed = JSON.parse(envTimeouts);
        // Convert seconds to milliseconds if needed
        const converted: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed)) {
          converted[key] =
            typeof value === 'number' && value < 1000 ? value * 1000 : value;
        }
        return { ...defaults, ...converted };
      } catch (error) {
        this.logger.warn('Failed to parse CAPTCHA_TIMEOUTS, using defaults');
      }
    }

    return defaults;
  }
}

