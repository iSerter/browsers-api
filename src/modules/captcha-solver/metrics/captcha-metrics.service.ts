import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Service for tracking Prometheus metrics related to captcha solving.
 * Follows the same pattern as the existing MetricsService.
 */
@Injectable()
export class CaptchaMetricsService {
  private readonly solveAttemptsTotal = new Counter({
    name: 'captcha_solve_attempts_total',
    help: 'Total number of captcha solve attempts',
    labelNames: ['provider', 'captcha_type', 'status'],
  });

  private readonly solveDurationSeconds = new Histogram({
    name: 'captcha_solve_duration_seconds',
    help: 'Duration of captcha solve attempts in seconds',
    labelNames: ['provider', 'captcha_type'],
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
  });

  private readonly activeSolveAttempts = new Gauge({
    name: 'captcha_active_solve_attempts',
    help: 'Current number of in-flight captcha solve attempts',
    labelNames: ['provider'],
  });

  private readonly circuitBreakerTripsTotal = new Counter({
    name: 'captcha_circuit_breaker_trips_total',
    help: 'Total number of circuit breaker state transitions to OPEN',
    labelNames: ['solver_type'],
  });

  private readonly providerAvailable = new Gauge({
    name: 'captcha_provider_available',
    help: 'Whether a captcha provider is currently available (1 = available, 0 = unavailable)',
    labelNames: ['provider'],
  });

  /**
   * Record a successful solve attempt
   */
  recordSolveSuccess(provider: string, captchaType: string, durationMs: number): void {
    this.solveAttemptsTotal.inc({ provider, captcha_type: captchaType, status: 'success' });
    this.solveDurationSeconds.observe({ provider, captcha_type: captchaType }, durationMs / 1000);
  }

  /**
   * Record a failed solve attempt
   */
  recordSolveFailure(provider: string, captchaType: string, durationMs: number): void {
    this.solveAttemptsTotal.inc({ provider, captcha_type: captchaType, status: 'failure' });
    this.solveDurationSeconds.observe({ provider, captcha_type: captchaType }, durationMs / 1000);
  }

  /**
   * Increment active solve attempts gauge
   */
  incrementActiveSolves(provider: string): void {
    this.activeSolveAttempts.inc({ provider });
  }

  /**
   * Decrement active solve attempts gauge
   */
  decrementActiveSolves(provider: string): void {
    this.activeSolveAttempts.dec({ provider });
  }

  /**
   * Record a circuit breaker trip (transition to OPEN)
   */
  recordCircuitBreakerTrip(solverType: string): void {
    this.circuitBreakerTripsTotal.inc({ solver_type: solverType });
  }

  /**
   * Update provider availability status
   */
  setProviderAvailable(provider: string, available: boolean): void {
    this.providerAvailable.set({ provider }, available ? 1 : 0);
  }
}
