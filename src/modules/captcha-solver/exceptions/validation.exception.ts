import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

/**
 * Exception thrown when validation fails for captcha solver inputs or configuration.
 * This is NOT a recoverable error - the request is invalid and should not be retried.
 */
export class ValidationException extends CaptchaSolverException {
  /**
   * Creates a new ValidationException instance.
   *
   * @param message - Human-readable error message
   * @param validationErrors - Array of validation error details
   * @param context - Additional context information
   */
  constructor(
    message: string,
    public readonly validationErrors: Array<{
      field?: string;
      message: string;
      code?: string;
    }>,
    context?: Record<string, any>,
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      ErrorCategory.VALIDATION,
      false, // isRecoverable
      {
        validationErrors,
        ...context,
      },
    );
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ValidationException.prototype);
  }

  /**
   * Creates a ValidationException from a single validation error.
   *
   * @param message - Error message
   * @param field - Field that failed validation (optional)
   * @param code - Error code (optional)
   * @param context - Additional context
   */
  static fromSingleError(
    message: string,
    field?: string,
    code?: string,
    context?: Record<string, any>,
  ): ValidationException {
    return new ValidationException(
      message,
      [{ field, message, code }],
      context,
    );
  }
}

