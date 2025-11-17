/**
 * Health check utilities
 * 
 * Provides utilities for creating health check functions and indicators
 * compatible with NestJS health check module.
 */

/**
 * Health check result
 */
export interface HealthCheckResult {
  /**
   * Name of the health check
   */
  name: string;

  /**
   * Whether the health check passed
   */
  isHealthy: boolean;

  /**
   * Optional message describing the health status
   */
  message?: string;

  /**
   * Optional additional metadata
   */
  metadata?: Record<string, any>;

  /**
   * Optional timestamp of the health check
   */
  timestamp?: Date;
}

/**
 * Health check function signature
 */
export type HealthCheckFunction = () => Promise<boolean>;

/**
 * Enhanced health check function that returns detailed results
 */
export type DetailedHealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Options for creating a health indicator
 */
export interface HealthIndicatorOptions {
  /**
   * Name of the health indicator
   */
  name: string;

  /**
   * Function that performs the health check
   */
  checkFn: HealthCheckFunction;

  /**
   * Optional timeout in milliseconds
   * @default 5000
   */
  timeoutMs?: number;

  /**
   * Optional function to get additional metadata
   */
  getMetadata?: () => Record<string, any> | Promise<Record<string, any>>;
}

/**
 * Create a health check function with timeout
 * 
 * Wraps a health check function with timeout handling and error catching.
 * 
 * @param options - Health indicator options
 * @returns A health check function that returns detailed results
 * 
 * @example
 * ```typescript
 * const checkDatabase = createHealthIndicator({
 *   name: 'database',
 *   checkFn: async () => {
 *     await db.ping();
 *     return true;
 *   },
 *   timeoutMs: 3000,
 * });
 * 
 * const result = await checkDatabase();
 * // { name: 'database', isHealthy: true, ... }
 * ```
 */
export function createHealthIndicator(
  options: HealthIndicatorOptions,
): DetailedHealthCheckFunction {
  const {
    name,
    checkFn,
    timeoutMs = 5000,
    getMetadata,
  } = options;

  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    let isHealthy = false;
    let message: string | undefined;
    let error: Error | undefined;

    try {
      // Create a promise that rejects on timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Race between the health check and timeout
      isHealthy = await Promise.race([checkFn(), timeoutPromise]);
      message = isHealthy ? 'Healthy' : 'Unhealthy';
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      isHealthy = false;
      message = error.message;
    }

    const duration = Date.now() - startTime;
    const metadata: Record<string, any> = {
      duration,
      ...(await getMetadata?.()),
    };

    if (error) {
      metadata.error = {
        name: error.name,
        message: error.message,
      };
    }

    return {
      name,
      isHealthy,
      message,
      metadata,
      timestamp: new Date(),
    };
  };
}

/**
 * Create a simple health check function
 * 
 * Creates a basic health check function that wraps an async check.
 * 
 * @param name - Name of the health check
 * @param checkFn - Function that performs the health check
 * @returns A health check function
 * 
 * @example
 * ```typescript
 * const checkSolver = createHealthCheck('solver', async () => {
 *   return await solver.isAvailable();
 * });
 * 
 * const isHealthy = await checkSolver();
 * ```
 */
export function createHealthCheck(
  name: string,
  checkFn: HealthCheckFunction,
): DetailedHealthCheckFunction {
  return createHealthIndicator({
    name,
    checkFn,
  });
}

/**
 * Combine multiple health checks into a single result
 * 
 * Runs multiple health checks and combines their results.
 * 
 * @param checks - Array of health check functions
 * @returns Combined health check result
 * 
 * @example
 * ```typescript
 * const combinedCheck = combineHealthChecks([
 *   createHealthCheck('database', checkDatabase),
 *   createHealthCheck('cache', checkCache),
 *   createHealthCheck('solver', checkSolver),
 * ]);
 * 
 * const result = await combinedCheck();
 * // { name: 'combined', isHealthy: true, metadata: { ... } }
 * ```
 */
export async function combineHealthChecks(
  checks: DetailedHealthCheckFunction[],
): Promise<HealthCheckResult> {
  const results = await Promise.all(checks.map((check) => check()));

  const allHealthy = results.every((result) => result.isHealthy);
  const metadata: Record<string, any> = {};

  for (const result of results) {
    metadata[result.name] = {
      isHealthy: result.isHealthy,
      message: result.message,
      ...result.metadata,
    };
  }

  return {
    name: 'combined',
    isHealthy: allHealthy,
    message: allHealthy
      ? 'All health checks passed'
      : 'Some health checks failed',
    metadata,
    timestamp: new Date(),
  };
}

/**
 * Create a health check that always passes
 * 
 * Useful for testing or as a placeholder.
 * 
 * @param name - Name of the health check
 * @returns A health check function that always returns healthy
 */
export function createAlwaysHealthyCheck(
  name: string,
): DetailedHealthCheckFunction {
  return async (): Promise<HealthCheckResult> => {
    return {
      name,
      isHealthy: true,
      message: 'Always healthy',
      timestamp: new Date(),
    };
  };
}

/**
 * Create a health check that always fails
 * 
 * Useful for testing error handling.
 * 
 * @param name - Name of the health check
 * @param message - Optional failure message
 * @returns A health check function that always returns unhealthy
 */
export function createAlwaysUnhealthyCheck(
  name: string,
  message: string = 'Always unhealthy',
): DetailedHealthCheckFunction {
  return async (): Promise<HealthCheckResult> => {
    return {
      name,
      isHealthy: false,
      message,
      timestamp: new Date(),
    };
  };
}

