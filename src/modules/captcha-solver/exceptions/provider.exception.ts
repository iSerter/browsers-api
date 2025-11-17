import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

/**
 * Exception thrown when a captcha solver provider encounters an error.
 * This typically represents API errors, authentication failures, or provider-specific issues.
 * This is a recoverable error - the system may retry or use a different provider.
 */
export class ProviderException extends CaptchaSolverException {
  /**
   * Creates a new ProviderException instance.
   *
   * @param message - Human-readable error message
   * @param providerName - Name of the provider that encountered the error (e.g., '2captcha', 'anti-captcha')
   * @param apiResponse - API response from the provider (if available)
   * @param context - Additional context information
   */
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly apiResponse?: Record<string, any>,
    context?: Record<string, any>,
  ) {
    super(
      message,
      'PROVIDER_ERROR',
      ErrorCategory.PROVIDER,
      true, // isRecoverable
      {
        providerName,
        apiResponse,
        ...context,
      },
    );
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ProviderException.prototype);
  }
}

