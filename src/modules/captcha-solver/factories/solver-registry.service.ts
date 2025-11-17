import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ICaptchaSolver } from '../interfaces/captcha-solver.interface';
import {
  SolverMetadata,
  SolverCapability,
} from './interfaces/solver-capability.interface';
import {
  SolverCircuitBreakerService,
  CircuitState,
} from '../services/solver-circuit-breaker.service';

/**
 * Registry service for managing solver registrations
 * Implements singleton pattern for centralized solver management
 */
@Injectable()
export class SolverRegistry implements OnModuleInit {
  private readonly logger = new Logger(SolverRegistry.name);
  private readonly solvers: Map<string, SolverMetadata> = new Map();

  constructor(
    private readonly circuitBreaker: SolverCircuitBreakerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Solver Registry initialized');
  }

  /**
   * Register a solver with its capabilities
   */
  register(
    solverType: string,
    constructor: new (...args: any[]) => ICaptchaSolver,
    capabilities: SolverCapability,
  ): void {
    if (this.solvers.has(solverType)) {
      this.logger.warn(
        `Solver ${solverType} is already registered. Overwriting...`,
      );
    }

    const metadata: SolverMetadata = {
      solverType,
      constructor,
      capabilities,
      healthStatus: 'unknown',
      consecutiveFailures: 0,
      totalUses: 0,
      totalFailures: 0,
    };

    this.solvers.set(solverType, metadata);
    this.logger.log(
      `Registered solver: ${solverType} (supports: ${capabilities.supportedChallengeTypes.join(', ')})`,
    );
  }

  /**
   * Get solver metadata by type
   */
  get(solverType: string): SolverMetadata | undefined {
    return this.solvers.get(solverType);
  }

  /**
   * Check if a solver is registered
   */
  has(solverType: string): boolean {
    return this.solvers.has(solverType);
  }

  /**
   * Get all registered solver types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.solvers.keys());
  }

  /**
   * Get all solver metadata
   */
  getAll(): SolverMetadata[] {
    return Array.from(this.solvers.values());
  }

  /**
   * Get solvers that support a specific challenge type
   * This method returns all enabled solvers regardless of circuit breaker state
   */
  getSolversForChallengeType(challengeType: string): SolverMetadata[] {
    return Array.from(this.solvers.values()).filter(
      (metadata) =>
        metadata.capabilities.supportedChallengeTypes.includes(
          challengeType as any,
        ) && metadata.capabilities.isEnabled,
    );
  }

  /**
   * Get available solvers for a challenge type, filtered by circuit breaker state
   * Only returns solvers where the circuit breaker is available (closed or half-open)
   */
  getAvailableSolvers(challengeType: string): SolverMetadata[] {
    const allSolvers = this.getSolversForChallengeType(challengeType);
    const availableSolvers: SolverMetadata[] = [];

    for (const metadata of allSolvers) {
      const isAvailable = this.circuitBreaker.isAvailable(metadata.solverType);
      if (isAvailable) {
        availableSolvers.push(metadata);
      } else {
        this.logger.debug(
          `Solver '${metadata.solverType}' excluded from available solvers due to circuit breaker (state: ${this.circuitBreaker.getState(metadata.solverType)})`,
        );
      }
    }

    if (availableSolvers.length === 0 && allSolvers.length > 0) {
      this.logger.warn(
        `No available solvers for challenge type '${challengeType}' - all ${allSolvers.length} solvers are circuit-broken`,
      );
    }

    return availableSolvers;
  }

  /**
   * Get solvers sorted by priority for a challenge type
   * Only returns solvers that are available according to circuit breaker
   */
  getSolversByPriority(challengeType: string): SolverMetadata[] {
    const solvers = this.getAvailableSolvers(challengeType);
    return solvers.sort((a, b) => {
      // First sort by health status (healthy > unknown > unhealthy)
      const healthOrder = {
        healthy: 0,
        unknown: 1,
        unhealthy: 2,
        validating: 3,
      };
      const healthDiff =
        healthOrder[a.healthStatus] - healthOrder[b.healthStatus];
      if (healthDiff !== 0) {
        return healthDiff;
      }

      // Then by priority (higher is better)
      const priorityDiff = b.capabilities.priority - a.capabilities.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then by success rate (higher is better)
      return (
        b.capabilities.successRate - a.capabilities.successRate
      );
    });
  }

