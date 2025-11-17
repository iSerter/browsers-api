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
    } catch (error: any) {
      this.logger.error(
        `Failed to create solver ${solverType}: ${error.message}`,
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
   * Solve a challenge using the best available solver with fallback chain
   */
  async solveWithFallback(
    params: CaptchaParams,
    solverArgs: any[] = [],
  ): Promise<CaptchaSolution> {
    const challengeType = params.type;
    const correlationId = uuidv4();
    const candidates = this.registry.getSolversByPriority(challengeType);

    if (candidates.length === 0) {
      // Check if there are any solvers registered but circuit-broken
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

    let lastError: Error | null = null;
    const startTime = Date.now();

    this.logger.log(
      `Starting solve attempt for ${challengeType} [correlationId: ${correlationId}]`,
    );

    // Try each solver in priority order
    for (const metadata of candidates) {
      const attemptStartTime = Date.now();
      const solverType = metadata.solverType;
      
      // Check circuit breaker state before attempting
      const previousState = this.circuitBreaker.getState(solverType);
      const isAvailable = this.circuitBreaker.isAvailable(solverType);
      
      if (!isAvailable) {
        const stateDetails = this.circuitBreaker.getStateDetails(solverType);
        this.logger.warn(
          `Skipping solver ${solverType} - circuit breaker is ${previousState} [correlationId: ${correlationId}]`,
          { solverType, state: previousState, stateDetails },
        );
        continue;
      }

      try {
        this.logger.log(
          `Attempting to solve ${challengeType} with ${solverType} [correlationId: ${correlationId}]`,
        );

        const solver = this.createSolver(solverType, ...solverArgs);
        if (!solver) {
          this.logger.warn(
            `Failed to create solver ${solverType} [correlationId: ${correlationId}]`,
          );
          continue;
        }

        const solution = await solver.solve(params);
        const duration = Date.now() - attemptStartTime;

        // Record success with circuit breaker
        const stateBeforeSuccess = this.circuitBreaker.getState(solverType);
        this.circuitBreaker.recordSuccess(solverType);
        const stateAfterSuccess = this.circuitBreaker.getState(solverType);
        
        // Log state transition if it occurred
        if (stateBeforeSuccess !== stateAfterSuccess) {
          this.logger.log(
            `Circuit breaker for solver '${solverType}' transitioned from ${stateBeforeSuccess} to ${stateAfterSuccess} after successful solve [correlationId: ${correlationId}]`,
          );
        }

        // Record success with registry and performance tracker
        this.registry.recordSuccess(solverType);
        this.performanceTracker.recordAttempt(
          solverType,
          challengeType,
          duration,
          true,
        );

        this.logger.log(
          `Successfully solved ${challengeType} with ${solverType} in ${duration}ms [correlationId: ${correlationId}]`,
        );

        return solution;
      } catch (error: any) {
        lastError = error;
        
        // Record failure with circuit breaker
        const stateBeforeFailure = this.circuitBreaker.getState(solverType);
        this.circuitBreaker.recordFailure(solverType);
        const stateAfterFailure = this.circuitBreaker.getState(solverType);
        
        // Log state transition if it occurred
        if (stateBeforeFailure !== stateAfterFailure) {
          this.logger.warn(
            `Circuit breaker for solver '${solverType}' transitioned from ${stateBeforeFailure} to ${stateAfterFailure} after failure [correlationId: ${correlationId}]`,
          );
        }

        const failureDuration = Date.now() - attemptStartTime;
        const isCircuitBroken = !this.circuitBreaker.isAvailable(solverType);
        
        // Update error message to indicate circuit breaker state
        let errorMessage = error.message || 'Unknown error';
        if (isCircuitBroken) {
          errorMessage = `Solver ${solverType} failed and circuit breaker is now ${stateAfterFailure}: ${errorMessage}`;
        }

        this.logger.warn(
          `Failed to solve with ${solverType}: ${errorMessage} [correlationId: ${correlationId}]`,
          {
            solverType,
            challengeType,
            duration: failureDuration,
            circuitBreakerState: stateAfterFailure,
            isCircuitBroken,
          },
        );

        // Record failure with registry and performance tracker
        this.registry.recordFailure(solverType);
        this.performanceTracker.recordAttempt(
          solverType,
          challengeType,
          failureDuration,
          false,
          errorMessage,
        );

        // Continue to next solver
      }
    }

    // If last error is already a custom exception, enhance it with correlation ID
    if (lastError instanceof SolverUnavailableException ||
        lastError instanceof ProviderException ||
        lastError instanceof InternalException) {
      // Add correlation ID to context if not already present
      if (lastError.context && !lastError.context.correlationId) {
        lastError.context.correlationId = correlationId;
      }
      throw lastError;
    }

    // Wrap in SolverUnavailableException with correlation ID
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

