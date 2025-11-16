/**
 * Interfaces for DataDome-specific solver operations
 */

import { Frame } from 'playwright';

/**
 * DataDome challenge type
 */
export enum DataDomeChallengeType {
  /** Sensor validation challenge - requires fingerprint and behavioral data */
  SENSOR_VALIDATION = 'sensor_validation',
  /** CAPTCHA challenge - iframe-based CAPTCHA (reCAPTCHA/hCAPTCHA) */
  CAPTCHA = 'captcha',
  /** Slider challenge - drag slider to complete */
  SLIDER = 'slider',
  /** Cookie challenge - requires valid challenge cookie */
  COOKIE = 'cookie',
}

/**
 * DataDome detection result
 */
export interface DataDomeDetectionResult {
  /** Challenge type */
  challengeType?: DataDomeChallengeType;
  /** DataDome script iframe or container */
  container?: Frame | null;
  /** CAPTCHA iframe (if present) */
  captchaIframe?: Frame | null;
  /** Slider widget element */
  sliderElement?: any;
  /** Confidence score (0-1) */
  confidence: number;
  /** DataDome cookie value */
  datadomeCookie?: string;
  /** Additional detection details */
  details?: {
    /** Script source URLs */
    scriptUrls?: string[];
    /** Window object presence */
    hasWindowDD?: boolean;
    /** Cookie names found */
    cookieNames?: string[];
    /** Challenge parameters */
    challengeParams?: Record<string, any>;
  };
}

/**
 * Browser fingerprint data
 */
export interface BrowserFingerprint {
  /** Screen resolution */
  screenResolution: { width: number; height: number };
  /** Timezone offset */
  timezone: string;
  /** Browser plugins */
  plugins: string[];
  /** Canvas fingerprint hash */
  canvasFingerprint: string;
  /** WebGL renderer string */
  webglRenderer: string;
  /** Audio context fingerprint */
  audioFingerprint: string;
  /** Available fonts */
  fonts: string[];
  /** User agent */
  userAgent: string;
  /** Language */
  language: string;
  /** Platform */
  platform: string;
  /** Hardware concurrency */
  hardwareConcurrency: number;
  /** Device memory (if available) */
  deviceMemory?: number;
}

/**
 * Sensor data for DataDome
 */
export interface SensorData {
  /** Mouse movement events */
  mouseMovements: Array<{
    timestamp: number;
    x: number;
    y: number;
    type: 'mousemove' | 'mousedown' | 'mouseup' | 'click';
  }>;
  /** Scroll events */
  scrollEvents: Array<{
    timestamp: number;
    deltaX: number;
    deltaY: number;
  }>;
  /** Keyboard events */
  keyboardEvents: Array<{
    timestamp: number;
    key: string;
    code: string;
  }>;
  /** Touch events (for mobile) */
  touchEvents: Array<{
    timestamp: number;
    touches: Array<{ x: number; y: number }>;
  }>;
}

/**
 * DataDome challenge response
 */
export interface DataDomeChallengeResponse {
  /** Challenge token or cookie value */
  token: string;
  /** Timestamp when challenge was solved */
  solvedAt: Date;
  /** Challenge type that was solved */
  challengeType?: DataDomeChallengeType;
  /** Duration in milliseconds */
  duration: number;
  /** Fingerprint used */
  fingerprint?: BrowserFingerprint;
}

/**
 * DataDome solver configuration
 */
export interface DataDomeSolverConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for sensor validation in milliseconds (default: 30000) */
  sensorTimeout?: number;
  /** Timeout for CAPTCHA challenges in milliseconds (default: 60000) */
  captchaTimeout?: number;
  /** Timeout for slider challenges in milliseconds (default: 30000) */
  sliderTimeout?: number;
  /** Initial retry delay in milliseconds (default: 2000) */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxRetryDelay?: number;
  /** Fingerprint consistency mode: 'session' or 'request' (default: 'session') */
  fingerprintConsistency?: 'session' | 'request';
  /** Sensor data verbosity level: 'minimal', 'normal', 'verbose' (default: 'normal') */
  sensorVerbosity?: 'minimal' | 'normal' | 'verbose';
  /** Enable CAPTCHA solving (default: true) */
  enableCaptchaSolving?: boolean;
  /** Enable slider challenge solving (default: true) */
  enableSliderSolving?: boolean;
  /** Enable cookie manipulation (default: true) */
  enableCookieManipulation?: boolean;
}

/**
 * DataDome solver metrics
 */
export interface DataDomeSolverMetrics {
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
  challengeTypeDistribution: Record<DataDomeChallengeType, number>;
  /** Failure reasons */
  failureReasons: Record<string, number>;
  /** Fingerprint configurations used */
  fingerprintConfigs: Array<{
    timestamp: Date;
    fingerprint: BrowserFingerprint;
    success: boolean;
  }>;
}

