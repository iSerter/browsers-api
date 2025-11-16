import { Injectable, Logger } from '@nestjs/common';
import { Page, Frame, Locator } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CaptchaWidgetType,
  WidgetInteractionConfig,
  ElementLocatorOptions,
  WidgetDetectionResult,
  InteractionResult,
  ScreenshotOptions,
  ScreenshotResult,
} from './interfaces/widget-interaction.interface';
import { HumanBehaviorSimulationService } from './human-behavior-simulation.service';

/**
 * Default configuration for widget interaction
 */
const DEFAULT_CONFIG: Required<WidgetInteractionConfig> = {
  widgetTimeout: 10000,
  elementTimeout: 5000,
  clickDelayRange: [500, 2000],
  typingDelayRange: [50, 150],
  enableHumanDelays: true,
  enableScreenshots: false,
  screenshotDirectory: './screenshots/debug',
  forceClicks: false,
};

/**
 * Service for automating interactions with captcha widgets
 * Provides iframe detection, context switching, element location, and interaction methods
 */
@Injectable()
export class CaptchaWidgetInteractionService {
  private readonly logger = new Logger(CaptchaWidgetInteractionService.name);

  constructor(
    private readonly behaviorSimulation: HumanBehaviorSimulationService,
  ) {}

  /**
   * Wait for a captcha widget to appear on the page
   */
  async waitForCaptchaWidget(
    page: Page,
    widgetType?: CaptchaWidgetType,
    config?: WidgetInteractionConfig,
  ): Promise<WidgetDetectionResult> {
    const startTime = Date.now();
    const timeout = config?.widgetTimeout ?? DEFAULT_CONFIG.widgetTimeout;
    const deadline = startTime + timeout;

    this.logger.debug(
      `Waiting for captcha widget${widgetType ? ` (${widgetType})` : ''}`,
    );

    try {
      // Try to detect widget by type or all types
      const widgetTypes = widgetType
        ? [widgetType]
        : [
            CaptchaWidgetType.RECAPTCHA,
            CaptchaWidgetType.HCAPTCHA,
            CaptchaWidgetType.TURNSTILE,
            CaptchaWidgetType.DATADOME,
            CaptchaWidgetType.AKAMAI,
          ];

      for (const type of widgetTypes) {
        const result = await this.detectWidget(page, type);
        if (result.iframe && result.confidence > 0.5) {
          this.logger.debug(
            `Detected ${type} widget with confidence ${result.confidence}`,
          );
          return result;
        }
      }

      // If no specific widget found, return unknown
      return {
        widgetType: CaptchaWidgetType.UNKNOWN,
        iframe: null,
        confidence: 0,
      };
    } catch (error) {
      this.logger.warn(`Error waiting for captcha widget: ${error.message}`);
      return {
        widgetType: CaptchaWidgetType.UNKNOWN,
        iframe: null,
        confidence: 0,
        details: { error: error.message },
      };
    }
  }

  /**
   * Detect a specific widget type on the page
   */
  async detectWidget(
    page: Page,
    widgetType: CaptchaWidgetType,
  ): Promise<WidgetDetectionResult> {
    try {
      const frames = page.frames();
      let bestFrame: Frame | null = null;
      let bestConfidence = 0;
      let iframeSrc: string | undefined;

      for (const frame of frames) {
        const src = frame.url();
        let confidence = 0;

        switch (widgetType) {
          case CaptchaWidgetType.RECAPTCHA:
            if (
              src.includes('recaptcha') ||
              src.includes('google.com/recaptcha')
            ) {
              confidence = 0.9;
            }
            break;

          case CaptchaWidgetType.HCAPTCHA:
            if (src.includes('hcaptcha')) {
              confidence = 0.9;
            }
            break;

          case CaptchaWidgetType.TURNSTILE:
            if (
              src.includes('challenges.cloudflare.com') ||
              src.includes('turnstile')
            ) {
              confidence = 0.9;
            }
            break;

          case CaptchaWidgetType.DATADOME:
            if (src.includes('datadome')) {
              confidence = 0.8;
            }
            break;

          case CaptchaWidgetType.AKAMAI:
            if (src.includes('akamai') || src.includes('akam.net')) {
              confidence = 0.8;
            }
            break;
        }

        // Additional DOM-based detection
        if (confidence > 0) {
          try {
            const hasWidget = await frame.evaluate((type) => {
              const selectors = {
                recaptcha: '.g-recaptcha, [data-sitekey*="recaptcha"]',
                hcaptcha: '.h-captcha, [data-sitekey*="hcaptcha"]',
                turnstile: '.cf-turnstile, [data-sitekey*="turnstile"]',
                datadome: '[id*="datadome"], [class*="datadome"]',
                akamai: '[id*="akamai"], [class*="akamai"]',
              };

              const selector = selectors[type as keyof typeof selectors];
              if (!selector) return false;

              return !!document.querySelector(selector);
            }, widgetType);

            if (hasWidget) {
              confidence = Math.min(confidence + 0.1, 1.0);
            }
          } catch (e) {
            // Frame evaluation may fail if frame is not accessible
            this.logger.debug(`Frame evaluation failed: ${e.message}`);
          }
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestFrame = frame;
          iframeSrc = src;
        }
      }

      return {
        widgetType,
        iframe: bestFrame,
        iframeSrc,
        confidence: bestConfidence,
      };
    } catch (error) {
      this.logger.warn(`Error detecting widget: ${error.message}`);
      return {
        widgetType,
        iframe: null,
        confidence: 0,
        details: { error: error.message },
      };
    }
  }

