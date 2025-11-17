import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

/**
 * Exception thrown when a network error occurs during captcha solving.
 * This is a recoverable error - the system may retry the operation.
 */
export class NetworkException extends CaptchaSolverException {
  /**
   * Creates a new NetworkException instance.
   *
   * @param message - Human-readable error message
   * @param originalError - The original network error (if available)
   * @param context - Additional context information (URL, timeout, etc.)
   */
  constructor(
    message: string,
    public readonly originalError?: Error,
    context?: Record<string, any>,
  ) {
    super(
      message,
      'NETWORK_ERROR',
      ErrorCategory.NETWORK,
      true, // isRecoverable
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
    Object.setPrototypeOf(this, NetworkException.prototype);
  }
}

