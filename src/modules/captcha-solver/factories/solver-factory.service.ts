import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ICaptchaSolver, CaptchaParams, CaptchaSolution } from '../interfaces/captcha-solver.interface';
import { SolverRegistry } from './solver-registry.service';
import { SolverPerformanceTracker } from './solver-performance-tracker.service';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import {
  SolverUnavailableException,
  InternalException,
  ProviderException,
} from '../exceptions';
import { SolverCircuitBreakerService, CircuitState } from '../services/solver-circuit-breaker.service';
import { CaptchaMetricsService } from '../metrics/captcha-metrics.service';

/**
 * Type for solver creation strategy function
 */
type SolverCreationStrategy = (
  metadata: any,
  args: any[],
) => ICaptchaSolver | null;

/**
 * Factory service for creating and selecting solvers
 * Implements intelligent solver selection based on capabilities, health, and performance
 */
@Injectable()
export class SolverFactory {
  private readonly logger = new Logger(SolverFactory.name);

  /**
   * Map of solver types to their creation strategies
   * Adding new solver types only requires adding an entry here
   */
  private readonly solverStrategies = new Map<
    string,
    SolverCreationStrategy
  >([
    ['turnstile-native', this.createTurnstileNativeSolver.bind(this)],
    ['recaptcha-native', this.createRecaptchaNativeSolver.bind(this)],
    ['hcaptcha-native', this.createHCaptchaNativeSolver.bind(this)],
    ['datadome-native', this.createDataDomeNativeSolver.bind(this)],
    ['akamai-native', this.createAkamaiNativeSolver.bind(this)],
  ]);

  constructor(
    private readonly registry: SolverRegistry,
    private readonly performanceTracker: SolverPerformanceTracker,
    private readonly circuitBreaker: SolverCircuitBreakerService,
    private readonly captchaMetrics?: CaptchaMetricsService,
    private readonly widgetInteraction?: CaptchaWidgetInteractionService,
  ) {}

  /**
   * Create a solver instance by type
   * Uses strategy pattern to simplify solver creation logic
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
      // Get strategy for this solver type, or use default standard instantiation
      const strategy = this.solverStrategies.get(solverType);
      if (strategy) {
        return strategy(metadata, args);
      }

      // For solvers not in the strategy map, use standard instantiation
      return this.createStandardSolver(metadata, args);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to create solver ${solverType}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Create Turnstile native solver with required services
   */
  private createTurnstileNativeSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver | null {
    if (!this.widgetInteraction) {
      this.logger.warn(
        'Turnstile native solver requires widgetInteraction service',
      );
      return null;
    }
    return new metadata.constructor(
      ...args,
      this.widgetInteraction,
      this.performanceTracker,
    );
  }

  /**
   * Create reCAPTCHA native solver
   * NativeRecaptchaSolver requires: page, widgetInteraction, audioProcessing, behaviorSimulation, performanceTracker, config
   * These are passed in args
   */
  private createRecaptchaNativeSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver | null {
    if (!this.widgetInteraction) {
      this.logger.warn(
        'reCAPTCHA native solver requires widgetInteraction service',
      );
      return null;
    }
    return new metadata.constructor(...args);
  }

  /**
   * Create hCAPTCHA native solver
   * NativeHcaptchaSolver requires: page, widgetInteraction, audioProcessing, performanceTracker, config
   * These are passed in args
   */
  private createHCaptchaNativeSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver | null {
    if (!this.widgetInteraction) {
      this.logger.warn(
        'hCAPTCHA native solver requires widgetInteraction service',
      );
      return null;
    }
    return new metadata.constructor(...args);
  }

  /**
   * Create DataDome native solver
   * NativeDataDomeSolver requires: page, widgetInteraction, behaviorSimulation, performanceTracker, config
   * These are passed in args
   */
  private createDataDomeNativeSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver | null {
    if (!this.widgetInteraction) {
      this.logger.warn(
        'DataDome native solver requires widgetInteraction service',
      );
      return null;
    }
    return new metadata.constructor(...args);
  }

