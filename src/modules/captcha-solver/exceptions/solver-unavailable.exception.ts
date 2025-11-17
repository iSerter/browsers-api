import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

/**
 * Exception thrown when a captcha solver is unavailable.
 * This is a recoverable error - the system may retry with a different solver.
 */
export class SolverUnavailableException extends CaptchaSolverException {
  /**
   * Creates a new SolverUnavailableException instance.
   *
   * @param message - Human-readable error message
   * @param solverType - Type of solver that is unavailable (e.g., 'native', '2captcha', 'anti-captcha')
   * @param reason - Reason why the solver is unavailable (e.g., 'circuit_breaker_open', 'not_configured', 'rate_limited')
   * @param context - Additional context information
   */
  constructor(
    message: string,
    public readonly solverType: string,
    public readonly reason: string,
    context?: Record<string, any>,
  ) {
    super(
      message,
      'SOLVER_UNAVAILABLE',
      ErrorCategory.AVAILABILITY,
      true, // isRecoverable
      {
        solverType,
        reason,
        ...context,
      },
    );
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SolverUnavailableException.prototype);
  }
}

