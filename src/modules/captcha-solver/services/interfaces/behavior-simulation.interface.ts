/**
 * Behavior simulation interfaces for human-like interaction patterns
 */

/**
 * Behavior profile types that adjust timing and movement characteristics
 */
export enum BehaviorProfile {
  CAUTIOUS = 'cautious',
  NORMAL = 'normal',
  AGGRESSIVE = 'aggressive',
}

/**
 * Configuration for behavior simulation
 */
export interface BehaviorSimulationConfig {
  /**
   * Behavior profile to use
   * @default BehaviorProfile.NORMAL
   */
  profile?: BehaviorProfile;

  /**
   * Enable/disable Bezier curve mouse movements
   * @default true
   */
  enableBezierMouseMovement?: boolean;

  /**
   * Enable/disable keystroke timing variations
   * @default true
   */
  enableKeystrokeTiming?: boolean;

  /**
   * Enable/disable momentum-based scrolling
   * @default true
   */
  enableMomentumScrolling?: boolean;

  /**
   * Enable/disable micro-movements during idle
   * @default true
   */
  enableMicroMovements?: boolean;

  /**
   * Enable/disable random pauses
   * @default true
   */
  enableRandomPauses?: boolean;

  /**
   * Enable/disable attention simulation
   * @default true
   */
  enableAttentionSimulation?: boolean;

  /**
   * Enable/disable behavioral fingerprint tracking
   * @default true
   */
  enableFingerprintTracking?: boolean;
}

/**
 * Mouse movement configuration
 */
export interface MouseMovementConfig {
  /**
   * Deviation percentage for Bezier control points (10-30%)
   * @default 20
   */
  bezierDeviation?: number;

  /**
   * Jitter range in pixels (1-3)
   * @default 2
   */
  jitterRange?: number;

  /**
   * Jitter interval in milliseconds (50-100)
   * @default 75
   */
  jitterInterval?: number;

  /**
   * Number of steps for smooth movement
   * @default 50
   */
  steps?: number;
}

/**
 * Keystroke timing configuration
 */
export interface KeystrokeTimingConfig {
  /**
   * Mean delay between keydown and keyup (ms)
   * @default 100
   */
  keyPressMean?: number;

  /**
   * Standard deviation for key press duration (ms)
   * @default 25
   */
  keyPressStdDev?: number;

  /**
   * Mean delay between keys (ms)
   * @default 200
   */
  interKeyMean?: number;

  /**
   * Standard deviation for inter-key delay (ms)
   * @default 50
   */
  interKeyStdDev?: number;

  /**
   * Probability of a thinking pause (0-1)
   * @default 0.1
   */
  thinkingPauseProbability?: number;

  /**
   * Thinking pause duration range (ms)
   * @default [500, 2000]
   */
  thinkingPauseRange?: [number, number];
}

/**
 * Scroll behavior configuration
 */
export interface ScrollBehaviorConfig {
  /**
   * Minimum scroll distance (pixels)
   * @default 100
   */
  minDistance?: number;

  /**
   * Maximum scroll distance (pixels)
   * @default 500
   */
  maxDistance?: number;

  /**
   * Probability of overshoot (0-1)
   * @default 0.3
   */
  overshootProbability?: number;

  /**
   * Overshoot correction range (pixels)
   * @default [10, 50]
   */
  overshootCorrectionRange?: [number, number];

  /**
   * Scroll duration in milliseconds
   * @default 500
   */
  scrollDuration?: number;
}

/**
 * Micro-movement configuration
 */
export interface MicroMovementConfig {
  /**
   * Movement distance range (pixels)
   * @default [5, 15]
   */
  distanceRange?: [number, number];

  /**
   * Movement interval range (seconds)
   * @default [2, 5]
   */
  intervalRange?: [number, number];
}

/**
 * Pause configuration
 */
export interface PauseConfig {
  /**
   * Minimum pause duration (seconds)
   * @default 1
   */
  minDuration?: number;

  /**
   * Maximum pause duration (seconds)
   * @default 10
   */
  maxDuration?: number;

  /**
   * Probability of pause between actions (0-1)
   * @default 0.3
   */
  pauseProbability?: number;
}

/**
 * Attention simulation configuration
 */
export interface AttentionSimulationConfig {
  /**
   * Probability of focus change (0-1)
   * @default 0.2
   */
  focusChangeProbability?: number;

  /**
   * Probability of tab switch (0-1)
   * @default 0.1
   */
  tabSwitchProbability?: number;

  /**
   * Interval for attention checks (seconds)
   * @default 30
   */
  checkInterval?: number;
}

/**
 * Behavioral fingerprint data
 */
export interface BehavioralFingerprint {
  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Mouse movement patterns
   */
  mousePatterns: {
    averageSpeed: number;
    averageCurvature: number;
    movementCount: number;
  };

  /**
   * Typing speed distribution
   */
  typingSpeed: {
    mean: number;
    stdDev: number;
    samples: number[];
  };

  /**
   * Scroll velocity profile
   */
  scrollProfile: {
    averageVelocity: number;
    averageDistance: number;
    overshootFrequency: number;
  };

  /**
   * Pause duration patterns
   */
  pausePatterns: {
    mean: number;
    stdDev: number;
    samples: number[];
  };

  /**
   * Timestamp of creation
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}

/**
 * Point in 2D space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Bezier curve control points
 */
export interface BezierCurve {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
}

/**
 * Profile-specific configuration multipliers
 */
export interface ProfileMultipliers {
  /**
   * Timing multiplier (higher = slower)
   */
  timing: number;

  /**
   * Movement speed multiplier (higher = faster)
   */
  movementSpeed: number;

  /**
   * Pause frequency multiplier (higher = more pauses)
   */
  pauseFrequency: number;

  /**
   * Attention change frequency multiplier (higher = more changes)
   */
  attentionFrequency: number;
}

/**
 * Profile configuration map
 */
export const PROFILE_MULTIPLIERS: Record<
  BehaviorProfile,
  ProfileMultipliers
> = {
  [BehaviorProfile.CAUTIOUS]: {
    timing: 1.5,
    movementSpeed: 0.8,
    pauseFrequency: 1.3,
    attentionFrequency: 0.7,
  },
  [BehaviorProfile.NORMAL]: {
    timing: 1.0,
    movementSpeed: 1.0,
    pauseFrequency: 1.0,
    attentionFrequency: 1.0,
  },
  [BehaviorProfile.AGGRESSIVE]: {
    timing: 0.7,
    movementSpeed: 1.2,
    pauseFrequency: 0.6,
    attentionFrequency: 1.3,
  },
};

