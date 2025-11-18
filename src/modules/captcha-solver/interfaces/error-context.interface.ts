/**
 * Error context information for enhanced error tracking and debugging
 */
export interface ErrorContext {
  /**
   * Correlation ID for tracking the request across services
   */
  correlationId: string;

  /**
   * Timestamp when the error occurred (Unix timestamp in milliseconds)
   */
  timestamp: number;

  /**
   * Type of solver that encountered the error (e.g., 'native', '2captcha', 'anti-captcha')
   */
  solverType?: string;

  /**
   * Additional metadata about the solver (provider name, version, etc.)
   */
  solverMetadata?: Record<string, any>;

  /**
   * Timing information for the operation
   */
  timings?: {
    start: number;
    end: number;
    duration: number;
  };

  /**
   * Attempt number for retry scenarios
   */
  attemptNumber?: number;

  /**
   * Additional context data
   */
  additionalContext?: Record<string, any>;
}



