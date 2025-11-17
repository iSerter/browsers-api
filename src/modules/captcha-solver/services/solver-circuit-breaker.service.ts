import { Injectable, Logger } from '@nestjs/common';
import { CaptchaSolverConfigService } from '../config';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /**
   * Circuit is closed - normal operation, allowing requests
   */
  CLOSED = 'CLOSED',

  /**
   * Circuit is open - blocking requests due to failures
   */
  OPEN = 'OPEN',

  /**
   * Circuit is half-open - testing if service has recovered
   */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * State information for a solver's circuit breaker
 */
interface SolverState {
  /**
   * Current circuit breaker state
   */
  state: CircuitState;

  /**
   * Number of consecutive failures
   */
  consecutiveFailures: number;

  /**
   * Timestamp of the last failure
   */
  lastFailureTime: number;

  /**
   * Timestamp when the circuit should attempt to transition to half-open
   */
  nextAttemptTime: number;
}

/**
 * Service for managing circuit breakers per solver type
 * Tracks failures and temporarily disables failing solvers
 */
@Injectable()
export class SolverCircuitBreakerService {
  private readonly logger = new Logger(SolverCircuitBreakerService.name);

  /**
   * Map of solver type to circuit breaker state
   */
  private readonly solverStates = new Map<string, SolverState>();

  /**
   * Circuit breaker configuration
   */
  private readonly config: {
    failureThreshold: number;
    timeoutPeriod: number;
  };

  constructor(private readonly configService: CaptchaSolverConfigService) {
    const circuitBreakerConfig = this.configService.getCircuitBreakerConfig();
    this.config = {
      failureThreshold: circuitBreakerConfig.failureThreshold,
      timeoutPeriod: circuitBreakerConfig.timeoutPeriod,
    };

    this.logger.log(
      `Circuit breaker initialized with failureThreshold=${this.config.failureThreshold}, timeoutPeriod=${this.config.timeoutPeriod}ms`,
    );
  }

  /**
   * Record a successful operation for a solver
   * Resets failure count and closes the circuit if it was open or half-open
   */
  recordSuccess(solverType: string): void {
    const state = this.getOrCreateState(solverType);
    const previousState = state.state;

    // Reset failure count
    state.consecutiveFailures = 0;
    state.lastFailureTime = 0;
    state.nextAttemptTime = 0;

    // If circuit was open or half-open, close it
    if (state.state !== CircuitState.CLOSED) {
      state.state = CircuitState.CLOSED;
      this.logger.log(
        `Circuit breaker for solver '${solverType}' transitioned from ${previousState} to CLOSED after successful operation`,
      );
    }
  }

  /**
   * Record a failure for a solver
   * Increments failure count and opens circuit if threshold is reached
   */
  recordFailure(solverType: string): void {
    const state = this.getOrCreateState(solverType);
    const previousState = state.state;

    // Increment failure count
    state.consecutiveFailures += 1;
    const now = Date.now();
    state.lastFailureTime = now;

    // If in half-open state, any failure immediately opens the circuit
    if (state.state === CircuitState.HALF_OPEN) {
      state.state = CircuitState.OPEN;
      state.nextAttemptTime = now + this.config.timeoutPeriod;
      this.logger.warn(
        `Circuit breaker for solver '${solverType}' transitioned from HALF_OPEN to OPEN after failure (attempt failed)`,
      );
      return;
    }

    // Check if we've reached the failure threshold
    if (state.consecutiveFailures >= this.config.failureThreshold) {
      if (state.state === CircuitState.CLOSED) {
        state.state = CircuitState.OPEN;
        state.nextAttemptTime = now + this.config.timeoutPeriod;
        this.logger.warn(
          `Circuit breaker for solver '${solverType}' transitioned from CLOSED to OPEN after ${state.consecutiveFailures} consecutive failures`,
        );
      }
    } else {
      this.logger.debug(
        `Solver '${solverType}' failure recorded (${state.consecutiveFailures}/${this.config.failureThreshold})`,
      );
    }
  }

  /**
   * Check if a solver is available (circuit is closed or half-open)
   * Automatically transitions from OPEN to HALF_OPEN after timeout period
   */
  isAvailable(solverType: string): boolean {
    const state = this.solverStates.get(solverType);

    // If no state exists, solver is available
    if (!state) {
      return true;
    }

    const now = Date.now();

    // If circuit is open, check if timeout period has elapsed
    if (state.state === CircuitState.OPEN) {
      if (now >= state.nextAttemptTime) {
        // Timeout period has elapsed, transition to half-open
        state.state = CircuitState.HALF_OPEN;
        this.logger.log(
          `Circuit breaker for solver '${solverType}' transitioned from OPEN to HALF_OPEN (timeout period elapsed, attempting recovery)`,
        );
        return true; // Allow one attempt in half-open state
      }
      // Still in timeout period
      return false;
    }

    // Circuit is closed or half-open, solver is available
    return state.state === CircuitState.CLOSED || state.state === CircuitState.HALF_OPEN;
  }

  /**
   * Manually reset the circuit breaker for a solver
   * Closes the circuit and resets all failure tracking
   */
  reset(solverType: string): void {
    const state = this.solverStates.get(solverType);
    if (state) {
      const previousState = state.state;
      state.state = CircuitState.CLOSED;
      state.consecutiveFailures = 0;
      state.lastFailureTime = 0;
      state.nextAttemptTime = 0;
      this.logger.log(
        `Circuit breaker for solver '${solverType}' manually reset from ${previousState} to CLOSED`,
      );
    } else {
      this.logger.debug(
        `Attempted to reset circuit breaker for solver '${solverType}' but no state exists`,
      );
    }
  }

  /**
   * Get the current state of a solver's circuit breaker
   */
  getState(solverType: string): CircuitState | null {
    const state = this.solverStates.get(solverType);
    return state ? state.state : null;
  }

  /**
   * Get detailed state information for a solver
   */
  getStateDetails(solverType: string): {
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } | null {
    const state = this.solverStates.get(solverType);
    if (!state) {
      return null;
    }

    return {
      state: state.state,
      consecutiveFailures: state.consecutiveFailures,
      lastFailureTime: state.lastFailureTime,
      nextAttemptTime: state.nextAttemptTime,
    };
  }

  /**
   * Get all solver states (for monitoring/debugging)
   */
  getAllStates(): Map<string, SolverState> {
    return new Map(this.solverStates);
  }

  /**
   * Get or create state for a solver type
   */
  private getOrCreateState(solverType: string): SolverState {
    let state = this.solverStates.get(solverType);
    if (!state) {
      state = {
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      };
      this.solverStates.set(solverType, state);
    }
    return state;
  }
}

