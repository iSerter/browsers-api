import { Logger } from '@nestjs/common';
import { ErrorContextService } from '../services/error-context.service';
import { ErrorContext } from '../interfaces/error-context.interface';

/**
 * Structured logging utility that includes error context in log messages
 */
export class StructuredLogger {
  constructor(
    private readonly logger: Logger,
    private readonly errorContextService: ErrorContextService,
  ) {}

  /**
   * Log a message with error context
   */
  log(message: string, context?: Record<string, any>): void {
    const errorContext = this.errorContextService.getContext();
    const logContext = this.buildLogContext(errorContext, context);
    this.logger.log(message, logContext);
  }

  /**
   * Log an error with error context
   */
  error(message: string, trace?: string, context?: Record<string, any>): void {
    const errorContext = this.errorContextService.getContext();
    const logContext = this.buildLogContext(errorContext, context);
    this.logger.error(message, trace, logContext);
  }

  /**
   * Log a warning with error context
   */
  warn(message: string, context?: Record<string, any>): void {
    const errorContext = this.errorContextService.getContext();
    const logContext = this.buildLogContext(errorContext, context);
    this.logger.warn(message, logContext);
  }

  /**
   * Log a debug message with error context
   */
  debug(message: string, context?: Record<string, any>): void {
    const errorContext = this.errorContextService.getContext();
    const logContext = this.buildLogContext(errorContext, context);
    this.logger.debug(message, logContext);
  }

  /**
   * Build log context from error context and additional context
   */
  private buildLogContext(
    errorContext?: ErrorContext,
    additionalContext?: Record<string, any>,
  ): string {
    const parts: string[] = [];

    if (errorContext?.correlationId) {
      parts.push(`[${errorContext.correlationId}]`);
    }

    if (errorContext?.solverType) {
      parts.push(`[${errorContext.solverType}]`);
    }

    if (errorContext?.attemptNumber) {
      parts.push(`[Attempt ${errorContext.attemptNumber}]`);
    }

    if (errorContext?.timings) {
      parts.push(`[${errorContext.timings.duration}ms]`);
    }

    if (additionalContext && Object.keys(additionalContext).length > 0) {
      const contextStr = JSON.stringify(additionalContext);
      parts.push(`[${contextStr}]`);
    }

    return parts.join(' ');
  }
}



