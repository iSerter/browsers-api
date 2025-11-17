import { Injectable } from '@nestjs/common';
import { CaptchaSolverException } from '../exceptions/captcha-solver.exception';
import { ErrorContext } from '../interfaces/error-context.interface';
import { ErrorContextService } from './error-context.service';

/**
 * Aggregated error information for multi-attempt scenarios
 */
export interface AggregatedError {
  /**
   * All errors encountered during attempts
   */
  errors: Array<{
    attempt: number;
    error: CaptchaSolverException;
    timestamp: number;
    duration?: number;
  }>;

  /**
   * Total number of attempts
   */
  totalAttempts: number;

  /**
   * First error encountered
   */
  firstError: CaptchaSolverException;

  /**
   * Last error encountered
   */
  lastError: CaptchaSolverException;

  /**
   * Most common error category
   */
  mostCommonCategory: string;

  /**
   * Total duration across all attempts
   */
  totalDuration: number;

  /**
   * Error context from the last attempt
   */
  errorContext?: ErrorContext;
}

/**
 * Service for aggregating errors from multiple attempts
 */
@Injectable()
export class ErrorAggregationService {
  constructor(private readonly errorContextService: ErrorContextService) {}

  /**
   * Aggregate errors from multiple attempts
   * @param errors - Array of errors with attempt numbers
   * @returns Aggregated error information
   */
  aggregateErrors(
    errors: Array<{
      attempt: number;
      error: CaptchaSolverException;
      timestamp: number;
      duration?: number;
    }>,
  ): AggregatedError {
    if (errors.length === 0) {
      throw new Error('Cannot aggregate empty error array');
    }

    const firstError = errors[0].error;
    const lastError = errors[errors.length - 1].error;

    // Count error categories
    const categoryCounts: Record<string, number> = {};
    errors.forEach(({ error }) => {
      const category = error.category;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    // Find most common category
    const mostCommonCategory = Object.entries(categoryCounts).reduce(
      (a, b) => (categoryCounts[a[0]] > categoryCounts[b[0]] ? a : b),
    )[0];

    // Calculate total duration
    const totalDuration = errors.reduce(
      (sum, { duration }) => sum + (duration || 0),
      0,
    );

    // Get error context from last error or current context
    const errorContext =
      lastError.errorContext ||
      this.errorContextService.getContext() ||
      undefined;

    return {
      errors,
      totalAttempts: errors.length,
      firstError,
      lastError,
      mostCommonCategory,
      totalDuration,
      errorContext,
    };
  }

  /**
   * Create a summary message from aggregated errors
   * @param aggregated - Aggregated error information
   * @returns Human-readable summary
   */
  createSummary(aggregated: AggregatedError): string {
    const parts = [
      `Failed after ${aggregated.totalAttempts} attempt(s)`,
      `Most common error: ${aggregated.mostCommonCategory}`,
      `Total duration: ${aggregated.totalDuration}ms`,
    ];

    if (aggregated.errorContext?.correlationId) {
      parts.push(`Correlation ID: ${aggregated.errorContext.correlationId}`);
    }

    if (aggregated.errors.length > 0) {
      const uniqueErrors = new Set(
        aggregated.errors.map((e) => e.error.code),
      ).size;
      parts.push(`${uniqueErrors} unique error type(s)`);
    }

    return parts.join('. ');
  }

  /**
   * Get error statistics from aggregated errors
   * @param aggregated - Aggregated error information
   * @returns Statistics object
   */
  getStatistics(aggregated: AggregatedError): Record<string, any> {
    const categoryCounts: Record<string, number> = {};
    const codeCounts: Record<string, number> = {};
    const recoverableCount = aggregated.errors.filter(
      (e) => e.error.isRecoverable,
    ).length;

    aggregated.errors.forEach(({ error }) => {
      categoryCounts[error.category] =
        (categoryCounts[error.category] || 0) + 1;
      codeCounts[error.code] = (codeCounts[error.code] || 0) + 1;
    });

    return {
      totalAttempts: aggregated.totalAttempts,
      recoverableErrors: recoverableCount,
      nonRecoverableErrors: aggregated.totalAttempts - recoverableCount,
      categoryDistribution: categoryCounts,
      codeDistribution: codeCounts,
      averageDuration:
        aggregated.totalAttempts > 0
          ? aggregated.totalDuration / aggregated.totalAttempts
          : 0,
      totalDuration: aggregated.totalDuration,
    };
  }
}

