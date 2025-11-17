import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CaptchaSolverConfig,
  DEFAULT_CONFIG,
  CONFIG_ENV_KEYS,
} from './constants';

/**
 * Service for loading and managing captcha-solver configuration
 * Loads configuration from environment variables with fallback to defaults
 */
@Injectable()
export class CaptchaSolverConfigService {
  private config: CaptchaSolverConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfiguration();
  }

  /**
   * Get the complete configuration
   */
  getConfig(): CaptchaSolverConfig {
    return this.config;
  }

  /**
   * Get circuit breaker configuration
   */
  getCircuitBreakerConfig() {
    return this.config.circuitBreaker;
  }

  /**
   * Get cache configuration
   */
  getCacheConfig() {
    return this.config.cache;
  }

  /**
   * Get retry configuration
   */
  getRetryConfig() {
    return this.config.retry;
  }

  /**
   * Get timeout configuration
   */
  getTimeoutConfig() {
    return this.config.timeouts;
  }

  /**
   * Get solver-specific timeout configuration
   */
  getSolverTimeoutConfig() {
    return this.config.solverTimeouts;
  }

  /**
   * Get provider configuration
   */
  getProviderConfig() {
    return this.config.provider;
  }

  /**
   * Get detection configuration
   */
  getDetectionConfig() {
    return this.config.detection;
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private loadConfiguration(): CaptchaSolverConfig {
    return {
      circuitBreaker: {
        failureThreshold:
          this.getNumber(
            CONFIG_ENV_KEYS.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            DEFAULT_CONFIG.circuitBreaker.failureThreshold,
          ) || DEFAULT_CONFIG.circuitBreaker.failureThreshold,
        timeoutPeriod:
          this.getNumber(
            CONFIG_ENV_KEYS.CIRCUIT_BREAKER_TIMEOUT_PERIOD,
            DEFAULT_CONFIG.circuitBreaker.timeoutPeriod,
          ) || DEFAULT_CONFIG.circuitBreaker.timeoutPeriod,
      },
      cache: {
        ttl:
          this.getNumber(
            CONFIG_ENV_KEYS.CACHE_TTL,
            DEFAULT_CONFIG.cache.ttl,
          ) || DEFAULT_CONFIG.cache.ttl,
      },
      retry: {
        maxAttempts:
          this.getNumber(
            CONFIG_ENV_KEYS.RETRY_MAX_ATTEMPTS,
            DEFAULT_CONFIG.retry.maxAttempts,
          ) || DEFAULT_CONFIG.retry.maxAttempts,
        backoffMs:
          this.getNumber(
            CONFIG_ENV_KEYS.RETRY_BACKOFF_MS,
            DEFAULT_CONFIG.retry.backoffMs,
          ) || DEFAULT_CONFIG.retry.backoffMs,
        maxBackoffMs:
          this.getNumber(
            CONFIG_ENV_KEYS.RETRY_MAX_BACKOFF_MS,
            DEFAULT_CONFIG.retry.maxBackoffMs,
          ) || DEFAULT_CONFIG.retry.maxBackoffMs,
      },
      timeouts: {
        solveTimeout:
          this.getNumber(
            CONFIG_ENV_KEYS.TIMEOUT_SOLVE,
            DEFAULT_CONFIG.timeouts.solveTimeout,
          ) || DEFAULT_CONFIG.timeouts.solveTimeout,
        detectionTimeout:
          this.getNumber(
            CONFIG_ENV_KEYS.TIMEOUT_DETECTION,
            DEFAULT_CONFIG.timeouts.detectionTimeout,
          ) || DEFAULT_CONFIG.timeouts.detectionTimeout,
        widgetInteractionTimeout:
          this.getNumber(
            CONFIG_ENV_KEYS.TIMEOUT_WIDGET_INTERACTION,
            DEFAULT_CONFIG.timeouts.widgetInteractionTimeout,
          ) || DEFAULT_CONFIG.timeouts.widgetInteractionTimeout,
        audioTranscriptionTimeout:
          this.getNumber(
            CONFIG_ENV_KEYS.TIMEOUT_AUDIO_TRANSCRIPTION,
            DEFAULT_CONFIG.timeouts.audioTranscriptionTimeout,
          ) || DEFAULT_CONFIG.timeouts.audioTranscriptionTimeout,
      },
      solverTimeouts: {
        recaptchaV2Checkbox: DEFAULT_CONFIG.solverTimeouts.recaptchaV2Checkbox,
        recaptchaV2Invisible:
          DEFAULT_CONFIG.solverTimeouts.recaptchaV2Invisible,
        recaptchaV2Audio: DEFAULT_CONFIG.solverTimeouts.recaptchaV2Audio,
        recaptchaV2Image: DEFAULT_CONFIG.solverTimeouts.recaptchaV2Image,
        recaptchaV3: DEFAULT_CONFIG.solverTimeouts.recaptchaV3,
        hcaptchaCheckbox: DEFAULT_CONFIG.solverTimeouts.hcaptchaCheckbox,
        hcaptchaInvisible: DEFAULT_CONFIG.solverTimeouts.hcaptchaInvisible,
        hcaptchaAudio: DEFAULT_CONFIG.solverTimeouts.hcaptchaAudio,
        hcaptchaAccessibility:
          DEFAULT_CONFIG.solverTimeouts.hcaptchaAccessibility,
        datadomeSensor: DEFAULT_CONFIG.solverTimeouts.datadomeSensor,
        datadomeCaptcha: DEFAULT_CONFIG.solverTimeouts.datadomeCaptcha,
        datadomeSlider: DEFAULT_CONFIG.solverTimeouts.datadomeSlider,
        akamaiLevel2: DEFAULT_CONFIG.solverTimeouts.akamaiLevel2,
        akamaiLevel3: DEFAULT_CONFIG.solverTimeouts.akamaiLevel3,
      },
      provider: {
        maxRetries:
          this.getNumber(
            CONFIG_ENV_KEYS.PROVIDER_MAX_RETRIES,
            DEFAULT_CONFIG.provider.maxRetries,
          ) || DEFAULT_CONFIG.provider.maxRetries,
        timeoutSeconds:
          this.getNumber(
            CONFIG_ENV_KEYS.PROVIDER_TIMEOUT_SECONDS,
            DEFAULT_CONFIG.provider.timeoutSeconds,
          ) || DEFAULT_CONFIG.provider.timeoutSeconds,
        rateLimitPerMinute:
          this.getNumber(
            CONFIG_ENV_KEYS.PROVIDER_RATE_LIMIT_PER_MINUTE,
            DEFAULT_CONFIG.provider.rateLimitPerMinute,
          ) || DEFAULT_CONFIG.provider.rateLimitPerMinute,
      },
      detection: {
        minConfidenceThreshold:
          this.getNumber(
            CONFIG_ENV_KEYS.DETECTION_MIN_CONFIDENCE_THRESHOLD,
            DEFAULT_CONFIG.detection.minConfidenceThreshold,
          ) || DEFAULT_CONFIG.detection.minConfidenceThreshold,
        minStrongConfidence:
          this.getNumber(
            CONFIG_ENV_KEYS.DETECTION_MIN_STRONG_CONFIDENCE,
            DEFAULT_CONFIG.detection.minStrongConfidence,
          ) || DEFAULT_CONFIG.detection.minStrongConfidence,
      },
    };
  }

  /**
   * Helper method to get a number from environment variables
   */
  private getNumber(key: string, defaultValue: number): number | null {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === null) {
      return null;
    }
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }
}

