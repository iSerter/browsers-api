/**
 * Error formatting utilities
 * 
 * Provides consistent error formatting and logging utilities for the captcha solver module.
 */

import { CaptchaSolverException } from '../exceptions/captcha-solver.exception';
import { ErrorContext } from '../interfaces/error-context.interface';

/**
 * Format an error into a human-readable string
 * 
 * Handles various error types including:
 * - CaptchaSolverException (with structured information)
 * - Standard Error objects
 * - Unknown error types
 * 
 * @param error - The error to format
 * @returns Formatted error string
 * 
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const formatted = formatError(error);
 *   logger.error(formatted);
 * }
 * ```
 */
export function formatError(error: unknown): string {
  if (error instanceof CaptchaSolverException) {
    return error.toString();
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, any>;
    
    // Try to extract message from common error structures
    if (errorObj.message) {
      return String(errorObj.message);
    }
    
    if (errorObj.error) {
      return String(errorObj.error);
    }
    
    // Fallback to JSON stringification
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return 'Unknown error';
}

/**
 * Format an error for structured logging
 * 
 * Creates a structured object suitable for logging systems that support
 * structured logging (e.g., JSON loggers).
 * 
 * @param error - The error to format
 * @param context - Additional context to include in the formatted output
 * @returns Structured error object for logging
 * 
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const logData = formatErrorForLogging(error, {
 *     operation: 'solveCaptcha',
 *     captchaType: 'recaptcha',
 *     attempt: 2,
 *   });
 *   logger.error('Operation failed', logData);
 * }
 * ```
 */
export function formatErrorForLogging(
  error: unknown,
  context?: Record<string, any>,
): Record<string, any> {
  const baseLog: Record<string, any> = {
    ...context,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof CaptchaSolverException) {
    return {
      ...baseLog,
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        category: error.category,
        isRecoverable: error.isRecoverable,
        context: error.context,
        errorContext: error.errorContext,
        stack: error.stack,
      },
    };
  }

  if (error instanceof Error) {
    return {
      ...baseLog,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
  }

  if (typeof error === 'string') {
    return {
      ...baseLog,
      error: {
        message: error,
      },
    };
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, any>;
    return {
      ...baseLog,
      error: {
        ...errorObj,
        message: errorObj.message || errorObj.error || 'Unknown error',
      },
    };
  }

  return {
    ...baseLog,
    error: {
      message: 'Unknown error',
      raw: String(error),
    },
  };
}

/**
 * Extract error message from various error types
 * 
 * Safely extracts a message string from any error type.
 * 
 * @param error - The error to extract message from
 * @returns Error message string, or 'Unknown error' if extraction fails
 * 
 * @example
 * ```typescript
 * const message = extractErrorMessage(error);
 * console.log(`Error: ${message}`);
 * ```
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof CaptchaSolverException || error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, any>;
    return errorObj.message || errorObj.error || 'Unknown error';
  }

  return 'Unknown error';
}

/**
 * Extract error code from various error types
 * 
 * Attempts to extract a machine-readable error code from the error.
 * 
 * @param error - The error to extract code from
 * @returns Error code string, or undefined if not available
 * 
 * @example
 * ```typescript
 * const code = extractErrorCode(error);
 * if (code === 'INVALID_API_KEY') {
 *   // Handle invalid API key
 * }
 * ```
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof CaptchaSolverException) {
    return error.code;
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, any>;
    return errorObj.code || errorObj.errorCode;
  }

  return undefined;
}

/**
 * Check if an error is recoverable (can be retried)
 * 
 * @param error - The error to check
 * @returns true if the error is recoverable, false otherwise
 * 
 * @example
 * ```typescript
 * if (isRecoverableError(error)) {
 *   await retryOperation();
 * } else {
 *   throw error;
 * }
 * ```
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof CaptchaSolverException) {
    return error.isRecoverable;
  }

  // Default to false for unknown error types
  return false;
}

/**
 * Create a summary of error information
 * 
 * Creates a concise summary object with key error information.
 * 
 * @param error - The error to summarize
 * @param additionalContext - Additional context to include
 * @returns Error summary object
 * 
 * @example
 * ```typescript
 * const summary = createErrorSummary(error, {
 *   operation: 'solveCaptcha',
 *   provider: 'anti-captcha',
 * });
 * // { message: '...', code: '...', recoverable: false, ... }
 * ```
 */
export function createErrorSummary(
  error: unknown,
  additionalContext?: Record<string, any>,
): Record<string, any> {
  return {
    message: extractErrorMessage(error),
    code: extractErrorCode(error),
    recoverable: isRecoverableError(error),
    ...additionalContext,
  };
}

