/**
 * Stealth configuration interfaces for browser automation
 * Provides type-safe configuration for anti-bot detection evasion
 */

/**
 * Configuration for stealth mode features
 */
export interface StealthConfig {
  /**
   * Enable/disable navigator.webdriver override
   * @default true
   */
  overrideWebdriver?: boolean;

  /**
   * Enable/disable canvas fingerprinting prevention
   * @default true
   */
  preventCanvasFingerprinting?: boolean;

  /**
   * Enable/disable WebGL fingerprinting prevention
   * @default true
   */
  preventWebGLFingerprinting?: boolean;

  /**
   * Enable/disable audio context fingerprinting prevention
   * @default true
   */
  preventAudioFingerprinting?: boolean;

  /**
   * Enable/disable battery API mocking
   * @default true
   */
  mockBatteryAPI?: boolean;

  /**
   * Enable/disable hardware concurrency randomization
   * @default true
   */
  randomizeHardwareConcurrency?: boolean;

  /**
   * Hardware concurrency range (min, max)
   * @default [2, 8]
   */
  hardwareConcurrencyRange?: [number, number];

  /**
   * Enable/disable timezone consistency checks
   * @default true
   */
  enforceTimezoneConsistency?: boolean;

  /**
   * Enable/disable locale consistency checks
   * @default true
   */
  enforceLocaleConsistency?: boolean;

  /**
   * Enable/disable user-agent/platform consistency checks
   * @default true
   */
  enforceUserAgentConsistency?: boolean;

  /**
   * Enable/disable human-like mouse movements
   * @default true
   */
  enableHumanLikeMouse?: boolean;

  /**
   * Enable/disable browser plugin mocking
   * @default true
   */
  mockPlugins?: boolean;

  /**
   * Enable/disable language mocking
   * @default true
   */
  mockLanguages?: boolean;

  /**
   * Custom timezone ID (e.g., 'America/New_York')
   * If not provided, will use context timezone or default
   */
  timezoneId?: string;

  /**
   * Custom locale (e.g., 'en-US')
   * If not provided, will use context locale or default
   */
  locale?: string;
}

/**
 * Default stealth configuration
 */
export const DEFAULT_STEALTH_CONFIG: Required<StealthConfig> = {
  overrideWebdriver: true,
  preventCanvasFingerprinting: true,
  preventWebGLFingerprinting: true,
  preventAudioFingerprinting: true,
  mockBatteryAPI: true,
  randomizeHardwareConcurrency: true,
  hardwareConcurrencyRange: [2, 8],
  enforceTimezoneConsistency: true,
  enforceLocaleConsistency: true,
  enforceUserAgentConsistency: true,
  enableHumanLikeMouse: true,
  mockPlugins: true,
  mockLanguages: true,
  timezoneId: 'America/New_York',
  locale: 'en-US',
};

/**
 * Mouse movement configuration for human-like behavior
 */
export interface MouseMovementConfig {
  /**
   * Minimum steps for mouse movement
   * @default 5
   */
  minSteps?: number;

  /**
   * Maximum steps for mouse movement
   * @default 15
   */
  maxSteps?: number;

  /**
   * Minimum delay between movements (ms)
   * @default 10
   */
  minDelay?: number;

  /**
   * Maximum delay between movements (ms)
   * @default 50
   */
  maxDelay?: number;
}

/**
 * Default mouse movement configuration
 */
export const DEFAULT_MOUSE_MOVEMENT_CONFIG: Required<MouseMovementConfig> = {
  minSteps: 5,
  maxSteps: 15,
  minDelay: 10,
  maxDelay: 50,
};

