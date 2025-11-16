import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SolvingAttemptMetrics,
  SolverPerformanceStats,
} from './interfaces/solver-capability.interface';
import { ChallengeType } from './interfaces/solver-capability.interface';

/**
 * Service for tracking solver performance metrics
 * Maintains in-memory metrics with configurable retention
 */
@Injectable()
export class SolverPerformanceTracker implements OnModuleInit {
  private readonly logger = new Logger(SolverPerformanceTracker.name);
  private readonly metrics: SolvingAttemptMetrics[] = [];
  private readonly maxRetention: number;

  constructor(maxRetention: number = 1000) {
    this.maxRetention = maxRetention;
  }

  async onModuleInit() {
    this.logger.log(
      `Performance Tracker initialized (max retention: ${this.maxRetention})`,
    );
  }

  /**
   * Record a solving attempt
   */
  recordAttempt(
    solverType: string,
    challengeType: ChallengeType,
    duration: number,
    success: boolean,
    error?: string,
  ): void {
    const metric: SolvingAttemptMetrics = {
      solverType,
      challengeType,
      duration,
      success,
      error,
      timestamp: new Date(),
    };

    this.metrics.push(metric);

    // Maintain retention limit
    if (this.metrics.length > this.maxRetention) {
      this.metrics.shift();
    }

    this.logger.debug(
      `Recorded attempt: ${solverType} - ${challengeType} - ${success ? 'SUCCESS' : 'FAILURE'} - ${duration}ms`,
    );
  }

  /**
   * Get performance statistics for a solver
   */
  getStats(solverType: string): SolverPerformanceStats {
    const solverMetrics = this.metrics.filter(
      (m) => m.solverType === solverType,
    );

    if (solverMetrics.length === 0) {
      return this.createEmptyStats(solverType);
    }

    const successCount = solverMetrics.filter((m) => m.success).length;
    const failureCount = solverMetrics.length - successCount;
    const totalDuration = solverMetrics.reduce(
      (sum, m) => sum + m.duration,
      0,
    );
    const averageDuration = totalDuration / solverMetrics.length;

    // Group by challenge type
    const byChallengeType: Record<
      ChallengeType,
      {
        count: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        averageDuration: number;
      }
    > = {} as any;

    const challengeTypes = new Set(
      solverMetrics.map((m) => m.challengeType),
    ) as Set<ChallengeType>;

    for (const challengeType of challengeTypes) {
      const typeMetrics = solverMetrics.filter(
        (m) => m.challengeType === challengeType,
      );
      const typeSuccessCount = typeMetrics.filter((m) => m.success).length;
      const typeFailureCount = typeMetrics.length - typeSuccessCount;
      const typeTotalDuration = typeMetrics.reduce(
        (sum, m) => sum + m.duration,
        0,
      );

      byChallengeType[challengeType] = {
        count: typeMetrics.length,
        successCount: typeSuccessCount,
        failureCount: typeFailureCount,
        successRate:
          typeMetrics.length > 0
            ? typeSuccessCount / typeMetrics.length
            : 0,
        averageDuration:
          typeMetrics.length > 0
            ? typeTotalDuration / typeMetrics.length
            : 0,
      };
    }

    const lastSuccessful = solverMetrics
      .filter((m) => m.success)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    const lastFailed = solverMetrics
      .filter((m) => !m.success)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    return {
      solverType,
      totalAttempts: solverMetrics.length,
      successCount,
      failureCount,
      successRate: successCount / solverMetrics.length,
      averageDuration,
      byChallengeType,
      lastSuccessfulAttempt: lastSuccessful?.timestamp,
      lastFailedAttempt: lastFailed?.timestamp,
    };
  }

  /**
   * Get performance statistics for all solvers
   */
  getAllStats(): SolverPerformanceStats[] {
    const solverTypes = new Set(this.metrics.map((m) => m.solverType));
    return Array.from(solverTypes).map((type) => this.getStats(type));
  }

  /**
   * Get metrics for a specific time period
   */
  getMetricsForPeriod(
    startDate: Date,
    endDate: Date,
  ): SolvingAttemptMetrics[] {
    return this.metrics.filter(
      (m) => m.timestamp >= startDate && m.timestamp <= endDate,
    );
  }

  /**
   * Clear old metrics (older than specified days)
   */
  clearOldMetrics(daysToKeep: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialLength = this.metrics.length;
    const filtered = this.metrics.filter((m) => m.timestamp >= cutoffDate);

    this.metrics.length = 0;
    this.metrics.push(...filtered);

    const removed = initialLength - this.metrics.length;
    if (removed > 0) {
      this.logger.log(`Cleared ${removed} old performance metrics`);
    }
  }

  /**
   * Get current metrics count
   */
  getMetricsCount(): number {
    return this.metrics.length;
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.metrics.length = 0;
    this.logger.log('Cleared all performance metrics');
  }

  /**
   * Create empty stats for a solver with no metrics
   */
  private createEmptyStats(solverType: string): SolverPerformanceStats {
    return {
      solverType,
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageDuration: 0,
      byChallengeType: {} as any,
    };
  }
}

