/**
 * Interfaces for hCAPTCHA-specific solver operations
 */

import { Frame } from 'playwright';

/**
 * hCAPTCHA challenge type
 */
export enum HcaptchaChallengeType {
  /** Checkbox challenge - user clicks checkbox */
  CHECKBOX = 'checkbox',
  /** Invisible challenge - runs in background */
  INVISIBLE = 'invisible',
  /** Audio challenge - user solves audio puzzle */
  AUDIO = 'audio',
  /** Accessibility challenge - text-based alternative */
  ACCESSIBILITY = 'accessibility',
}

/**
 * hCAPTCHA difficulty level
 */
export enum HcaptchaDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  UNKNOWN = 'unknown',
}

/**
 * hCAPTCHA detection result
 */
export interface HcaptchaDetectionResult {
  /** Challenge type */
  challengeType?: HcaptchaChallengeType;
  /** Anchor iframe element */
  anchorIframe: Frame | null;
  /** Challenge iframe element (for challenges) */
  challengeIframe: Frame | null;
  /** Site key from data-sitekey attribute */
  siteKey?: string;
  /** Callback function name */
  callback?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional detection details */
  details?: {
    /** Iframe source URLs */
    anchorIframeSrc?: string;
    challengeIframeSrc?: string;
    /** Widget container element selector */
    containerSelector?: string;
    /** Whether widget is visible */
    isVisible?: boolean;
    /** Widget theme (light/dark) */
    theme?: string;
    /** Widget size (normal/compact) */
    size?: string;
    /** Detected difficulty level */
    difficulty?: HcaptchaDifficulty;
  };
}

/**
 * hCAPTCHA challenge response
 */
export interface HcaptchaChallengeResponse {
  /** hCAPTCHA token */
  token: string;
  /** Timestamp when challenge was solved */
  solvedAt: Date;
  /** Challenge type that was solved */
  challengeType?: HcaptchaChallengeType;
  /** Duration in milliseconds */
  duration: number;
  /** Difficulty level detected */
  difficulty?: HcaptchaDifficulty;
}

/**
 * hCAPTCHA solver configuration
 */
export interface HcaptchaSolverConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for checkbox challenges in milliseconds (default: 30000) */
  checkboxTimeout?: number;
  /** Timeout for invisible challenges in milliseconds (default: 10000) */
  invisibleTimeout?: number;
  /** Timeout for audio challenges in milliseconds (default: 30000) */
  audioTimeout?: number;
  /** Timeout for accessibility challenges in milliseconds (default: 30000) */
  accessibilityTimeout?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;
  /** Enable fallback to external solver APIs (default: true) */
  enableFallback?: boolean;
  /** Enable audio challenge solving (default: true) */
  enableAudioChallenges?: boolean;
  /** Enable accessibility challenge solving (default: true) */
  enableAccessibilityChallenges?: boolean;
  /** Enable difficulty detection (default: true) */
  enableDifficultyDetection?: boolean;
  /** Adaptive retry based on difficulty (default: true) */
  adaptiveRetry?: boolean;
}

/**
 * hCAPTCHA solver metrics
 */
export interface HcaptchaSolverMetrics {
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
  /** Challenge type distribution */
  challengeTypeDistribution: Record<HcaptchaChallengeType, number>;
  /** Difficulty distribution */
  difficultyDistribution: Record<HcaptchaDifficulty, number>;
  /** Failure reasons */
  failureReasons: Record<string, number>;
  /** Audio transcription accuracy */
  audioTranscriptionAccuracy: number;
}