  /**
   * Switch to an iframe context
   */
  async switchToIframe(
    page: Page,
    iframe: Frame | string,
  ): Promise<Frame | null> {
    try {
      if (typeof iframe === 'string') {
        // Find frame by URL pattern or name
        const frames = page.frames();
        const targetFrame = frames.find(
          (f) => f.url().includes(iframe) || f.name() === iframe,
        );
        if (!targetFrame) {
          this.logger.warn(`Iframe not found: ${iframe}`);
          return null;
        }
        return targetFrame;
      }

      return iframe;
    } catch (error) {
      this.logger.warn(`Error switching to iframe: ${error.message}`);
      return null;
    }
  }

  /**
   * Locate an element using multiple strategies with fallback
   */
  async locateElement(
    context: Page | Frame,
    options: ElementLocatorOptions,
  ): Promise<Locator | null> {
    const timeout = options.timeout ?? DEFAULT_CONFIG.elementTimeout;
    const visible = options.visible ?? true;

    // Try CSS selector first
    if (options.css) {
      try {
        const locator = context.locator(options.css);
        if (visible) {
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await locator.waitFor({ state: 'attached', timeout });
        }
        return locator;
      } catch (e) {
        this.logger.debug(`CSS selector failed: ${options.css}`);
      }
    }

    // Try XPath
    if (options.xpath) {
      try {
        const locator = context.locator(options.xpath);
        if (visible) {
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await locator.waitFor({ state: 'attached', timeout });
        }
        return locator;
      } catch (e) {
        this.logger.debug(`XPath selector failed: ${options.xpath}`);
      }
    }

    // Try role-based selector
    if (options.role) {
      try {
        const locator = context.getByRole(options.role as any, {
          name: options.text || options.ariaLabel,
        });
        if (visible) {
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await locator.waitFor({ state: 'attached', timeout });
        }
        return locator;
      } catch (e) {
        this.logger.debug(`Role selector failed: ${options.role}`);
      }
    }

    // Try text content
    if (options.text) {
      try {
        const locator = context.getByText(options.text);
        if (visible) {
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await locator.waitFor({ state: 'attached', timeout });
        }
        return locator;
      } catch (e) {
        this.logger.debug(`Text selector failed: ${options.text}`);
      }
    }

    // Try aria label
    if (options.ariaLabel) {
      try {
        const locator = context.getByLabel(options.ariaLabel);
        if (visible) {
          await locator.waitFor({ state: 'visible', timeout });
        } else {
          await locator.waitFor({ state: 'attached', timeout });
        }
        return locator;
      } catch (e) {
        this.logger.debug(`Aria label selector failed: ${options.ariaLabel}`);
      }
    }

    this.logger.warn('All element location strategies failed');
    return null;
  }

