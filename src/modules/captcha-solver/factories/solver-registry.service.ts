import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ICaptchaSolver } from '../interfaces/captcha-solver.interface';
import {
  SolverMetadata,
  SolverCapability,
} from './interfaces/solver-capability.interface';

/**
 * Registry service for managing solver registrations
 * Implements singleton pattern for centralized solver management
 */
@Injectable()
export class SolverRegistry implements OnModuleInit {
  private readonly logger = new Logger(SolverRegistry.name);
  private readonly solvers: Map<string, SolverMetadata> = new Map();

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
   * Get solvers sorted by priority for a challenge type
   */
  getSolversByPriority(challengeType: string): SolverMetadata[] {
    const solvers = this.getSolversForChallengeType(challengeType);
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
}

