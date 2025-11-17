import { Injectable, Logger } from '@nestjs/common';
import { ICaptchaSolver, CaptchaParams, CaptchaSolution } from '../interfaces/captcha-solver.interface';
import { SolverRegistry } from './solver-registry.service';
import { SolverPerformanceTracker } from './solver-performance-tracker.service';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import {
  SolverUnavailableException,
  InternalException,
  ProviderException,
} from '../exceptions';

/**
 * Factory service for creating and selecting solvers
 * Implements intelligent solver selection based on capabilities, health, and performance
 */
@Injectable()
export class SolverFactory {
  private readonly logger = new Logger(SolverFactory.name);

  constructor(
    private readonly registry: SolverRegistry,
    private readonly performanceTracker: SolverPerformanceTracker,
    private readonly widgetInteraction?: CaptchaWidgetInteractionService,
  ) {}

  /**
   * Create a solver instance by type
   */
  createSolver(solverType: string, ...args: any[]): ICaptchaSolver | null {
    const metadata = this.registry.get(solverType);
    if (!metadata) {
      this.logger.warn(`Solver type ${solverType} is not registered`);
      return null;
    }

    if (!metadata.capabilities.isEnabled) {
      this.logger.warn(`Solver type ${solverType} is disabled`);
      return null;
    }

    try {
      // For native solvers, pass required services
      if (solverType === 'turnstile-native' && this.widgetInteraction) {
        const solver = new metadata.constructor(
          ...args,
          this.widgetInteraction,
          this.performanceTracker,
        );
        return solver;
      }

      // For native reCAPTCHA solver, pass required services
      if (solverType === 'recaptcha-native' && this.widgetInteraction) {
        // NativeRecaptchaSolver requires: page, widgetInteraction, audioProcessing, behaviorSimulation, performanceTracker, config
        // We need to get these from the module or pass them as args
        // For now, assume they're passed in args
        const solver = new metadata.constructor(...args);
        return solver;
      }

      // For native hCAPTCHA solver, pass required services
      if (solverType === 'hcaptcha-native' && this.widgetInteraction) {
        // NativeHcaptchaSolver requires: page, widgetInteraction, audioProcessing, performanceTracker, config
        // We need to get these from the module or pass them as args
        // For now, assume they're passed in args
        const solver = new metadata.constructor(...args);
        return solver;
      }

      // For native DataDome solver, pass required services
      if (solverType === 'datadome-native' && this.widgetInteraction) {
        // NativeDataDomeSolver requires: page, widgetInteraction, behaviorSimulation, performanceTracker, config
        // We need to get these from the module or pass them as args
        // For now, assume they're passed in args
        const solver = new metadata.constructor(...args);
        return solver;
      }

      // For native Akamai solver, pass required services
      if (solverType === 'akamai-native' && this.widgetInteraction) {
        // NativeAkamaiSolver requires: page, widgetInteraction, behaviorSimulation, performanceTracker, config
        // We need to get these from the module or pass them as args
        // For now, assume they're passed in args
        const solver = new metadata.constructor(...args);
        return solver;
      }

      // For other solvers, use standard instantiation
      const solver = new metadata.constructor(...args);
      return solver;
    } catch (error: any) {
      this.logger.error(
        `Failed to create solver ${solverType}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Select the best solver for a challenge type
   * Returns solver metadata sorted by priority, health, and performance
   */
  selectBestSolver(challengeType: CaptchaParams['type']): string | null {
    const candidates = this.registry.getSolversByPriority(challengeType);

    if (candidates.length === 0) {
      this.logger.warn(
        `No enabled solvers found for challenge type: ${challengeType}`,
      );
      return null;
    }

    // Get performance stats to influence selection
    const candidatesWithPerformance = candidates.map((metadata) => {
      const stats = this.performanceTracker.getStats(metadata.solverType);
      return {
        metadata,
        stats,
        score: this.calculateSelectionScore(metadata, stats),
      };
    });

    // Sort by score (higher is better)
    candidatesWithPerformance.sort((a, b) => b.score - a.score);

    const selected = candidatesWithPerformance[0];
    this.logger.debug(
      `Selected solver ${selected.metadata.solverType} for ${challengeType} (score: ${selected.score.toFixed(2)})`,
    );

    return selected.metadata.solverType;
  }

  /**
   * Calculate selection score for a solver
   * Higher score = better choice
   */
  private calculateSelectionScore(
    metadata: any,
    stats: any,
  ): number {
    let score = 0;

    // Health status weight (50 points max)
    const healthScores = {
      healthy: 50,
      unknown: 25,
      unhealthy: 0,
      validating: 10,
    };
    score += healthScores[metadata.healthStatus] || 0;

    // Priority weight (30 points max)
    score += Math.min(metadata.capabilities.priority * 10, 30);

    // Success rate weight (20 points max)
    const successRate = stats?.successRate || metadata.capabilities.successRate;
    score += successRate * 20;

    // Recent performance bonus (if available)
    if (stats && stats.totalAttempts > 0) {
      // Prefer solvers with recent successful attempts
      if (stats.lastSuccessfulAttempt) {
        const hoursSinceSuccess =
          (Date.now() - stats.lastSuccessfulAttempt.getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceSuccess < 24) {
          score += 10; // Bonus for recent success
        }
      }
    }

    return score;
  }

  /**
   * Solve a challenge using the best available solver with fallback chain
   */
  async solveWithFallback(
    params: CaptchaParams,
    solverArgs: any[] = [],
  ): Promise<CaptchaSolution> {
    const challengeType = params.type;
    const candidates = this.registry.getSolversByPriority(challengeType);

    if (candidates.length === 0) {
      throw new SolverUnavailableException(
        `No enabled solvers found for challenge type: ${challengeType}`,
        'native',
        'no_solvers_enabled',
        { challengeType },
      );
    }

    let lastError: Error | null = null;
    const startTime = Date.now();

    // Try each solver in priority order
    for (const metadata of candidates) {
      const attemptStartTime = Date.now();
      try {
        this.logger.log(
          `Attempting to solve ${challengeType} with ${metadata.solverType}`,
        );

        const solver = this.createSolver(metadata.solverType, ...solverArgs);
        if (!solver) {
          continue;
        }

        const solution = await solver.solve(params);
        const duration = Date.now() - attemptStartTime;

        // Record success
        this.registry.recordSuccess(metadata.solverType);
        this.performanceTracker.recordAttempt(
          metadata.solverType,
          challengeType,
          duration,
          true,
        );

        this.logger.log(
          `Successfully solved ${challengeType} with ${metadata.solverType} in ${duration}ms`,
        );

        return solution;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Failed to solve with ${metadata.solverType}: ${error.message}`,
        );

        // Record failure
        this.registry.recordFailure(metadata.solverType);
        const failureDuration = Date.now() - attemptStartTime;
        this.performanceTracker.recordAttempt(
          metadata.solverType,
          challengeType,
          failureDuration,
          false,
          error.message,
        );

        // Continue to next solver
      }
    }

    // If last error is already a custom exception, rethrow it
    if (lastError instanceof SolverUnavailableException ||
        lastError instanceof ProviderException ||
        lastError instanceof InternalException) {
      throw lastError;
    }

    // Wrap in SolverUnavailableException
    throw new SolverUnavailableException(
      `All solvers failed to solve ${challengeType}: ${lastError?.message || 'Unknown error'}`,
      'native',
      'all_solvers_failed',
      {
        challengeType,
        attemptedSolvers: candidates.map(m => m.solverType),
        originalError: lastError?.message,
      },
    );
  }

  /**
   * Get available solvers for a challenge type
   */
  getAvailableSolvers(challengeType: CaptchaParams['type']): string[] {
    return this.registry
      .getSolversForChallengeType(challengeType)
      .map((m) => m.solverType);
  }
}

