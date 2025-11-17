import { ErrorContext } from '../interfaces/error-context.interface';

/**
 * Error categories for captcha solver exceptions
 */
export enum ErrorCategory {
  AVAILABILITY = 'AVAILABILITY',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  PROVIDER = 'PROVIDER',
  INTERNAL = 'INTERNAL',
}

/**
 * Base exception class for all captcha solver related errors.
 * Provides structured error information with codes, categories, and recovery flags.
 */
export class CaptchaSolverException extends Error {
  /**
   * Error context with correlation ID, timing, and metadata
   */
  public readonly errorContext?: ErrorContext;

  /**
   * Creates a new CaptchaSolverException instance.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., 'SOLVER_UNAVAILABLE', 'INVALID_API_KEY')
   * @param category - Error category indicating the type of error
   * @param isRecoverable - Whether the error is recoverable (can be retried)
   * @param context - Additional context information (provider name, request details, etc.)
   * @param errorContext - Error context with correlation ID, timing, and metadata
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ErrorCategory,
    public readonly isRecoverable: boolean = false,
    public readonly context?: Record<string, any>,
    errorContext?: ErrorContext,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorContext = errorContext;

    // Capture stack trace if available (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CaptchaSolverException.prototype);
  }

  /**
   * Converts the exception to a JSON-serializable object.
   * Useful for logging and API responses.
   *
   * @returns JSON representation of the exception
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      isRecoverable: this.isRecoverable,
      context: this.context,
      errorContext: this.errorContext,
      stack: this.stack,
    };
  }

  /**
   * Returns a formatted string representation of the exception.
   *
   * @returns Formatted error string
   */
  toString(): string {
    const parts = [
      `${this.name} [${this.code}]`,
      `Category: ${this.category}`,
      `Recoverable: ${this.isRecoverable}`,
      `Message: ${this.message}`,
    ];

    if (this.errorContext?.correlationId) {
      parts.push(`Correlation ID: ${this.errorContext.correlationId}`);
    }

    if (this.errorContext?.timings) {
      parts.push(
        `Duration: ${this.errorContext.timings.duration}ms`,
      );
    }

    if (this.context && Object.keys(this.context).length > 0) {
      parts.push(`Context: ${JSON.stringify(this.context)}`);
    }

    return parts.join('\n');
  }
}

