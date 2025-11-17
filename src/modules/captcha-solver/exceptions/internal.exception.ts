import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

/**
 * Exception thrown when an internal/unexpected error occurs in the captcha solver.
 * This is NOT a recoverable error - indicates a bug or system failure.
 */
export class InternalException extends CaptchaSolverException {
  /**
   * Creates a new InternalException instance.
   *
   * @param message - Human-readable error message
   * @param originalError - The original error that caused this exception (if available)
   * @param context - Additional context information for debugging
   */
  constructor(
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, any>,
  ) {
    super(
      message,
      'INTERNAL_ERROR',
      ErrorCategory.INTERNAL,
      false, // isRecoverable
      {
        originalError: originalError
          ? {
              name: originalError.name,
              message: originalError.message,
              stack: originalError.stack,
            }
          : undefined,
        ...context,
      },
    );
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, InternalException.prototype);
  }
}

