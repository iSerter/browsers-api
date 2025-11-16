import { CaptchaParams } from '../../interfaces/captcha-solver.interface';

/**
 * Challenge types supported by solvers
 */
export type ChallengeType = CaptchaParams['type'];

/**
 * Solver capability definition
 * Describes what a solver can do and its performance characteristics
 */
export interface SolverCapability {
  /**
   * Challenge types this solver supports
   */
  supportedChallengeTypes: ChallengeType[];

  /**
   * Maximum number of concurrent solving requests
   */
  maxConcurrency: number;

  /**
   * Average response time in milliseconds
   */
  averageResponseTime: number;

  /**
   * Success rate (0-1) based on historical performance
   */
  successRate: number;

  /**
   * Whether this solver is currently enabled
   */
  isEnabled: boolean;

  /**
   * Priority level (higher = more preferred)
   * Used for solver selection when multiple solvers support the same challenge type
   */
  priority: number;

  /**
   * Additional metadata about the solver
   */
  metadata?: Record<string, any>;
}

/**
 * Solver metadata stored in the registry
 */
export interface SolverMetadata {
  /**
   * Unique identifier for the solver type
   */
  solverType: string;

  /**
   * Solver class constructor or factory function
   */
  constructor: new (...args: any[]) => any;

  /**
   * Static capabilities declared by the solver
   */
  capabilities: SolverCapability;

  /**
   * Current health status
   */
  healthStatus: 'healthy' | 'unhealthy' | 'unknown' | 'validating';

  /**
   * Last health check timestamp
   */
  lastHealthCheck?: Date;

  /**
   * Last successful use timestamp
   */
  lastSuccessfulUse?: Date;

  /**
   * Last failure timestamp
   */
  lastFailure?: Date;

  /**
   * Number of consecutive failures
   */
  consecutiveFailures: number;

  /**
   * Total number of uses
   */
  totalUses: number;

  /**
   * Total number of failures
   */
  totalFailures: number;
}

/**
 * Performance metrics for a solving attempt
 */
export interface SolvingAttemptMetrics {
  /**
   * Solver type used
   */
  solverType: string;

  /**
   * Challenge type
   */
  challengeType: ChallengeType;

  /**
   * Duration in milliseconds
   */
  duration: number;

  /**
   * Whether the attempt was successful
   */
  success: boolean;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Timestamp of the attempt
   */
  timestamp: Date;
}

/**
 * Aggregated performance statistics
 */
export interface SolverPerformanceStats {
  /**
   * Solver type
   */
  solverType: string;

  /**
   * Total number of attempts
   */
  totalAttempts: number;

  /**
   * Number of successful attempts
   */
  successCount: number;

  /**
   * Number of failed attempts
   */
  failureCount: number;

  /**
   * Overall success rate (0-1)
   */
  successRate: number;

  /**
   * Average duration in milliseconds
   */
  averageDuration: number;

  /**
   * Statistics by challenge type
   */
  byChallengeType: Record<
    ChallengeType,
    {
      count: number;
      successCount: number;
      failureCount: number;
      successRate: number;
      averageDuration: number;
    }
  >;

  /**
   * Last successful attempt timestamp
   */
  lastSuccessfulAttempt?: Date;

  /**
   * Last failed attempt timestamp
   */
  lastFailedAttempt?: Date;
}

