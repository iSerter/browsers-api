/**
 * Interfaces for Turnstile-specific solver operations
 */

import { Frame } from 'playwright';

/**
 * Turnstile widget mode variations
 */
export enum TurnstileWidgetMode {
  /** Interactive/managed mode - requires user interaction */
  MANAGED = 'managed',
  /** Non-interactive/automatic mode - solves automatically */
  NON_INTERACTIVE = 'non-interactive',
  /** Invisible mode - runs in background */
  INVISIBLE = 'invisible',
  /** Unknown mode */
  UNKNOWN = 'unknown',
}

/**
 * Turnstile widget detection result
 */
export interface TurnstileDetectionResult {
  /** Detected widget mode */
  mode: TurnstileWidgetMode;
  /** Widget iframe element */
  iframe: Frame | null;
  /** Site key from data-sitekey attribute */
  siteKey?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional detection details */
  details?: {
    /** Iframe source URL */
    iframeSrc?: string;
    /** Widget container element selector */
    containerSelector?: string;
    /** Whether widget is visible */
    isVisible?: boolean;
    /** Widget theme (light/dark/auto) */
    theme?: string;
    /** Widget size (normal/compact) */
    size?: string;
  };
}

/**
 * Turnstile challenge response
 */
export interface TurnstileChallengeResponse {
  /** Turnstile token */
  token: string;
  /** Timestamp when challenge was solved */
  solvedAt: Date;
  /** Widget mode that was solved */
  mode: TurnstileWidgetMode;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Turnstile solver configuration
 */
export interface TurnstileSolverConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for managed challenges in milliseconds (default: 30000) */
  managedTimeout?: number;
  /** Timeout for non-interactive challenges in milliseconds (default: 10000) */
  nonInteractiveTimeout?: number;
  /** Timeout for invisible challenges in milliseconds (default: 10000) */
  invisibleTimeout?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;
  /** Enable fallback to external solver APIs (default: true) */
  enableFallback?: boolean;
}

/**
 * Turnstile solver metrics
 */
export interface TurnstileSolverMetrics {
  /** Total attempts */
  totalAttempts: number;
  /** Successful attempts */
  successCount: number;
  /** Failed attempts */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average solving time in milliseconds */
  averageSolvingTime: number;
  /** Widget type distribution */
  widgetTypeDistribution: Record<TurnstileWidgetMode, number>;
  /** Failure reasons */
  failureReasons: Record<string, number>;
}

