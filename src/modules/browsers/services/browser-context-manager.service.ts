import { Injectable, Logger } from '@nestjs/common';
import { Browser, BrowserContext, Page } from 'playwright';
import {
  CreateContextOptions,
  ViewportConfig,
  ViewportPreset,
} from '../interfaces/browser-pool.interface';

@Injectable()
export class BrowserContextManagerService {
  private readonly logger = new Logger(BrowserContextManagerService.name);

  async createContext(
    browser: Browser,
    options: CreateContextOptions = {},
  ): Promise<BrowserContext> {
    const {
      viewport,
      userAgent,
      timeout = 30000,
      ignoreHTTPSErrors = true,
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

    this.logger.debug('Creating browser context with options:', contextOptions);

    try {
      const context = await browser.newContext(contextOptions);

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
      await context.route('**/*.{jpg,jpeg,png,gif,ico,svg,woff,woff2,ttf,eot,mp4,webm}', (route) => {
        route.abort();
      });

      this.logger.debug('Resource limits configured for context');
    } catch (error) {
      this.logger.warn(`Failed to set resource limits: ${error.message}`);
      // Don't throw, continue with context creation
    }
  }
}

