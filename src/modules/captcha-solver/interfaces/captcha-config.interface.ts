/**
 * Configuration interface for captcha solver settings
 */
export interface CaptchaSolverConfiguration {
  /**
   * Preferred provider name (e.g., '2captcha', 'anticaptcha')
   */
  preferredProvider?: string;

  /**
   * Timeout in seconds for captcha solving requests
   */
  timeoutSeconds?: number;

  /**
   * Maximum number of retries for failed captcha solving attempts
   */
  maxRetries?: number;

  /**
   * Whether to enable automatic retry on failure
   */
  enableAutoRetry?: boolean;

  /**
   * Minimum confidence score required for detection
   */
  minConfidenceScore?: number;

  /**
   * Per-challenge-type fallback configuration
   * Controls whether 3rd party providers should be used as fallback
   */
  fallbackEnabled?: {
    recaptcha?: boolean;
    hcaptcha?: boolean;
    datadome?: boolean;
    funcaptcha?: boolean;
  };
}

/**
 * API Key health status
 */
export enum ApiKeyHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
  VALIDATING = 'validating',
}

/**
 * API Key metadata for tracking health and usage
 */
export interface ApiKeyMetadata {
  /**
   * The API key value (may be masked in responses)
   */
  key: string;

  /**
   * Provider name this key belongs to
   */
  provider: string;

  /**
   * Health status of the key
   */
  healthStatus: ApiKeyHealthStatus;

  /**
   * Last time the key was successfully used
   */
  lastSuccessfulUse?: Date;

  /**
   * Last time the key failed
   */
  lastFailure?: Date;

  /**
   * Number of consecutive failures
   */
  consecutiveFailures: number;

  /**
   * Total number of uses
   */
  totalUses: number;

  /**
   * Total number of failures
   */
  totalFailures: number;

  /**
   * Last validation error message (if any)
   */
  lastValidationError?: string;

  /**
   * Whether this key is from environment variables or database
   */
  source: 'environment' | 'database';

  /**
   * Created timestamp
   */
  createdAt: Date;

  /**
   * Last updated timestamp
   */
  updatedAt: Date;
}

/**
 * Provider API key validation result
 */
export interface ApiKeyValidationResult {
  /**
   * Whether the API key is valid
   */
  isValid: boolean;

  /**
   * Error message if validation failed
   */
  error?: string;

  /**
   * Provider-specific response data
   */
  data?: any;

  /**
   * Validation timestamp
   */
  validatedAt: Date;
}

