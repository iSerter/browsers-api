import { Injectable, Logger } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import { ArtifactStorageService } from '../services/artifact-storage.service';
import { ArtifactType } from '../entities/job-artifact.entity';

interface ScreenshotActionConfig extends ActionConfig {
  fullPage?: boolean;
  type?: 'png' | 'jpeg';
  quality?: number;
  waitForSelector?: string;
  waitForTimeout?: number;
}

@Injectable()
export class ScreenshotActionHandler implements IActionHandler {
  private readonly logger = new Logger(ScreenshotActionHandler.name);

  constructor(
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  async execute(
    context: BrowserContext,
    config: ScreenshotActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      fullPage = false,
      type = 'png',
      quality = 80,
      waitForSelector,
      waitForTimeout,
      targetUrl,
      waitUntil = 'networkidle',
      timeout = 30000,
    } = config;

    const page = await context.newPage();

    try {
      this.logger.log(
        `Starting screenshot action for job ${jobId} with options: fullPage=${fullPage}, type=${type}, quality=${quality}`,
      );

      // Configure request interception to block unnecessary resources
      await this.blockUnnecessaryResources(page);

      // Navigate to target URL with retry logic
      await this.navigateWithRetry(page, targetUrl, waitUntil, timeout);

      // Apply wait strategies
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
      if (waitForTimeout) {
        await page.waitForTimeout(waitForTimeout);
      }

      // Take screenshot
      const screenshotBuffer = await page.screenshot({
        fullPage,
        type,
        quality,
      });

      // Generate filename
      const timestamp = Date.now();
      const extension = type === 'jpeg' ? 'jpg' : type;
      const filename = `${timestamp}-screenshot.${extension}`;

      // Save artifact
      const mimeType = type === 'jpeg' ? 'image/jpeg' : 'image/png';
      const filePath = await this.artifactStorageService.saveArtifact(
        screenshotBuffer,
        jobId,
        filename,
        ArtifactType.SCREENSHOT,
        mimeType,
      );

      this.logger.log(`Screenshot saved successfully: ${filePath}`);

      return {
        success: true,
        artifactId: filePath,
        data: {
          filePath,
          type,
          size: screenshotBuffer.length,
          mimeType,
        },
      };
    } catch (error) {
      this.logger.error(
        `Screenshot action failed for job ${jobId}: ${error.message}`,
      );

      return {
        success: false,
        error: {
          message: error.message,
          code: this.getErrorCode(error),
          retryable: this.isRetryableError(error),
        },
      };
    } finally {
      await page.close();
    }
  }

  private async navigateWithRetry(
    page: Page,
    url: string,
    waitUntil: string,
    timeout: number,
    maxRetries = 3,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(
          `Navigation attempt ${attempt}/${maxRetries} for ${url}`,
        );

        await page.goto(url, {
          waitUntil: waitUntil as any,
          timeout,
        });

        this.logger.debug(`Navigation successful on attempt ${attempt}`);
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Navigation attempt ${attempt} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          this.logger.debug(`Retrying in ${delay}ms...`);
          await this.waitFor(delay);
        }
      }
    }

    throw new Error(
      `Failed to navigate to ${url} after ${maxRetries} attempts: ${
        lastError?.message || 'unknown error'
      }`,
    );
  }

  private async blockUnnecessaryResources(page: Page): Promise<void> {
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();

      // Block images, fonts, media files by default
      // Can be made configurable later
      const blockedResources = ['image', 'media', 'font', 'websocket'];
      const blockedPatterns = [
        /ads/,
        /analytics/,
        /tracking/,
        /google-analytics/,
        /facebook\.net/,
      ];

      if (blockedResources.includes(resourceType)) {
        route.abort();
        return;
      }

      // Block URLs matching patterns
      for (const pattern of blockedPatterns) {
        if (pattern.test(url)) {
          route.abort();
          return;
        }
      }

      route.continue();
    });
  }

  private getErrorCode(error: any): string {
    if (error.name === 'TimeoutError') {
      return 'TIMEOUT_ERROR';
    }
    if (error.message.includes('net::ERR')) {
      return 'NETWORK_ERROR';
    }
    if (error.message.includes('Invalid URL')) {
      return 'INVALID_URL_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: any): boolean {
    const errorCode = this.getErrorCode(error);
    return ['TIMEOUT_ERROR', 'NETWORK_ERROR'].includes(errorCode);
  }

  private async waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