  /**
   * Create Akamai native solver
   * NativeAkamaiSolver requires: page, widgetInteraction, behaviorSimulation, performanceTracker, config
   * These are passed in args
   */
  private createAkamaiNativeSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver | null {
    if (!this.widgetInteraction) {
      this.logger.warn(
        'Akamai native solver requires widgetInteraction service',
      );
      return null;
    }
    return new metadata.constructor(...args);
  }

  /**
   * Create standard solver with default instantiation
   * Used for solvers not requiring special service injection
   */
  private createStandardSolver(
    metadata: any,
    args: any[],
  ): ICaptchaSolver {
    return new metadata.constructor(...args);
  }

  /**
   * Select the best solver for a challenge type
   * Returns solver metadata sorted by priority, health, and performance
   * Only considers solvers that are available according to circuit breaker
   */
  selectBestSolver(challengeType: CaptchaParams['type']): string | null {
    const candidates = this.registry.getSolversByPriority(challengeType);

    if (candidates.length === 0) {
      // Check if there are any solvers registered but circuit-broken
      const allSolvers = this.registry.getSolversForChallengeType(challengeType);
      if (allSolvers.length > 0) {
        this.logger.warn(
          `No available solvers for challenge type: ${challengeType} - all ${allSolvers.length} solvers are circuit-broken or unavailable`,
        );
      } else {
        this.logger.warn(
          `No enabled solvers found for challenge type: ${challengeType}`,
        );
      }
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
   * Try a single solver and return the result with tracking
   */
  private async trySingleSolver(
    solverType: string,
    params: CaptchaParams,
    solverArgs: any[],
    correlationId: string,
  ): Promise<CaptchaSolution> {
    const attemptStartTime = Date.now();
    const challengeType = params.type;

    this.logger.log(
      `Attempting to solve ${challengeType} with ${solverType} [correlationId: ${correlationId}]`,
    );

    const solver = this.createSolver(solverType, ...solverArgs);
    if (!solver) {
      throw new SolverUnavailableException(
        `Failed to create solver ${solverType}`,
        'native',
        'solver_creation_failed',
        { solverType, correlationId },
      );
    }

    this.captchaMetrics?.incrementActiveSolves(solverType);

    try {
      const solution = await solver.solve(params);
      const duration = Date.now() - attemptStartTime;

      // Record success with circuit breaker
      const stateBeforeSuccess = this.circuitBreaker.getState(solverType);
      this.circuitBreaker.recordSuccess(solverType);
      const stateAfterSuccess = this.circuitBreaker.getState(solverType);

      if (stateBeforeSuccess !== stateAfterSuccess) {
        this.logger.log(
          `Circuit breaker for solver '${solverType}' transitioned from ${stateBeforeSuccess} to ${stateAfterSuccess} after successful solve [correlationId: ${correlationId}]`,
        );
      }

      this.registry.recordSuccess(solverType);
      this.performanceTracker.recordAttempt(solverType, challengeType, duration, true);
      this.captchaMetrics?.recordSolveSuccess(solverType, challengeType, duration);

      this.logger.log(
        `Successfully solved ${challengeType} with ${solverType} in ${duration}ms [correlationId: ${correlationId}]`,
      );

      return solution;
    } catch (error: unknown) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));

      const stateBeforeFailure = this.circuitBreaker.getState(solverType);
      this.circuitBreaker.recordFailure(solverType);
      const stateAfterFailure = this.circuitBreaker.getState(solverType);

      if (stateBeforeFailure !== stateAfterFailure) {
        this.logger.warn(
          `Circuit breaker for solver '${solverType}' transitioned from ${stateBeforeFailure} to ${stateAfterFailure} after failure [correlationId: ${correlationId}]`,
        );
        if (stateAfterFailure === CircuitState.OPEN) {
          this.captchaMetrics?.recordCircuitBreakerTrip(solverType);
        }
      }

      const failureDuration = Date.now() - attemptStartTime;
      const isCircuitBroken = !this.circuitBreaker.isAvailable(solverType);

      let errorMessage = wrappedError.message || 'Unknown error';
      if (isCircuitBroken) {
        errorMessage = `Solver ${solverType} failed and circuit breaker is now ${stateAfterFailure}: ${errorMessage}`;
      }

      this.logger.warn(
        `Failed to solve with ${solverType}: ${errorMessage} [correlationId: ${correlationId}]`,
        { solverType, challengeType, duration: failureDuration, circuitBreakerState: stateAfterFailure, isCircuitBroken },
      );

      this.registry.recordFailure(solverType);
      this.performanceTracker.recordAttempt(solverType, challengeType, failureDuration, false, errorMessage);
      this.captchaMetrics?.recordSolveFailure(solverType, challengeType, failureDuration);

      throw wrappedError;
    } finally {
      this.captchaMetrics?.decrementActiveSolves(solverType);
    }
  }

  /**
   * Race multiple solvers in parallel — first success wins, all-fail rejects
   */
  async solveInParallel(
    params: CaptchaParams,
    solverTypes: string[],
    solverArgs: any[] = [],
    correlationId: string = uuidv4(),
  ): Promise<CaptchaSolution> {
    if (solverTypes.length === 0) {
      throw new SolverUnavailableException(
        'No solvers provided for parallel execution',
        'native',
        'no_solvers_for_parallel',
        { correlationId },
      );
    }

    if (solverTypes.length === 1) {
      return this.trySingleSolver(solverTypes[0], params, solverArgs, correlationId);
    }

    this.logger.log(
      `Starting parallel solve for ${params.type} with ${solverTypes.length} solvers [correlationId: ${correlationId}]`,
    );

    // Race-to-success: first settled promise that fulfills wins
    const results = await Promise.allSettled(
      solverTypes.map(solverType =>
        this.trySingleSolver(solverType, params, solverArgs, correlationId),
      ),
    );

    // Return first successful result
    for (const result of results) {
      if (result.status === 'fulfilled') {
        return result.value;
      }
    }

    // All failed — collect errors
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));

    throw new SolverUnavailableException(
      `All ${solverTypes.length} parallel solvers failed for ${params.type}: ${errors.join('; ')}`,
      'native',
      'all_parallel_solvers_failed',
      {
        challengeType: params.type,
        correlationId,
        attemptedSolvers: solverTypes,
        errors,
      },
    );
  }

  /**
   * Solve a challenge using the best available solver with fallback chain.
   * Tries top 3 candidates in parallel first, then falls back to sequential for remaining.
   */
  async solveWithFallback(
    params: CaptchaParams,
    solverArgs: any[] = [],
  ): Promise<CaptchaSolution> {
    const challengeType = params.type;
    const correlationId = uuidv4();
    const candidates = this.registry.getSolversByPriority(challengeType);

    if (candidates.length === 0) {
      const allSolvers = this.registry.getSolversForChallengeType(challengeType);
      if (allSolvers.length > 0) {
        const circuitBrokenSolvers = allSolvers
          .filter(m => !this.circuitBreaker.isAvailable(m.solverType))
          .map(m => ({
            solverType: m.solverType,
            state: this.circuitBreaker.getState(m.solverType),
          }));

        throw new SolverUnavailableException(
          `No available solvers for challenge type: ${challengeType} - all ${allSolvers.length} solvers are circuit-broken or unavailable`,
          'native',
          'all_solvers_circuit_broken',
          {
            challengeType,
            correlationId,
            registeredSolvers: allSolvers.map(m => m.solverType),
            circuitBrokenSolvers,
          },
        );
      } else {
        throw new SolverUnavailableException(
          `No enabled solvers found for challenge type: ${challengeType}`,
          'native',
          'no_solvers_enabled',
          { challengeType, correlationId },
        );
      }
    }

    // Filter to available solvers (circuit breaker check)
    const availableCandidates = candidates.filter(metadata => {
      const isAvailable = this.circuitBreaker.isAvailable(metadata.solverType);
      if (!isAvailable) {
        const previousState = this.circuitBreaker.getState(metadata.solverType);
        this.logger.warn(
          `Skipping solver ${metadata.solverType} - circuit breaker is ${previousState} [correlationId: ${correlationId}]`,
        );
      }
      return isAvailable;
    });

    if (availableCandidates.length === 0) {
      throw new SolverUnavailableException(
        `All solvers for ${challengeType} are circuit-broken`,
        'native',
        'all_solvers_circuit_broken',
        { challengeType, correlationId },
      );
    }

    this.logger.log(
      `Starting solve attempt for ${challengeType} with ${availableCandidates.length} available solvers [correlationId: ${correlationId}]`,
    );

    // Phase 1: Try top candidates in parallel (up to 3)
    const parallelCount = Math.min(3, availableCandidates.length);
    const parallelCandidates = availableCandidates.slice(0, parallelCount);
    const remainingCandidates = availableCandidates.slice(parallelCount);

    try {
      return await this.solveInParallel(
        params,
        parallelCandidates.map(m => m.solverType),
        solverArgs,
        correlationId,
      );
    } catch (parallelError: unknown) {
      if (remainingCandidates.length === 0) {
        // No remaining candidates — rethrow
        if (parallelError instanceof SolverUnavailableException ||
            parallelError instanceof ProviderException ||
            parallelError instanceof InternalException) {
          throw parallelError;
        }
        const errorMessage = parallelError instanceof Error ? parallelError.message : 'Unknown error';
        throw new SolverUnavailableException(
          `All solvers failed to solve ${challengeType}: ${errorMessage}`,
          'native',
          'all_solvers_failed',
          { challengeType, correlationId },
        );
      }

      this.logger.warn(
        `Parallel phase failed, falling back to sequential for ${remainingCandidates.length} remaining solvers [correlationId: ${correlationId}]`,
      );
    }

    // Phase 2: Sequential fallback for remaining candidates
    let lastError: Error | null = null;

    for (const metadata of remainingCandidates) {
      const solverType = metadata.solverType;

      if (!this.circuitBreaker.isAvailable(solverType)) {
        continue;
      }

      try {
        return await this.trySingleSolver(solverType, params, solverArgs, correlationId);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // All solvers failed
    if (lastError instanceof SolverUnavailableException ||
        lastError instanceof ProviderException ||
        lastError instanceof InternalException) {
      if (lastError.context && !lastError.context.correlationId) {
        lastError.context.correlationId = correlationId;
      }
      throw lastError;
    }

    throw new SolverUnavailableException(
      `All solvers failed to solve ${challengeType}: ${lastError?.message || 'Unknown error'}`,
      'native',
      'all_solvers_failed',
      {
        challengeType,
        correlationId,
        attemptedSolvers: candidates.map(m => m.solverType),
        originalError: lastError?.message,
      },
    );
  }

  /**
   * Get available solvers for a challenge type
   * Only returns solvers that are available according to circuit breaker
   */
  getAvailableSolvers(challengeType: CaptchaParams['type']): string[] {
    return this.registry
      .getAvailableSolvers(challengeType)
      .map((m) => m.solverType);
  }

  /**
   * Get all solvers for a challenge type including unavailable ones (for monitoring)
   */
  getAllSolvers(challengeType: CaptchaParams['type']): Array<{
    solverType: string;
    circuitBreakerState: string | null;
    isCircuitBreakerAvailable: boolean;
  }> {
    // Note: circuitBreakerState is returned as string to avoid circular dependency
    // The actual type is CircuitState | null
    return this.registry
      .getAllSolversForChallengeType(challengeType)
      .map((m) => ({
        solverType: m.solverType,
        circuitBreakerState: m.circuitBreakerState,
        isCircuitBreakerAvailable: m.isCircuitBreakerAvailable,
      }));
  }
}

