/**
 * Captcha Solver Utilities
 * 
 * Shared utilities for the captcha solver module including:
 * - Retry logic with exponential backoff
 * - Error formatting and handling
 * - Health check utilities
 * - Error context utilities
 */

// Retry utilities
export {
  retryWithBackoff,
  createRetryFunction,
  type RetryOptions,
} from './retry.util';

// Error formatting utilities
export {
  formatError,
  formatErrorForLogging,
  extractErrorMessage,
  extractErrorCode,
  isRecoverableError,
  createErrorSummary,
} from './error-formatter.util';

// Health check utilities
export {
  createHealthIndicator,
  createHealthCheck,
  combineHealthChecks,
  createAlwaysHealthyCheck,
  createAlwaysUnhealthyCheck,
  type HealthCheckResult,
  type HealthCheckFunction,
  type DetailedHealthCheckFunction,
  type HealthIndicatorOptions,
} from './health-check.util';

// Error context utilities
export {
  enrichExceptionWithContext,
  createErrorContext,
} from './error-context.util';

