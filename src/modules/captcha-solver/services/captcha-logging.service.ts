import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
} from '../interfaces/detection.interface';
import { CaptchaSolution } from '../interfaces/captcha-solver.interface';

/**
 * Structured log entry for detection operations
 */
export interface DetectionLogEntry {
  operation: 'detection';
  systemType?: AntiBotSystemType;
  detected: boolean;
  confidence: number;
  durationMs: number;
  url?: string;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  signals?: number;
  metadata?: Record<string, any>;
}

/**
 * Structured log entry for solving operations
 */
export interface SolvingLogEntry {
  operation: 'solving';
  solverType: string;
  challengeType: string;
  success: boolean;
  durationMs: number;
  attempt: number;
  maxAttempts: number;
  url?: string;
  solution?: {
    token?: string;
    solvedAt?: Date;
  };
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  usedThirdParty?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Statistics for captcha operations
 */
export interface CaptchaStatistics {
  detection: {
    total: number;
    successful: number;
    failed: number;
    averageDurationMs: number;
    bySystemType: Record<string, {
      count: number;
      successRate: number;
      averageDurationMs: number;
    }>;
  };
  solving: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    averageDurationMs: number;
    bySolverType: Record<string, {
      count: number;
      successRate: number;
      averageDurationMs: number;
    }>;
    byChallengeType: Record<string, {
      count: number;
      successRate: number;
      averageDurationMs: number;
    }>;
  };
  lastUpdated: Date;
}

/**
 * Alert configuration for repeated failures
 */
export interface AlertConfig {
  /** Number of consecutive failures before alerting */
  consecutiveFailureThreshold: number;
  /** Time window in milliseconds to check for failures */
  timeWindowMs: number;
  /** Minimum number of failures in time window to alert */
  failureCountThreshold: number;
}

/**
 * Service for structured logging and monitoring of captcha operations
 * Integrates with Winston logger for structured JSON logging
 */
