/**
 * Retry utility with exponential backoff
 * 
 * Provides a reusable retry mechanism with configurable exponential backoff
 * for handling transient failures in async operations.
 */

/**
 * Options for retry with backoff
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts (including the initial attempt)
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial backoff delay in milliseconds
   * @default 1000
   */
  backoffMs: number;

  /**
   * Maximum backoff delay in milliseconds (caps the exponential growth)
   * @default 10000
   */
  maxBackoffMs?: number;

  /**
   * Optional function to determine if an error should trigger a retry
   * @param error - The error that occurred
   * @returns true if the error should trigger a retry, false otherwise
   */
  shouldRetry?: (error: unknown) => boolean;

  /**
   * Optional function called before each retry attempt
   * @param attempt - Current attempt number (1-indexed)
   * @param error - The error that triggered the retry
   * @param delay - The delay before the next attempt in milliseconds
   */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;

  /**
   * Optional function called when all retries are exhausted
   * @param lastError - The last error that occurred
   * @param attempts - Total number of attempts made
   */
  onExhausted?: (lastError: unknown, attempts: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 10000,
};

/**
 * Sleep for a specified number of milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (1-indexed)
 * @param initialBackoff - Initial backoff delay in milliseconds
 * @param maxBackoff - Maximum backoff delay in milliseconds
 * @returns Calculated delay in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  initialBackoff: number,
  maxBackoff: number,
): number {
  // Exponential backoff: initialBackoff * 2^(attempt-1), capped at maxBackoff
  const delay = Math.min(
    initialBackoff * Math.pow(2, attempt - 1),
    maxBackoff,
  );
  return delay;
}

/**
 * Retry an async function with exponential backoff
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with the function's return value
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => await someAsyncOperation(),
 *   {
 *     maxAttempts: 5,
 *     backoffMs: 1000,
 *     maxBackoffMs: 10000,
 *     shouldRetry: (error) => error.code !== 'INVALID_API_KEY',
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms`);
 *     },
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options } as Required<RetryOptions>;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Check if we should retry this error
      if (config.shouldRetry && !config.shouldRetry(error)) {
        throw error;
      }

      // If this is the last attempt, don't wait before throwing
      if (attempt >= config.maxAttempts) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(
        attempt,
        config.backoffMs,
        config.maxBackoffMs,
      );

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt, error, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Call onExhausted callback if provided
  if (config.onExhausted) {
    config.onExhausted(lastError, config.maxAttempts);
  }

  // Re-throw the last error
  throw lastError;
}

/**
 * Create a retry function with pre-configured options
 * 
 * Useful when you need to retry multiple operations with the same configuration
 * 
 * @param options - Retry configuration options
 * @returns A retry function that can be called with different async functions
 * 
 * @example
 * ```typescript
 * const retry = createRetryFunction({
 *   maxAttempts: 3,
 *   backoffMs: 1000,
 * });
 * 
 * const result1 = await retry(() => operation1());
 * const result2 = await retry(() => operation2());
 * ```
 */
export function createRetryFunction<T>(
  options: RetryOptions,
): (fn: () => Promise<T>) => Promise<T> {
  return (fn: () => Promise<T>) => retryWithBackoff(fn, options);
}

