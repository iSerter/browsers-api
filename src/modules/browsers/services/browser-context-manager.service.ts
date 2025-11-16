import { Injectable, Logger } from '@nestjs/common';
import { Browser, BrowserContext, Page } from 'playwright';
import {
  CreateContextOptions,
  ViewportConfig,
  ViewportPreset,
} from '../interfaces/browser-pool.interface';
import { StealthService } from './stealth.service';
import { DEFAULT_STEALTH_CONFIG } from '../interfaces/stealth.interface';

@Injectable()
export class BrowserContextManagerService {
  private readonly logger = new Logger(BrowserContextManagerService.name);

  constructor(private readonly stealthService: StealthService) {}

  async createContext(
    browser: Browser,
    options: CreateContextOptions = {},
  ): Promise<BrowserContext> {
    const {
      viewport,
      userAgent,
      timeout = 30000,
      ignoreHTTPSErrors = true,
      timezoneId,
      locale,
    } = options;

    const contextOptions: any = {
      timeout,
      ignoreHTTPSErrors,
    };

    // Set viewport
    if (viewport) {
      contextOptions.viewport = {
        width: viewport.width,
        height: viewport.height,
      };
      if (viewport.deviceScaleFactor !== undefined) {
        contextOptions.deviceScaleFactor = viewport.deviceScaleFactor;
      }
    }

    // Set user agent
    if (userAgent) {
      contextOptions.userAgent = userAgent;
    }

    // Set timezone
    if (timezoneId) {
      contextOptions.timezoneId = timezoneId;
    }

    // Set locale
    if (locale) {
      contextOptions.locale = locale;
    }

    // Set proxy configuration
    if (options.proxy) {
      contextOptions.proxy = {
        server: options.proxy.server,
        ...(options.proxy.username && { username: options.proxy.username }),
        ...(options.proxy.password && { password: options.proxy.password }),
      };
      this.logger.debug(
        `Creating context with proxy: ${options.proxy.server} (username: ${options.proxy.username ? '***' : 'none'})`,
      );
    }

    this.logger.debug('Creating browser context with options:', {
      ...contextOptions,
      proxy: contextOptions.proxy ? '***' : undefined,
    });

    try {
      const context = await browser.newContext(contextOptions);

      // Apply stealth configuration
      const stealthEnabled =
        options.stealth !== false &&
        (options.stealth === true || options.stealth !== undefined);

      if (stealthEnabled) {
        const stealthConfig =
          typeof options.stealth === 'object'
            ? {
                ...DEFAULT_STEALTH_CONFIG,
                ...options.stealth,
                // Override with context-level settings if provided
                ...(timezoneId && { timezoneId }),
                ...(locale && { locale }),
              }
            : {
                ...DEFAULT_STEALTH_CONFIG,
                ...(timezoneId && { timezoneId }),
                ...(locale && { locale }),
              };

        await this.stealthService.applyStealthToContext(context, stealthConfig);
        this.logger.debug('Stealth mode enabled for context');
      }

      // Validate user-agent/platform consistency if stealth is enabled
      if (stealthEnabled && userAgent) {
        const isValid = this.stealthService.validateUserAgentConsistency(
          userAgent,
          contextOptions.platform,
        );
        if (!isValid) {
          this.logger.warn(
            'User-agent and platform may be inconsistent. This could trigger detection.',
          );
        }
      }

      // Set resource limits
      await this.setResourceLimits(context);

      this.logger.debug('Browser context created successfully');
      return context;
    } catch (error) {
      this.logger.error(`Failed to create browser context: ${error.message}`);
      throw error;
    }
  }

  async closeContext(context: BrowserContext): Promise<void> {
    try {
      this.logger.debug('Closing browser context');

      // Close all pages in the context
      const pages = context.pages();
      await Promise.all(
        pages.map(async (page: Page) => {
          try {
            if (!page.isClosed()) {
              await page.close();
            }
          } catch (error) {
            this.logger.warn(`Error closing page: ${error.message}`);
          }
        }),
      );

      // Close the context
      const browser = context.browser();
      if (browser) {
        await context.close();
      }

      this.logger.debug('Browser context closed successfully');
    } catch (error) {
      this.logger.error(`Failed to close browser context: ${error.message}`);
      // Don't throw, just log the error
    }
  }

  async getViewport(preset: ViewportPreset): Promise<ViewportConfig> {
    const configs = {
      [ViewportPreset.DESKTOP]: { width: 1920, height: 1080 },
      [ViewportPreset.MOBILE_IPHONE]: { width: 375, height: 667 },
      [ViewportPreset.MOBILE_ANDROID]: { width: 412, height: 915 },
    };

    return configs[preset];
  }

  private async setResourceLimits(context: BrowserContext): Promise<void> {
    try {
      // Set memory limit (in MB) - Note: This is browser-specific and may not be fully supported
      // Most resource limits are handled by OS-level restrictions

      // Block unnecessary resources to reduce memory usage
      await context.route(
        '**/*.{jpg,jpeg,png,gif,ico,svg,woff,woff2,ttf,eot,mp4,webm}',
        (route) => {
          route.abort();
        },
      );

      this.logger.debug('Resource limits configured for context');
    } catch (error) {
      this.logger.warn(`Failed to set resource limits: ${error.message}`);
      // Don't throw, continue with context creation
    }
  }
}
