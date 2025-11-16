/**
 * Interfaces for Akamai Bot Manager-specific solver operations
 */

import { Frame } from 'playwright';

/**
 * Akamai challenge level
 */
export enum AkamaiChallengeLevel {
  /** Level 1: Passive monitoring - inject sensor data without interaction */
  LEVEL_1 = 'level_1',
  /** Level 2: Interactive challenges - solve JavaScript challenges and proof-of-work */
  LEVEL_2 = 'level_2',
  /** Level 3: Advanced challenges - handle dynamic script obfuscation and anti-debugging */
  LEVEL_3 = 'level_3',
}

/**
 * Akamai detection result
 */
export interface AkamaiDetectionResult {
  /** Challenge level */
  challengeLevel?: AkamaiChallengeLevel;
  /** Akamai script iframe or container */
  container?: Frame | null;
  /** Challenge iframe (if present) */
  challengeIframe?: Frame | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Akamai cookies (_abck, bm_sz, ak_bmsc) */
  cookies?: {
    _abck?: string;
    bm_sz?: string;
    ak_bmsc?: string;
  };
  /** Additional detection details */
  details?: {
    /** Script source URLs */
    scriptUrls?: string[];
    /** Window object presence (window._cf, window.bmak) */
    hasWindowCf?: boolean;
    hasWindowBmak?: boolean;
    /** Cookie names found */
    cookieNames?: string[];
    /** Sensor version detected */
    sensorVersion?: string;
    /** Challenge parameters */
    challengeParams?: Record<string, any>;
  };
}

/**
 * Browser fingerprint data for Akamai
 */
export interface AkamaiBrowserFingerprint {
  /** Screen dimensions */
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
  };
  /** Timezone offset in minutes */
  timezoneOffset: number;
  /** Language */
  language: string;
  /** Platform */
  platform: string;
  /** User agent */
  userAgent: string;
  /** Browser capabilities */
  capabilities: {
    plugins: string[];
    mimeTypes: string[];
    webglRenderer?: string;
    canvasFingerprint?: string;
  };
  /** Hardware info */
  hardware: {
    hardwareConcurrency: number;
    deviceMemory?: number;
    maxTouchPoints?: number;
  };
}

/**
 * Behavioral telemetry data for Akamai
 */
export interface AkamaiBehavioralTelemetry {
  /** Mouse movement events */
  mouseMovements: Array<{
    timestamp: number;
    x: number;
    y: number;
    type: 'mousemove' | 'mousedown' | 'mouseup' | 'click';
    buttons?: number;
  }>;
  /** Keyboard events */
  keyboardEvents: Array<{
    timestamp: number;
    key: string;
    code: string;
    keyCode?: number;
    charCode?: number;
  }>;
  /** Touch events (for mobile) */
  touchEvents: Array<{
    timestamp: number;
    touches: Array<{ x: number; y: number; identifier: number }>;
  }>;
  /** Scroll events */
  scrollEvents: Array<{
    timestamp: number;
    deltaX: number;
    deltaY: number;
    scrollX: number;
    scrollY: number;
  }>;
  /** Timing data */
  timing: {
    pageLoadTime: number;
    scriptExecutionTime: number;
    domContentLoadedTime: number;
    firstPaintTime?: number;
  };
}

/**
 * Sensor data payload for Akamai
 */
export interface AkamaiSensorData {
  /** Sensor version */
  sensorVersion: string;
  /** Device fingerprint */
  fingerprint: AkamaiBrowserFingerprint;
  /** Behavioral telemetry */
  telemetry: AkamaiBehavioralTelemetry;
  /** Timestamp */
  timestamp: number;
  /** Page URL */
  pageUrl: string;
  /** Referrer */
  referrer?: string;
}

/**
 * Bmak cookie structure
 */
export interface BmakCookie {
  /** Version identifier */
  version: string;
  /** Timestamp */
  timestamp: number;
  /** Session token */
  sessionToken: string;
  /** Sensor data hash */
  sensorHash: string;
  /** Challenge response token */
  challengeToken?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Akamai challenge response
 */
export interface AkamaiChallengeResponse {
  /** Challenge token or cookie value */
  token: string;
  /** Timestamp when challenge was solved */
  solvedAt: Date;
  /** Challenge level that was solved */
  challengeLevel?: AkamaiChallengeLevel;
  /** Duration in milliseconds */
  duration: number;
  /** Fingerprint used */
  fingerprint?: AkamaiBrowserFingerprint;
  /** Bmak cookie generated */
  bmakCookie?: BmakCookie;
}

/**
 * Akamai solver configuration
 */
export interface AkamaiSolverConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for Level 1 challenges in milliseconds (default: 2000) */
  level1Timeout?: number;
  /** Timeout for Level 2 challenges in milliseconds (default: 5000) */
  level2Timeout?: number;
  /** Timeout for Level 3 challenges in milliseconds (default: 10000) */
  level3Timeout?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;
  /** Fingerprint consistency mode: 'session' or 'request' (default: 'session') */
  fingerprintConsistency?: 'session' | 'request';
  /** Sensor data verbosity level: 'minimal', 'normal', 'verbose' (default: 'normal') */
  sensorVerbosity?: 'minimal' | 'normal' | 'verbose';
  /** Enable Level 2 challenge solving (default: true) */
  enableLevel2?: boolean;
  /** Enable Level 3 challenge solving (default: true) */
  enableLevel3?: boolean;
  /** Enable bmak cookie generation (default: true) */
  enableBmakCookie?: boolean;
  /** Enable request signing (default: true) */
  enableRequestSigning?: boolean;
}

/**
 * Akamai solver metrics
 */
export interface AkamaiSolverMetrics {
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
  /** Challenge level distribution */
  challengeLevelDistribution: Record<AkamaiChallengeLevel, number>;
  /** Failure reasons */
  failureReasons: Record<string, number>;
  /** Sensor generation success rate */
  sensorGenerationSuccessRate: number;
  /** Average sensor generation time */
  averageSensorGenerationTime: number;
}

