import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
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
}

@Injectable()
export class ScreenshotActionHandler implements IActionHandler {
  private readonly logger = new Logger(ScreenshotActionHandler.name);

  constructor(
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  async execute(
    page: Page,
    config: ScreenshotActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const { fullPage = false, type = 'png', quality = 80 } = config;

    try {
      this.logger.log(
        `Starting screenshot action for job ${jobId} with options: fullPage=${fullPage}, type=${type}, quality=${quality}`,
      );

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
    }
  }

  private getErrorCode(error: any): string {
    if (error.name === 'TimeoutError') {
      return 'TIMEOUT_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: any): boolean {
    const errorCode = this.getErrorCode(error);
    return ['TIMEOUT_ERROR'].includes(errorCode);
  }
}
