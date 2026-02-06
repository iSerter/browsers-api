import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SolverRegistry } from './solver-registry.service';
import { ICaptchaSolver } from '../interfaces/captcha-solver.interface';
import {
  SolverCircuitBreakerService,
  CircuitState,
} from '../services/solver-circuit-breaker.service';

/**
 * Service for periodically checking solver health
 * Performs lightweight test challenges to verify solver availability
 */
@Injectable()
export class SolverHealthChecker implements OnModuleInit {
  private readonly logger = new Logger(SolverHealthChecker.name);
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly checkIntervalMs: number;

  constructor(
    private readonly registry: SolverRegistry,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: SolverCircuitBreakerService,
  ) {
    // Default to checking every 5 minutes, configurable via env
    this.checkIntervalMs =
      this.configService.get<number>(
        'CAPTCHA_SOLVER_HEALTH_CHECK_INTERVAL_MS',
      ) || 5 * 60 * 1000;
  }

  async onModuleInit() {
    this.logger.log(
      `Health Checker initialized (interval: ${this.checkIntervalMs}ms)`,
    );
    // Start health checks after a short delay
    setTimeout(() => this.startHealthChecks(), 10000);
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      this.logger.warn('Health checks are already running');
      return;
    }

    this.logger.log('Starting periodic health checks');
    this.performHealthChecks(); // Run immediately
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.checkIntervalMs,
    );
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.log('Stopped periodic health checks');
    }
  }

  /**
   * Perform health checks on all registered solvers
   */
  async performHealthChecks(): Promise<void> {
    const solvers = this.registry.getAll();
    this.logger.debug(`Performing health checks on ${solvers.length} solvers`);

    for (const metadata of solvers) {
      if (!metadata.capabilities.isEnabled) {
        continue; // Skip disabled solvers
      }

      try {
        await this.checkSolverHealth(metadata.solverType);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Error checking health of ${metadata.solverType}: ${errorMessage}`,
        );
      }
    }
  }

  /**
   * Check health of a specific solver
   */
  async checkSolverHealth(solverType: string): Promise<void> {
    const metadata = this.registry.get(solverType);
    if (!metadata) {
      this.logger.warn(`Solver ${solverType} not found in registry`);
      return;
    }

    this.registry.updateHealthStatus(solverType, 'validating');

    try {
      // Create a lightweight test - just check if solver is available
      // This is a minimal check that doesn't require solving an actual captcha
      const solver = this.createTestSolver(metadata);
      if (!solver) {
        this.registry.updateHealthStatus(solverType, 'unhealthy');
        return;
      }

      const isAvailable = await solver.isAvailable();
      if (isAvailable) {
        this.registry.updateHealthStatus(solverType, 'healthy');
        this.logger.debug(`Solver ${solverType} is healthy`);
      } else {
        this.registry.updateHealthStatus(solverType, 'unhealthy');
        this.logger.warn(`Solver ${solverType} is unavailable`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Health check failed for ${solverType}: ${errorMessage}`,
      );
      this.registry.updateHealthStatus(solverType, 'unhealthy');
    }
  }

  /**
   * Create a test solver instance for health checking
   * This is a simplified version that doesn't require full initialization
   */
  private createTestSolver(metadata: any): ICaptchaSolver | null {
    try {
      // Try to create solver with minimal dependencies
      // This will vary by solver implementation
      // For now, we'll just check if the constructor can be called
      // In a real implementation, solvers should provide a lightweight health check method
      return null; // Placeholder - actual implementation depends on solver constructors
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to create test solver for ${metadata.solverType}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Manually trigger a health check for a specific solver
   */
  async checkSolver(solverType: string): Promise<boolean> {
    await this.checkSolverHealth(solverType);
    const metadata = this.registry.get(solverType);
    return metadata?.healthStatus === 'healthy';
  }

  /**
   * Get health status of all solvers
   */
  getHealthStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    for (const metadata of this.registry.getAll()) {
      status[metadata.solverType] = metadata.healthStatus;
    }
    return status;
  }

  /**
   * Get comprehensive health status including circuit breaker states
   */
  getHealthStatusWithCircuitBreaker(): Record<
    string,
    {
      healthStatus: string;
      circuitBreakerState: CircuitState | null;
      isCircuitBreakerAvailable: boolean;
      circuitBreakerDetails: {
        state: CircuitState;
        consecutiveFailures: number;
        lastFailureTime: number;
        nextAttemptTime: number;
      } | null;
    }
  > {
    const status: Record<
      string,
      {
        healthStatus: string;
        circuitBreakerState: CircuitState | null;
        isCircuitBreakerAvailable: boolean;
        circuitBreakerDetails: {
          state: CircuitState;
          consecutiveFailures: number;
          lastFailureTime: number;
          nextAttemptTime: number;
        } | null;
      }
    > = {};

    const circuitBreakerStates = this.registry.getCircuitBreakerStates();

    for (const metadata of this.registry.getAll()) {
      const cbState = circuitBreakerStates[metadata.solverType];
      status[metadata.solverType] = {
        healthStatus: metadata.healthStatus,
        circuitBreakerState: cbState?.state || null,
        isCircuitBreakerAvailable: cbState?.isAvailable ?? true,
        circuitBreakerDetails: cbState?.details || null,
      };
    }

    return status;
  }
}

