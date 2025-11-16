/**
 * Interfaces for reCAPTCHA-specific solver operations
 */

import { Frame } from 'playwright';

/**
 * reCAPTCHA version
 */
export enum RecaptchaVersion {
  V2 = 'v2',
  V3 = 'v3',
}

/**
 * reCAPTCHA v2 challenge type
 */
export enum RecaptchaV2ChallengeType {
  /** Checkbox challenge - user clicks checkbox */
  CHECKBOX = 'checkbox',
  /** Invisible challenge - runs in background */
  INVISIBLE = 'invisible',
  /** Audio challenge - user solves audio puzzle */
  AUDIO = 'audio',
  /** Image challenge - user selects images */
  IMAGE = 'image',
}

/**
 * reCAPTCHA detection result
 */
export interface RecaptchaDetectionResult {
  /** Detected reCAPTCHA version */
  version: RecaptchaVersion;
  /** For v2: challenge type */
  challengeType?: RecaptchaV2ChallengeType;
  /** Anchor iframe element */
  anchorIframe: Frame | null;
  /** Challenge iframe element (for v2 challenges) */
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
  };
}

/**
 * reCAPTCHA challenge response
 */
export interface RecaptchaChallengeResponse {
  /** reCAPTCHA token */
  token: string;
  /** Timestamp when challenge was solved */
  solvedAt: Date;
  /** Version that was solved */
  version: RecaptchaVersion;
  /** For v2: challenge type that was solved */
  challengeType?: RecaptchaV2ChallengeType;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * reCAPTCHA solver configuration
 */
export interface RecaptchaSolverConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for v2 checkbox challenges in milliseconds (default: 30000) */
  v2CheckboxTimeout?: number;
  /** Timeout for v2 invisible challenges in milliseconds (default: 10000) */
  v2InvisibleTimeout?: number;
  /** Timeout for v2 audio challenges in milliseconds (default: 30000) */
  v2AudioTimeout?: number;
  /** Timeout for v2 image challenges in milliseconds (default: 60000) */
  v2ImageTimeout?: number;
  /** Timeout for v3 challenges in milliseconds (default: 10000) */
  v3Timeout?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;
  /** Enable fallback to external solver APIs (default: true) */
  enableFallback?: boolean;
  /** Enable audio challenge solving (default: true) */
  enableAudioChallenges?: boolean;
  /** Enable image challenge solving (default: true) */
  enableImageChallenges?: boolean;
  /** Minimum confidence for image recognition (default: 0.7) */
  imageRecognitionMinConfidence?: number;
}

/**
 * reCAPTCHA solver metrics
 */
export interface RecaptchaSolverMetrics {
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
  /** Version distribution */
  versionDistribution: Record<RecaptchaVersion, number>;
  /** Challenge type distribution (v2 only) */
  challengeTypeDistribution: Record<RecaptchaV2ChallengeType, number>;
  /** Failure reasons */
  failureReasons: Record<string, number>;
}

/**
 * Image challenge tile
 */
export interface ImageChallengeTile {
  /** Tile index */
  index: number;
  /** Image URL or data */
  imageUrl?: string;
  /** Image element */
  element?: any;
  /** Detected pattern (if any) */
  detectedPattern?: string;
  /** Confidence score for pattern detection */
  confidence?: number;
}

/**
 * Image challenge result
 */
export interface ImageChallengeResult {
  /** Selected tile indices */
  selectedTiles: number[];
  /** Confidence score */
  confidence: number;
  /** Detection method used */
  method: 'pattern' | 'template' | 'ml' | 'manual';
}

