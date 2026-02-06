import { Injectable, Logger } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';
import {
  StealthConfig,
  DEFAULT_STEALTH_CONFIG,
  MouseMovementConfig,
  DEFAULT_MOUSE_MOVEMENT_CONFIG,
} from '../interfaces/stealth.interface';

/**
 * Service for applying stealth techniques to browser contexts and pages
 * Implements comprehensive anti-bot detection evasion
 */
@Injectable()
export class StealthService {
  private readonly logger = new Logger(StealthService.name);

  /**
   * Apply all configured stealth techniques to a browser context
   * This should be called after creating a context but before creating pages
   */
  async applyStealthToContext(
    context: BrowserContext,
    config: StealthConfig = {},
  ): Promise<void> {
    const stealthConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
    this.logger.debug('Applying stealth configuration to context', {
      config: stealthConfig,
    });

    try {
      // Add init scripts to all pages created in this context
      await this.addStealthInitScripts(context, stealthConfig);

      this.logger.debug('Stealth configuration applied successfully');
    } catch (error) {
      this.logger.error(
        `Failed to apply stealth configuration: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Apply stealth techniques to an existing page
   * Useful for pages created before stealth was applied
   */
  async applyStealthToPage(
    page: Page,
    config: StealthConfig = {},
  ): Promise<void> {
    const stealthConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
    this.logger.debug('Applying stealth configuration to page');

    try {
      await this.addStealthInitScriptsToPage(page, stealthConfig);
      this.logger.debug('Stealth configuration applied to page successfully');
    } catch (error) {
      this.logger.error(
        `Failed to apply stealth to page: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Add all stealth init scripts to a context
   */
  private async addStealthInitScripts(
    context: BrowserContext,
    config: Required<StealthConfig>,
  ): Promise<void> {
    const scripts: string[] = [];

    if (config.overrideWebdriver) {
      scripts.push(this.getWebdriverOverrideScript());
    }

    if (config.preventCanvasFingerprinting) {
      scripts.push(this.getCanvasFingerprintingPreventionScript());
    }

    if (config.preventWebGLFingerprinting) {
      scripts.push(this.getWebGLFingerprintingPreventionScript());
    }

    if (config.preventAudioFingerprinting) {
      scripts.push(this.getAudioFingerprintingPreventionScript());
    }

    if (config.mockBatteryAPI) {
      scripts.push(this.getBatteryAPIMockingScript());
    }

    if (config.randomizeHardwareConcurrency) {
      scripts.push(
        this.getHardwareConcurrencyRandomizationScript(
          config.hardwareConcurrencyRange,
        ),
      );
    }

    if (config.mockPlugins) {
      scripts.push(this.getPluginsMockingScript());
    }

    if (config.mockLanguages) {
      scripts.push(this.getLanguagesMockingScript(config.locale));
    }

    if (config.enforceTimezoneConsistency) {
      scripts.push(this.getTimezoneConsistencyScript(config.timezoneId));
    }

    // Combine all scripts into one for better performance
    if (scripts.length > 0) {
      const combinedScript = scripts.join('\n\n');
      await context.addInitScript(combinedScript);
    }
  }

  /**
   * Add all stealth init scripts to a page
   */
  private async addStealthInitScriptsToPage(
    page: Page,
    config: Required<StealthConfig>,
  ): Promise<void> {
    const scripts: string[] = [];

    if (config.overrideWebdriver) {
      scripts.push(this.getWebdriverOverrideScript());
    }

    if (config.preventCanvasFingerprinting) {
      scripts.push(this.getCanvasFingerprintingPreventionScript());
    }

    if (config.preventWebGLFingerprinting) {
      scripts.push(this.getWebGLFingerprintingPreventionScript());
    }

    if (config.preventAudioFingerprinting) {
      scripts.push(this.getAudioFingerprintingPreventionScript());
    }

    if (config.mockBatteryAPI) {
      scripts.push(this.getBatteryAPIMockingScript());
    }

    if (config.randomizeHardwareConcurrency) {
      scripts.push(
        this.getHardwareConcurrencyRandomizationScript(
          config.hardwareConcurrencyRange,
        ),
      );
    }

    if (config.mockPlugins) {
      scripts.push(this.getPluginsMockingScript());
    }

    if (config.mockLanguages) {
      scripts.push(this.getLanguagesMockingScript(config.locale));
    }

    if (config.enforceTimezoneConsistency) {
      scripts.push(this.getTimezoneConsistencyScript(config.timezoneId));
    }

    if (scripts.length > 0) {
      const combinedScript = scripts.join('\n\n');
      await page.addInitScript(combinedScript);
      // Also evaluate immediately on the current page
      await page.evaluate(combinedScript);
    }
  }

  /**
   * Override navigator.webdriver to return false
   */
  private getWebdriverOverrideScript(): string {
    return `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    `;
  }

  /**
   * Prevent canvas fingerprinting by overriding canvas methods
   */
  private getCanvasFingerprintingPreventionScript(): string {
    return `
      (function() {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
          const context = originalGetContext.call(this, type, attributes);
          if (type === '2d') {
            const originalGetImageData = context.getImageData;
            context.getImageData = function(sx, sy, sw, sh) {
              const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
              // Add slight noise to prevent fingerprinting
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] += Math.floor(Math.random() * 3) - 1;
              }
              return imageData;
            };
          }
          return context;
        };
      })();
    `;
  }

  /**
   * Prevent WebGL fingerprinting by spoofing WebGL parameters
   */
  private getWebGLFingerprintingPreventionScript(): string {
    return `
      (function() {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // Spoof vendor and renderer
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.call(this, parameter);
        };
        
        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        if (getParameter2) {
          WebGL2RenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) {
              return 'Intel Inc.';
            }
            if (parameter === 37446) {
              return 'Intel Iris OpenGL Engine';
            }
            return getParameter2.call(this, parameter);
          };
        }
      })();
    `;
  }

  /**
   * Prevent audio context fingerprinting
   */
  private getAudioFingerprintingPreventionScript(): string {
    return `
      (function() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const originalCreateOscillator = AudioContext.prototype.createOscillator;
          AudioContext.prototype.createOscillator = function() {
            const oscillator = originalCreateOscillator.call(this);
            const originalStart = oscillator.start;
            oscillator.start = function(when) {
              // Add slight randomization to prevent fingerprinting
              const randomizedWhen = when + (Math.random() * 0.0001);
              return originalStart.call(this, randomizedWhen);
            };
            return oscillator;
          };
        }
      })();
    `;
  }

  /**
   * Mock Battery API to prevent device identification
   */
  private getBatteryAPIMockingScript(): string {
    return `
      (function() {
        Object.defineProperty(navigator, 'getBattery', {
          value: () => Promise.resolve({
            charging: true,
            level: 0.8,
            chargingTime: 0,
            dischargingTime: Infinity,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return true; },
          }),
          configurable: true,
          writable: true,
        });
      })();
    `;
  }

  /**
   * Randomize hardware concurrency
   * Note: The value is randomized once per context initialization for consistency
   */
  private getHardwareConcurrencyRandomizationScript(
    range: [number, number],
  ): string {
    const [min, max] = range;
    // Generate a random value once during script execution
    // This ensures consistency across multiple navigator.hardwareConcurrency accesses
    return `
      (function() {
        const cores = Math.floor(Math.random() * ${max - min + 1}) + ${min};
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => cores,
          configurable: true,
        });
      })();
    `;
  }

  /**
   * Mock browser plugins
   */
  private getPluginsMockingScript(): string {
    return `
      (function() {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            {
              0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Plugin',
            },
            {
              0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: '' },
              description: '',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Viewer',
            },
            {
              0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
              1: { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
              description: '',
              filename: 'internal-nacl-plugin',
              length: 2,
              name: 'Native Client',
            },
          ],
        });
      })();
    `;
  }

  /**
   * Mock browser languages
   */
  private getLanguagesMockingScript(locale: string): string {
    const lang = locale.split('-')[0];
    return `
      (function() {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['${locale}', '${lang}'],
        });
        Object.defineProperty(navigator, 'language', {
          get: () => '${locale}',
        });
      })();
    `;
  }

  /**
   * Enforce timezone consistency
   */
  private getTimezoneConsistencyScript(timezoneId: string): string {
    return `
      (function() {
        const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
        Intl.DateTimeFormat.prototype.resolvedOptions = function() {
          const options = originalResolvedOptions.call(this);
          options.timeZone = '${timezoneId}';
          return options;
        };
      })();
    `;
  }

  /**
   * Move mouse with human-like behavior
   * Returns a promise that resolves when movement is complete
   */
  async moveMouseHumanLike(
    page: Page,
    x: number,
    y: number,
    config: MouseMovementConfig = {},
  ): Promise<void> {
    const movementConfig = {
      ...DEFAULT_MOUSE_MOVEMENT_CONFIG,
      ...config,
    };

    const steps =
      Math.floor(
        Math.random() *
          (movementConfig.maxSteps - movementConfig.minSteps + 1),
      ) + movementConfig.minSteps;

    try {
      await page.mouse.move(x, y, { steps });
      const delay =
        Math.floor(
          Math.random() *
            (movementConfig.maxDelay - movementConfig.minDelay + 1),
        ) + movementConfig.minDelay;
      await page.waitForTimeout(delay);
    } catch (error) {
      this.logger.warn(
        `Failed to move mouse human-like: ${error.message}`,
      );
      // Fallback to instant movement
      await page.mouse.move(x, y);
    }
  }

  /**
   * Click with human-like behavior (includes movement and delay)
   */
  async clickHumanLike(
    page: Page,
    x: number,
    y: number,
    config: MouseMovementConfig = {},
  ): Promise<void> {
    await this.moveMouseHumanLike(page, x, y, config);
    await page.mouse.click(x, y);
  }

  /**
   * Validate user-agent and platform consistency
   * Returns true if consistent, false otherwise
   */
  validateUserAgentConsistency(
    userAgent: string,
    platform?: string,
  ): boolean {
    if (!platform) {
      return true; // Can't validate without platform
    }

    const ua = userAgent.toLowerCase();
    const plat = platform.toLowerCase();

    // Check Windows
    if (ua.includes('windows')) {
      return plat.includes('win');
    }

    // Check macOS
    if (ua.includes('mac os')) {
      return plat.includes('mac');
    }

    // Check Linux
    if (ua.includes('linux')) {
      return plat.includes('linux');
    }

    // Default to true if no clear match
    return true;
  }

  /**
   * Get a realistic user-agent string based on platform
   */
  getRealisticUserAgent(platform: 'windows' | 'macos' | 'linux' = 'windows'): string {
    const userAgents = {
      windows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      macos:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      linux:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    return userAgents[platform];
  }
}

