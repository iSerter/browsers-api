import { CaptchaSolverException } from '../exceptions/captcha-solver.exception';
import { ErrorContext } from '../interfaces/error-context.interface';
import { ErrorContextService } from '../services/error-context.service';

/**
 * Enrich an exception with error context from the current context service.
 * This function creates a new exception instance with the enriched context.
 * 
 * @param exception - Exception to enrich
 * @param errorContextService - Error context service instance
 * @returns Exception with enriched error context (may be the same instance if no context available)
 */
export function enrichExceptionWithContext(
  exception: CaptchaSolverException,
  errorContextService: ErrorContextService,
): CaptchaSolverException {
  const context = errorContextService.getContext();
  if (!context || exception.errorContext) {
    // If no context available or exception already has context, return as-is
    return exception;
  }

  // If exception already has error context, merge it
  const enrichedContext: ErrorContext = {
    ...context,
    timestamp: Date.now(),
  };

  // For exceptions that already have error context in constructor, we need to create a new instance
  // However, since we can't easily clone the exception with all its properties,
  // we'll attach the context directly to the existing exception
  // This is a workaround - in practice, exceptions should be created with context from the start
  (exception as any).errorContext = enrichedContext;

  return exception;
}

/**
 * Create error context from current context service state
 * @param errorContextService - Error context service instance
 * @param additionalData - Additional data to include in context
 * @returns Error context object
 */
export function createErrorContext(
  errorContextService: ErrorContextService,
  additionalData?: Partial<ErrorContext>,
): ErrorContext | undefined {
  const context = errorContextService.getContext();
  if (!context) {
    return undefined;
  }

  return {
    ...context,
    ...additionalData,
    timestamp: additionalData?.timestamp || Date.now(),
  };
}

