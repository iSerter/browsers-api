/**
 * Interfaces for captcha widget interaction automation
 */

import { Page, Frame, Locator } from 'playwright';

/**
 * Captcha widget types
 */
export enum CaptchaWidgetType {
  RECAPTCHA = 'recaptcha',
  HCAPTCHA = 'hcaptcha',
  DATADOME = 'datadome',
  AKAMAI = 'akamai',
  TURNSTILE = 'turnstile',
  UNKNOWN = 'unknown',
}

/**
 * Configuration for widget interaction
 */
export interface WidgetInteractionConfig {
  /**
   * Timeout for waiting for widgets to appear (ms)
   * @default 10000
   */
  widgetTimeout?: number;

  /**
   * Timeout for waiting for elements (ms)
   * @default 5000
   */
  elementTimeout?: number;

  /**
   * Delay range for clicks (ms)
   * @default [500, 2000]
   */
  clickDelayRange?: [number, number];

  /**
   * Delay range for typing between keystrokes (ms)
   * @default [50, 150]
   */
  typingDelayRange?: [number, number];

  /**
   * Enable human-like interaction delays
   * @default true
   */
  enableHumanDelays?: boolean;

  /**
   * Enable screenshot capture for debugging
   * @default false
   */
  enableScreenshots?: boolean;

  /**
   * Directory for saving debug screenshots
   * @default './screenshots/debug'
   */
  screenshotDirectory?: string;

  /**
   * Force clicks when elements are not visible
   * @default false
   */
  forceClicks?: boolean;
}

/**
 * Options for element location
 */
export interface ElementLocatorOptions {
  /**
   * CSS selector
   */
  css?: string;

  /**
   * XPath selector
   */
  xpath?: string;

  /**
   * Text content to match
   */
  text?: string;

  /**
   * Role-based selector (e.g., 'button', 'textbox')
   */
  role?: string;

  /**
   * Aria label
   */
  ariaLabel?: string;

  /**
   * Timeout for waiting (ms)
   */
  timeout?: number;

  /**
   * Whether element must be visible
   * @default true
   */
  visible?: boolean;
}

/**
 * Result of widget detection
 */
export interface WidgetDetectionResult {
  /**
   * Detected widget type
   */
  widgetType: CaptchaWidgetType;

  /**
   * Found iframe element
   */
  iframe: Frame | null;

  /**
   * Iframe source URL
   */
  iframeSrc?: string;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Additional detection details
   */
  details?: Record<string, any>;
}

/**
 * Result of element interaction
 */
export interface InteractionResult {
  /**
   * Whether the interaction was successful
   */
  success: boolean;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Duration of the interaction (ms)
   */
  duration: number;

  /**
   * Additional result data
   */
  data?: Record<string, any>;
}

/**
 * Options for screenshot capture
 */
export interface ScreenshotOptions {
  /**
   * Screenshot type
   */
  type?: 'fullPage' | 'viewport' | 'element';

  /**
   * Element selector (for element screenshots)
   */
  selector?: string;

  /**
   * File path (auto-generated if not provided)
   */
  path?: string;

  /**
   * Task/job ID for organizing screenshots
   */
  taskId?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Screenshot capture result
 */
export interface ScreenshotResult {
  /**
   * File path where screenshot was saved
   */
  path: string;

  /**
   * Whether capture was successful
   */
  success: boolean;

  /**
   * Error message if failed
   */
  error?: string;
}

