import { ErrorContextService } from '../services/error-context.service';
import { ErrorContext } from '../interfaces/error-context.interface';
import { createErrorContext } from './error-context.util';

/**
 * Factory function to create exceptions with automatic error context enrichment.
 * This helper ensures all exceptions include correlation ID, timing, and metadata.
 */
export class ExceptionFactory {
  constructor(private readonly errorContextService: ErrorContextService) {}

  /**
   * Get error context for exception creation
   * @param additionalData - Additional data to include in context
   * @returns Error context or undefined
   */
  getErrorContext(additionalData?: Partial<ErrorContext>): ErrorContext | undefined {
    return createErrorContext(this.errorContextService, additionalData);
  }

  /**
   * Enrich an exception with error context if not already present
   * @param exception - Exception to enrich
   * @returns Exception with error context
   */
  enrichException<T extends { errorContext?: ErrorContext }>(exception: T): T {
    if (exception.errorContext) {
      return exception;
    }

    const context = this.getErrorContext();
    if (context) {
      (exception as any).errorContext = context;
    }

    return exception;
  }
}