  /**
   * Get all solvers for a challenge type including unavailable ones (for monitoring)
   * Returns both available and circuit-broken solvers with their states
   */
  getAllSolversForChallengeType(challengeType: string): Array<
    SolverMetadata & {
      circuitBreakerState: CircuitState | null;
      isCircuitBreakerAvailable: boolean;
    }
  > {
    const allSolvers = this.getSolversForChallengeType(challengeType);
    return allSolvers.map((metadata) => {
      const circuitBreakerState = this.circuitBreaker.getState(
        metadata.solverType,
      );
      const isCircuitBreakerAvailable = this.circuitBreaker.isAvailable(
        metadata.solverType,
      );

      return {
        ...metadata,
        circuitBreakerState: circuitBreakerState || null,
        isCircuitBreakerAvailable,
      };
    });
  }

  /**
   * Update solver health status
   */
  updateHealthStatus(
    solverType: string,
    status: SolverMetadata['healthStatus'],
  ): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.healthStatus = status;
      metadata.lastHealthCheck = new Date();
    }
  }

  /**
   * Update solver capabilities (e.g., after performance tracking)
   */
  updateCapabilities(
    solverType: string,
    updates: Partial<SolverCapability>,
  ): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.capabilities = {
        ...metadata.capabilities,
        ...updates,
      };
    }
  }

  /**
   * Record a successful use
   */
  recordSuccess(solverType: string): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.lastSuccessfulUse = new Date();
      metadata.consecutiveFailures = 0;
      metadata.totalUses += 1;
      metadata.healthStatus = 'healthy';
    }
  }

  /**
   * Record a failed use
   */
  recordFailure(solverType: string): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.lastFailure = new Date();
      metadata.consecutiveFailures += 1;
      metadata.totalUses += 1;
      metadata.totalFailures += 1;

      // Mark as unhealthy after 3 consecutive failures
      if (metadata.consecutiveFailures >= 3) {
        metadata.healthStatus = 'unhealthy';
      } else if (metadata.consecutiveFailures === 1) {
        // First failure - mark as unknown if it was healthy
        if (metadata.healthStatus === 'healthy') {
          metadata.healthStatus = 'unknown';
        }
      }
    }
  }

  /**
   * Enable a solver
   */
  enable(solverType: string): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.capabilities.isEnabled = true;
      this.logger.log(`Enabled solver: ${solverType}`);
    }
  }

  /**
   * Disable a solver
   */
  disable(solverType: string): void {
    const metadata = this.solvers.get(solverType);
    if (metadata) {
      metadata.capabilities.isEnabled = false;
      this.logger.log(`Disabled solver: ${solverType}`);
    }
  }

  /**
   * Unregister a solver
   */
  unregister(solverType: string): void {
    if (this.solvers.delete(solverType)) {
      this.logger.log(`Unregistered solver: ${solverType}`);
    }
  }

  /**
   * Clear all registered solvers
   */
  clear(): void {
    this.solvers.clear();
    this.logger.log('Cleared all solver registrations');
  }

  /**
   * Get count of registered solvers
   */
  getCount(): number {
    return this.solvers.size;
  }

  /**
   * Get circuit breaker states for all solvers (for health check reporting)
   */
  getCircuitBreakerStates(): Record<
    string,
    {
      state: CircuitState | null;
      isAvailable: boolean;
      details: {
        state: CircuitState;
        consecutiveFailures: number;
        lastFailureTime: number;
        nextAttemptTime: number;
      } | null;
    }
  > {
    const states: Record<
      string,
      {
        state: CircuitState | null;
        isAvailable: boolean;
        details: {
          state: CircuitState;
          consecutiveFailures: number;
          lastFailureTime: number;
          nextAttemptTime: number;
        } | null;
      }
    > = {};

    for (const metadata of this.solvers.values()) {
      const state = this.circuitBreaker.getState(metadata.solverType);
      const details = this.circuitBreaker.getStateDetails(metadata.solverType);
      const isAvailable = this.circuitBreaker.isAvailable(metadata.solverType);

      states[metadata.solverType] = {
        state: state || null,
        isAvailable,
        details: details
          ? {
              state: details.state,
              consecutiveFailures: details.consecutiveFailures,
              lastFailureTime: details.lastFailureTime,
              nextAttemptTime: details.nextAttemptTime,
            }
          : null,
      };
    }

    return states;
  }
}