  /**
   * Click an element with human-like delays
   */
  async clickElement(
    context: Page | Frame,
    options: ElementLocatorOptions,
    config?: WidgetInteractionConfig,
  ): Promise<InteractionResult> {
    const startTime = Date.now();

    try {
      const locator = await this.locateElement(context, options);
      if (!locator) {
        return {
          success: false,
          error: 'Element not found',
          duration: Date.now() - startTime,
        };
      }

      // Add human-like delay before click
      if (config?.enableHumanDelays ?? DEFAULT_CONFIG.enableHumanDelays) {
        const [min, max] =
          config?.clickDelayRange ?? DEFAULT_CONFIG.clickDelayRange;
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const force = config?.forceClicks ?? DEFAULT_CONFIG.forceClicks;
      await locator.click({ force, timeout: options.timeout });

      const duration = Date.now() - startTime;
      this.logger.debug(`Clicked element in ${duration}ms`);

      return {
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.warn(`Click failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Type text with human-like keystroke timing
   */
  async typeText(
    context: Page | Frame,
    text: string,
    options: ElementLocatorOptions,
    config?: WidgetInteractionConfig,
  ): Promise<InteractionResult> {
    const startTime = Date.now();

    try {
      const locator = await this.locateElement(context, options);
      if (!locator) {
        return {
          success: false,
          error: 'Element not found',
          duration: Date.now() - startTime,
        };
      }

      // Focus on the element first
      await locator.focus({ timeout: options.timeout });

      // Type with human-like delays
      if (config?.enableHumanDelays ?? DEFAULT_CONFIG.enableHumanDelays) {
        const [min, max] =
          config?.typingDelayRange ?? DEFAULT_CONFIG.typingDelayRange;

        // Use behavior simulation service for realistic typing
        // Calculate mean and std dev from range
        const keyPressMean = (min + max) / 2;
        const keyPressStdDev = (max - min) / 4;
        const interKeyMean = keyPressMean * 2;
        const interKeyStdDev = keyPressStdDev * 2;

        if ('keyboard' in context) {
          await this.behaviorSimulation.typeWithTiming(
            context as Page,
            text,
            {
              keyPressMean,
              keyPressStdDev,
              interKeyMean,
              interKeyStdDev,
            },
          );
        } else {
          // Fallback to regular typing for frames
          await locator.type(text, { timeout: options.timeout });
        }
      } else {
        await locator.type(text, { timeout: options.timeout });
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`Typed text in ${duration}ms`);

      return {
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.warn(`Type failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Select an option from a select element
   */
  async selectOption(
    context: Page | Frame,
    value: string | string[],
    options: ElementLocatorOptions,
    config?: WidgetInteractionConfig,
  ): Promise<InteractionResult> {
    const startTime = Date.now();

    try {
      const locator = await this.locateElement(context, options);
      if (!locator) {
        return {
          success: false,
          error: 'Element not found',
          duration: Date.now() - startTime,
        };
      }

      // Add delay before selection
      if (config?.enableHumanDelays ?? DEFAULT_CONFIG.enableHumanDelays) {
        const [min, max] =
          config?.clickDelayRange ?? DEFAULT_CONFIG.clickDelayRange;
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await locator.selectOption(value, { timeout: options.timeout });

      const duration = Date.now() - startTime;
      this.logger.debug(`Selected option in ${duration}ms`);

      return {
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.warn(`Select failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Wait for element stability (no DOM mutations)
   */
  async waitForElementStability(
    context: Page | Frame,
    options: ElementLocatorOptions,
    stabilityDuration: number = 500,
  ): Promise<boolean> {
    try {
      const locator = await this.locateElement(context, options);
      if (!locator) {
        return false;
      }

      // Wait for load state
      if ('waitForLoadState' in context) {
        await (context as Page).waitForLoadState('networkidle', {
          timeout: 5000,
        });
      }

      // Simple stability check - wait for a period with no changes
      await new Promise((resolve) => setTimeout(resolve, stabilityDuration));

      return true;
    } catch (error) {
      this.logger.warn(`Stability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Capture a screenshot for debugging
   */
  async captureDebugScreenshot(
    page: Page,
    options: ScreenshotOptions = {},
    config?: WidgetInteractionConfig,
  ): Promise<ScreenshotResult> {
    if (!(config?.enableScreenshots ?? DEFAULT_CONFIG.enableScreenshots)) {
      return {
        path: '',
        success: false,
        error: 'Screenshots disabled',
      };
    }

    try {
      const screenshotDir =
        config?.screenshotDirectory ?? DEFAULT_CONFIG.screenshotDirectory;
      await fs.mkdir(screenshotDir, { recursive: true });

      const timestamp = Date.now();
      const taskId = options.taskId || 'unknown';
      const filename = `captcha-${taskId}-${timestamp}.png`;
      const filepath = options.path || path.join(screenshotDir, filename);

      const screenshotOptions: any = {
        path: filepath,
        fullPage: options.type === 'fullPage',
      };

      if (options.type === 'element' && options.selector) {
        const element = await page.locator(options.selector).first();
        await element.screenshot(screenshotOptions);
      } else {
        await page.screenshot(screenshotOptions);
      }

      this.logger.debug(`Screenshot saved: ${filepath}`);

      return {
        path: filepath,
        success: true,
      };
    } catch (error) {
      this.logger.warn(`Screenshot capture failed: ${error.message}`);
      return {
        path: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Wait for dynamic widget loading using mutation observer
   */
  async waitForDynamicWidget(
    page: Page,
    widgetType: CaptchaWidgetType,
    timeout: number = 10000,
  ): Promise<WidgetDetectionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const deadline = startTime + timeout;

      const checkInterval = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(checkInterval);
          resolve({
            widgetType,
            iframe: null,
            confidence: 0,
            details: { error: 'Timeout waiting for widget' },
          });
          return;
        }

        const result = await this.detectWidget(page, widgetType);
        if (result.iframe && result.confidence > 0.5) {
          clearInterval(checkInterval);
          resolve(result);
        }
      }, 500);

      // Also check immediately
      this.detectWidget(page, widgetType).then((result) => {
        if (result.iframe && result.confidence > 0.5) {
          clearInterval(checkInterval);
          resolve(result);
        }
      });
    });
  }
}

