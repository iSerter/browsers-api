/**
 * Configuration constants for the captcha-solver module
 * Centralizes all magic numbers and hard-coded values
 */

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 3
   */
  failureThreshold: number;

  /**
   * Time in milliseconds before attempting to close the circuit (half-open state)
   * @default 60000 (1 minute)
   */
  timeoutPeriod: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /**
   * Time-to-live for cached detection results in milliseconds
   * @default 300000 (5 minutes)
   */
  ttl: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial backoff delay in milliseconds
   * @default 1000 (1 second)
   */
  backoffMs: number;

  /**
   * Maximum backoff delay in milliseconds
   * @default 10000 (10 seconds)
   */
  maxBackoffMs: number;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /**
   * Timeout for solving captcha in milliseconds
   * @default 30000 (30 seconds)
   */
  solveTimeout: number;

  /**
   * Timeout for detection operations in milliseconds
   * @default 5000 (5 seconds)
   */
  detectionTimeout: number;

  /**
   * Timeout for widget interactions in milliseconds
   * @default 5000 (5 seconds)
   */
  widgetInteractionTimeout: number;

  /**
   * Timeout for audio transcription in milliseconds
   * @default 30000 (30 seconds)
   */
  audioTranscriptionTimeout: number;
}

/**
 * Solver-specific timeout configuration
 */
export interface SolverTimeoutConfig {
  /**
   * reCAPTCHA v2 checkbox timeout in milliseconds
   * @default 30000
   */
  recaptchaV2Checkbox: number;

  /**
   * reCAPTCHA v2 invisible timeout in milliseconds
   * @default 10000
   */
  recaptchaV2Invisible: number;

  /**
   * reCAPTCHA v2 audio timeout in milliseconds
   * @default 30000
   */
  recaptchaV2Audio: number;

  /**
   * reCAPTCHA v2 image timeout in milliseconds
   * @default 60000
   */
  recaptchaV2Image: number;

  /**
   * reCAPTCHA v3 timeout in milliseconds
   * @default 10000
   */
  recaptchaV3: number;

  /**
   * hCAPTCHA checkbox timeout in milliseconds
   * @default 30000
   */
  hcaptchaCheckbox: number;

  /**
   * hCAPTCHA invisible timeout in milliseconds
   * @default 10000
   */
  hcaptchaInvisible: number;

  /**
   * hCAPTCHA audio timeout in milliseconds
   * @default 30000
   */
  hcaptchaAudio: number;

  /**
   * hCAPTCHA accessibility timeout in milliseconds
   * @default 30000
   */
  hcaptchaAccessibility: number;

  /**
   * DataDome sensor timeout in milliseconds
   * @default 30000
   */
  datadomeSensor: number;

  /**
   * DataDome captcha timeout in milliseconds
   * @default 60000
   */
  datadomeCaptcha: number;

  /**
   * DataDome slider timeout in milliseconds
   * @default 30000
   */
  datadomeSlider: number;

  /**
   * Akamai level 2 timeout in milliseconds
   * @default 5000
   */
  akamaiLevel2: number;

  /**
   * Akamai level 3 timeout in milliseconds
   * @default 10000
   */
  akamaiLevel3: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /**
   * Default maximum retries for provider requests
   * @default 3
   */
  maxRetries: number;

  /**
   * Default timeout in seconds for provider requests
   * @default 60
   */
  timeoutSeconds: number;

  /**
   * Rate limit per minute for audio transcription
   * @default 60
   */
  rateLimitPerMinute: number;
}

/**
 * Detection configuration
 */
export interface DetectionConfig {
  /**
   * Minimum confidence threshold for detection results
   * @default 0.5
   */
  minConfidenceThreshold: number;

  /**
   * Minimum confidence for strong signals
   * @default 0.7
   */
  minStrongConfidence: number;
}

/**
 * Complete captcha solver configuration
 */
export interface CaptchaSolverConfig {
  circuitBreaker: CircuitBreakerConfig;
  cache: CacheConfig;
  retry: RetryConfig;
  timeouts: TimeoutConfig;
  solverTimeouts: SolverTimeoutConfig;
  provider: ProviderConfig;
  detection: DetectionConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: CaptchaSolverConfig = {
  circuitBreaker: {
    failureThreshold: 3,
    timeoutPeriod: 60000, // 1 minute
  },
  cache: {
    ttl: 300000, // 5 minutes
  },
  retry: {
    maxAttempts: 3,
    backoffMs: 1000, // 1 second
    maxBackoffMs: 10000, // 10 seconds
  },
  timeouts: {
    solveTimeout: 30000, // 30 seconds
    detectionTimeout: 5000, // 5 seconds
    widgetInteractionTimeout: 5000, // 5 seconds
    audioTranscriptionTimeout: 30000, // 30 seconds
  },
  solverTimeouts: {
    recaptchaV2Checkbox: 30000,
    recaptchaV2Invisible: 10000,
    recaptchaV2Audio: 30000,
    recaptchaV2Image: 60000,
    recaptchaV3: 10000,
    hcaptchaCheckbox: 30000,
    hcaptchaInvisible: 10000,
    hcaptchaAudio: 30000,
    hcaptchaAccessibility: 30000,
    datadomeSensor: 30000,
    datadomeCaptcha: 60000,
    datadomeSlider: 30000,
    akamaiLevel2: 5000,
    akamaiLevel3: 10000,
  },
  provider: {
    maxRetries: 3,
    timeoutSeconds: 60,
    rateLimitPerMinute: 60,
  },
  detection: {
    minConfidenceThreshold: 0.5,
    minStrongConfidence: 0.7,
  },
};

/**
 * Environment variable keys for configuration
 */
export const CONFIG_ENV_KEYS = {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD:
    'CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
  CIRCUIT_BREAKER_TIMEOUT_PERIOD: 'CAPTCHA_CIRCUIT_BREAKER_TIMEOUT_PERIOD',
  CACHE_TTL: 'CAPTCHA_CACHE_TTL',
  RETRY_MAX_ATTEMPTS: 'CAPTCHA_RETRY_MAX_ATTEMPTS',
  RETRY_BACKOFF_MS: 'CAPTCHA_RETRY_BACKOFF_MS',
  RETRY_MAX_BACKOFF_MS: 'CAPTCHA_RETRY_MAX_BACKOFF_MS',
  TIMEOUT_SOLVE: 'CAPTCHA_TIMEOUT_SOLVE',
  TIMEOUT_DETECTION: 'CAPTCHA_TIMEOUT_DETECTION',
  TIMEOUT_WIDGET_INTERACTION: 'CAPTCHA_TIMEOUT_WIDGET_INTERACTION',
  TIMEOUT_AUDIO_TRANSCRIPTION: 'CAPTCHA_TIMEOUT_AUDIO_TRANSCRIPTION',
  PROVIDER_MAX_RETRIES: 'CAPTCHA_PROVIDER_MAX_RETRIES',
  PROVIDER_TIMEOUT_SECONDS: 'CAPTCHA_PROVIDER_TIMEOUT_SECONDS',
  PROVIDER_RATE_LIMIT_PER_MINUTE: 'CAPTCHA_PROVIDER_RATE_LIMIT_PER_MINUTE',
  DETECTION_MIN_CONFIDENCE_THRESHOLD:
    'CAPTCHA_DETECTION_MIN_CONFIDENCE_THRESHOLD',
  DETECTION_MIN_STRONG_CONFIDENCE: 'CAPTCHA_DETECTION_MIN_STRONG_CONFIDENCE',
} as const;