@Injectable()
export class CaptchaLoggingService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaLoggingService.name);
  private readonly winstonLogger: WinstonLoggerService;
  
  // Statistics tracking
  private detectionLogs: DetectionLogEntry[] = [];
  private solvingLogs: SolvingLogEntry[] = [];
  private readonly maxLogRetention: number;
  
  // Alert tracking
  private recentFailures: Array<{
    timestamp: Date;
    solverType?: string;
    systemType?: AntiBotSystemType;
    error: string;
  }> = [];
  private alertConfig: AlertConfig;
  private lastAlertTime: Date | null = null;
  private alertCooldownMs: number;

  constructor(
    winstonLogger: WinstonLoggerService,
    configService: ConfigService,
  ) {
    this.winstonLogger = winstonLogger;
    this.maxLogRetention = configService.get<number>(
      'CAPTCHA_LOG_RETENTION',
      1000,
    );
    
    // Load alert configuration
    this.alertConfig = {
      consecutiveFailureThreshold: configService.get<number>(
        'CAPTCHA_ALERT_CONSECUTIVE_FAILURES',
        5,
      ),
      timeWindowMs: configService.get<number>(
        'CAPTCHA_ALERT_TIME_WINDOW_MS',
        60000, // 1 minute
      ),
      failureCountThreshold: configService.get<number>(
        'CAPTCHA_ALERT_FAILURE_COUNT',
        10,
      ),
    };
    
    this.alertCooldownMs = configService.get<number>(
      'CAPTCHA_ALERT_COOLDOWN_MS',
      300000, // 5 minutes
    );
  }

  async onModuleInit() {
    this.logger.log('Captcha Logging Service initialized');
    this.logger.debug(
      `Alert config: ${JSON.stringify(this.alertConfig)}`,
    );
  }

  /**
   * Log a detection operation
   */
  logDetection(
    result: AntiBotDetectionResult,
    durationMs: number,
    url?: string,
  ): void {
    const logEntry: DetectionLogEntry = {
      operation: 'detection',
      systemType: result.type || undefined,
      detected: result.detected,
      confidence: result.confidence,
      durationMs,
      url,
      signals: result.details?.signals?.length || 0,
      metadata: {
        detectedAt: result.detectedAt,
        challengeType: result.details?.challengeType,
        version: result.details?.version,
      },
    };

    if (result.error) {
      logEntry.error = {
        code: result.error.code,
        message: result.error.message,
        stack: result.error.stack,
      };
    }

    // Store in memory for statistics
    this.detectionLogs.push(logEntry);
    if (this.detectionLogs.length > this.maxLogRetention) {
      this.detectionLogs.shift();
    }

    // Log to Winston with structured format
    const winstonMeta = {
      operation: 'detection',
      systemType: logEntry.systemType,
      detected: logEntry.detected,
      confidence: logEntry.confidence,
      durationMs: logEntry.durationMs,
      url: logEntry.url,
      signals: logEntry.signals,
      ...logEntry.metadata,
      ...(logEntry.error && {
        error: {
          code: logEntry.error.code,
          message: logEntry.error.message,
        },
      }),
    };

    if (logEntry.error) {
      this.winstonLogger.error(
        `Detection ${logEntry.detected ? 'completed' : 'failed'} for ${logEntry.systemType || 'unknown'}: ${logEntry.error.message}`,
        logEntry.error.stack,
        'CaptchaDetection',
        winstonMeta,
      );
    } else if (logEntry.detected) {
      this.winstonLogger.log(
        `Detected ${logEntry.systemType} with confidence ${logEntry.confidence.toFixed(2)} in ${durationMs}ms`,
        'CaptchaDetection',
        winstonMeta,
      );
    } else {
      this.winstonLogger.debug(
        `No anti-bot system detected in ${durationMs}ms`,
        'CaptchaDetection',
        winstonMeta,
      );
    }
  }

  /**
   * Log a solving operation
   */
  logSolving(
    solverType: string,
    challengeType: string,
    success: boolean,
    durationMs: number,
    attempt: number,
    maxAttempts: number,
    url?: string,
    solution?: CaptchaSolution,
    error?: Error,
    usedThirdParty?: boolean,
    metadata?: Record<string, any>,
  ): void {
    const logEntry: SolvingLogEntry = {
      operation: 'solving',
      solverType,
      challengeType,
      success,
      durationMs,
      attempt,
      maxAttempts,
      url,
      usedThirdParty,
      metadata,
    };

    if (solution) {
      logEntry.solution = {
        token: solution.token?.substring(0, 20) + '...', // Truncate token for logging
        solvedAt: solution.solvedAt,
      };
    }

    if (error) {
      logEntry.error = {
        code: (error as any).code || error.name || 'SOLVING_ERROR',
        message: error.message,
        stack: error.stack,
      };
    }

    // Store in memory for statistics
    this.solvingLogs.push(logEntry);
    if (this.solvingLogs.length > this.maxLogRetention) {
      this.solvingLogs.shift();
    }

    // Track failures for alerting
    if (!success && error) {
      this.trackFailure(solverType, undefined, error.message);
    }

    // Log to Winston with structured format
    const winstonMeta = {
      operation: 'solving',
      solverType: logEntry.solverType,
      challengeType: logEntry.challengeType,
      success: logEntry.success,
      durationMs: logEntry.durationMs,
      attempt: logEntry.attempt,
      maxAttempts: logEntry.maxAttempts,
      url: logEntry.url,
      usedThirdParty: logEntry.usedThirdParty,
      ...logEntry.metadata,
      ...(logEntry.solution && {
        solution: {
          solvedAt: logEntry.solution.solvedAt,
        },
      }),
      ...(logEntry.error && {
        error: {
          code: logEntry.error.code,
          message: logEntry.error.message,
        },
      }),
    };

    if (logEntry.error) {
      this.winstonLogger.error(
        `Solving attempt ${attempt}/${maxAttempts} failed with ${solverType}: ${logEntry.error.message}`,
        logEntry.error.stack,
        'CaptchaSolving',
        winstonMeta,
      );
    } else if (success) {
      this.winstonLogger.log(
        `Successfully solved ${challengeType} with ${solverType} in ${durationMs}ms (attempt ${attempt}/${maxAttempts})`,
        'CaptchaSolving',
        winstonMeta,
      );
    } else {
      this.winstonLogger.warn(
        `Solving attempt ${attempt}/${maxAttempts} with ${solverType} did not succeed`,
        'CaptchaSolving',
        winstonMeta,
      );
    }
  }

  /**
   * Get statistics for captcha operations
   */
  getStatistics(): CaptchaStatistics {
    const now = new Date();
    
    // Detection statistics
    const detectionTotal = this.detectionLogs.length;
    const detectionSuccessful = this.detectionLogs.filter(
      (log) => log.detected && !log.error,
    ).length;
    const detectionFailed = detectionTotal - detectionSuccessful;
    const detectionTotalDuration = this.detectionLogs.reduce(
      (sum, log) => sum + log.durationMs,
      0,
    );
    const detectionAverageDuration =
      detectionTotal > 0 ? detectionTotalDuration / detectionTotal : 0;

    // Group detection by system type
    const detectionBySystemType: Record<
      string,
      {
        count: number;
        successRate: number;
        averageDurationMs: number;
      }
    > = {};

    for (const log of this.detectionLogs) {
      const systemType = log.systemType || 'unknown';
      if (!detectionBySystemType[systemType]) {
        detectionBySystemType[systemType] = {
          count: 0,
          successRate: 0,
          averageDurationMs: 0,
        };
      }
      detectionBySystemType[systemType].count++;
    }

    // Calculate success rates and averages per system type
    for (const systemType of Object.keys(detectionBySystemType)) {
      const systemLogs = this.detectionLogs.filter(
        (log) => (log.systemType || 'unknown') === systemType,
      );
      const systemSuccessful = systemLogs.filter(
        (log) => log.detected && !log.error,
      ).length;
      const systemTotalDuration = systemLogs.reduce(
        (sum, log) => sum + log.durationMs,
        0,
      );

      detectionBySystemType[systemType].successRate =
        systemLogs.length > 0 ? systemSuccessful / systemLogs.length : 0;
      detectionBySystemType[systemType].averageDurationMs =
        systemLogs.length > 0 ? systemTotalDuration / systemLogs.length : 0;
    }

    // Solving statistics
    const solvingTotal = this.solvingLogs.length;
    const solvingSuccessful = this.solvingLogs.filter(
      (log) => log.success,
    ).length;
    const solvingFailed = solvingTotal - solvingSuccessful;
    const solvingSuccessRate =
      solvingTotal > 0 ? solvingSuccessful / solvingTotal : 0;
    const solvingTotalDuration = this.solvingLogs.reduce(
      (sum, log) => sum + log.durationMs,
      0,
    );
    const solvingAverageDuration =
      solvingTotal > 0 ? solvingTotalDuration / solvingTotal : 0;

    // Group solving by solver type
    const solvingBySolverType: Record<
      string,
      {
        count: number;
        successRate: number;
        averageDurationMs: number;
      }
    > = {};

    for (const log of this.solvingLogs) {
      if (!solvingBySolverType[log.solverType]) {
        solvingBySolverType[log.solverType] = {
          count: 0,
          successRate: 0,
          averageDurationMs: 0,
        };
      }
      solvingBySolverType[log.solverType].count++;
    }

    // Calculate success rates and averages per solver type
    for (const solverType of Object.keys(solvingBySolverType)) {
      const solverLogs = this.solvingLogs.filter(
        (log) => log.solverType === solverType,
      );
      const solverSuccessful = solverLogs.filter((log) => log.success).length;
      const solverTotalDuration = solverLogs.reduce(
        (sum, log) => sum + log.durationMs,
        0,
      );

      solvingBySolverType[solverType].successRate =
        solverLogs.length > 0 ? solverSuccessful / solverLogs.length : 0;
      solvingBySolverType[solverType].averageDurationMs =
        solverLogs.length > 0 ? solverTotalDuration / solverLogs.length : 0;
    }

    // Group solving by challenge type
    const solvingByChallengeType: Record<
      string,
      {
        count: number;
        successRate: number;
        averageDurationMs: number;
      }
    > = {};

    for (const log of this.solvingLogs) {
      if (!solvingByChallengeType[log.challengeType]) {
        solvingByChallengeType[log.challengeType] = {
          count: 0,
          successRate: 0,
          averageDurationMs: 0,
        };
      }
      solvingByChallengeType[log.challengeType].count++;
    }

    // Calculate success rates and averages per challenge type
    for (const challengeType of Object.keys(solvingByChallengeType)) {
      const challengeLogs = this.solvingLogs.filter(
        (log) => log.challengeType === challengeType,
      );
      const challengeSuccessful = challengeLogs.filter(
        (log) => log.success,
      ).length;
      const challengeTotalDuration = challengeLogs.reduce(
        (sum, log) => sum + log.durationMs,
        0,
      );

      solvingByChallengeType[challengeType].successRate =
        challengeLogs.length > 0
          ? challengeSuccessful / challengeLogs.length
          : 0;
      solvingByChallengeType[challengeType].averageDurationMs =
        challengeLogs.length > 0
          ? challengeTotalDuration / challengeLogs.length
          : 0;
    }

    return {
      detection: {
        total: detectionTotal,
        successful: detectionSuccessful,
        failed: detectionFailed,
        averageDurationMs: detectionAverageDuration,
        bySystemType: detectionBySystemType,
      },
      solving: {
        total: solvingTotal,
        successful: solvingSuccessful,
        failed: solvingFailed,
        successRate: solvingSuccessRate,
        averageDurationMs: solvingAverageDuration,
        bySolverType: solvingBySolverType,
        byChallengeType: solvingByChallengeType,
      },
      lastUpdated: now,
    };
  }

  /**
   * Track a failure for alerting purposes
   */
  private trackFailure(
    solverType?: string,
    systemType?: AntiBotSystemType,
    error?: string,
  ): void {
    this.recentFailures.push({
      timestamp: new Date(),
      solverType,
      systemType,
      error: error || 'Unknown error',
    });

    // Clean up old failures outside the time window
    const cutoffTime = new Date(
      Date.now() - this.alertConfig.timeWindowMs,
    );
    this.recentFailures = this.recentFailures.filter(
      (f) => f.timestamp >= cutoffTime,
    );

    // Check if we should alert
    this.checkAndAlert();
  }

  /**
   * Check failure patterns and trigger alerts if needed
   */
  private checkAndAlert(): void {
    const now = new Date();

    // Check cooldown period
    if (
      this.lastAlertTime &&
      now.getTime() - this.lastAlertTime.getTime() < this.alertCooldownMs
    ) {
      return; // Still in cooldown
    }

    // Check for consecutive failures
    const recentFailures = this.recentFailures.slice(
      -this.alertConfig.consecutiveFailureThreshold,
    );
    if (
      recentFailures.length >= this.alertConfig.consecutiveFailureThreshold
    ) {
      const allSameSolver = recentFailures.every(
        (f) => f.solverType === recentFailures[0].solverType,
      );
      if (allSameSolver) {
        this.triggerAlert(
          'consecutive_failures',
          `Consecutive ${this.alertConfig.consecutiveFailureThreshold} failures detected for solver: ${recentFailures[0].solverType}`,
          {
            solverType: recentFailures[0].solverType,
            failureCount: recentFailures.length,
            errors: recentFailures.map((f) => f.error),
          },
        );
        return;
      }
    }

    // Check for failure count in time window
    if (this.recentFailures.length >= this.alertConfig.failureCountThreshold) {
      // Group by solver type
      const failuresBySolver: Record<string, number> = {};
      for (const failure of this.recentFailures) {
        const key = failure.solverType || 'unknown';
        failuresBySolver[key] = (failuresBySolver[key] || 0) + 1;
      }

      // Find solvers with high failure rates
      for (const [solverType, count] of Object.entries(failuresBySolver)) {
        if (count >= this.alertConfig.failureCountThreshold) {
          this.triggerAlert(
            'high_failure_rate',
            `High failure rate detected: ${count} failures in ${this.alertConfig.timeWindowMs}ms for solver: ${solverType}`,
            {
              solverType,
              failureCount: count,
              timeWindowMs: this.alertConfig.timeWindowMs,
            },
          );
          break; // Only alert once per check
        }
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(
    alertType: string,
    message: string,
    metadata: Record<string, any>,
  ): void {
    this.lastAlertTime = new Date();

    const alertMeta = {
      alertType,
      timestamp: this.lastAlertTime,
      ...metadata,
    };

    // Log alert using Winston
    this.winstonLogger.error(
      `CAPTCHA ALERT: ${message}`,
      undefined,
      'CaptchaAlert',
      alertMeta,
    );

    // Also log using NestJS logger for immediate visibility
    this.logger.error(
      `CAPTCHA ALERT [${alertType}]: ${message}`,
      JSON.stringify(metadata, null, 2),
    );

    // TODO: Integrate with external alerting systems (e.g., webhooks, email, Slack)
    // This can be extended to call external alerting services
  }

  /**
   * Clear old logs (older than specified days)
   */
  clearOldLogs(daysToKeep: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialDetectionCount = this.detectionLogs.length;
    const initialSolvingCount = this.solvingLogs.length;

    // Note: Logs don't have timestamps in the current structure
    // This would need to be enhanced to support time-based cleanup
    // For now, we rely on maxLogRetention limit

    this.logger.log(
      `Log cleanup: ${this.detectionLogs.length} detection logs, ${this.solvingLogs.length} solving logs retained`,
    );
  }

  /**
   * Get recent detection logs
   */
  getRecentDetectionLogs(limit: number = 100): DetectionLogEntry[] {
    return this.detectionLogs.slice(-limit);
  }

  /**
   * Get recent solving logs
   */
  getRecentSolvingLogs(limit: number = 100): SolvingLogEntry[] {
    return this.solvingLogs.slice(-limit);
  }
}

