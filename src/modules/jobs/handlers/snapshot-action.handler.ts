import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import { ArtifactStorageService } from '../services/artifact-storage.service';
import { ArtifactType } from '../entities/job-artifact.entity';
import { SnapshotConfigDto } from '../dto/action-config.dto';

interface SnapshotActionConfig extends ActionConfig {
  snapshotConfig?: SnapshotConfigDto;
}

/**
 * Handler for snapshot actions that captures the current state of a web page.
 * Captures HTML content, metadata (URL, title, timestamp, viewport), and optionally
 * cookies, localStorage, and sessionStorage based on configuration.
 */
@Injectable()
export class SnapshotActionHandler implements IActionHandler {
  private readonly logger = new Logger(SnapshotActionHandler.name);

  constructor(
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  /**
   * Executes a snapshot action by capturing the current browser state.
   *
   * @param page - Playwright Page instance representing the browser page
   * @param config - Action configuration containing snapshot options
   * @param jobId - Identifier for the job to associate artifacts with
   * @returns Promise resolving to ActionResult indicating success or failure
   */
  async execute(
    page: Page,
    config: SnapshotActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const snapshotConfig = config.snapshotConfig || {};
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
    } = snapshotConfig;

    try {
      this.logger.log(
        `Starting snapshot action for job ${jobId} with options: cookies=${cookies}, localStorage=${localStorage}, sessionStorage=${sessionStorage}`,
      );

      // 1. Always capture HTML content
      const htmlContent = await page.content();

      // 2. Capture metadata (always included)
      const url = page.url();
      const viewport = page.viewportSize();
      let title: string | undefined;
      let userAgent: string | undefined;
      let language: string | undefined;
      let platform: string | undefined;
      let timezone: string | undefined;

      try {
        title = await page.title();
      } catch (error) {
        this.logger.debug(`Failed to get page title: ${error.message}`);
      }

      try {
        userAgent = await page.evaluate(() => navigator.userAgent);
      } catch (error) {
        this.logger.debug(`Failed to get user agent: ${error.message}`);
      }

      try {
        language = await page.evaluate(() => navigator.language);
      } catch (error) {
        this.logger.debug(`Failed to get language: ${error.message}`);
      }

      try {
        platform = await page.evaluate(() => navigator.platform);
      } catch (error) {
        this.logger.debug(`Failed to get platform: ${error.message}`);
      }

      try {
        timezone = await page.evaluate(() =>
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
      } catch (error) {
        this.logger.debug(`Failed to get timezone: ${error.message}`);
      }

      // 3. Build snapshot data object
      const snapshotData: any = {
        html: htmlContent,
        url,
        title,
        timestamp: new Date().toISOString(),
        metadata: {
          viewport: viewport
            ? {
                width: viewport.width,
                height: viewport.height,
              }
            : null,
          userAgent,
          language,
          platform,
          timezone,
        },
      };

      // 4. Conditionally capture cookies
      if (cookies) {
        try {
          const context = page.context();
          const contextCookies = await context.cookies();
          snapshotData.cookies = contextCookies;
        } catch (error) {
          this.logger.warn(
            `Failed to capture cookies: ${error.message}`,
          );
          snapshotData.cookies = null;
        }
      }

      // 5. Conditionally capture localStorage
      if (localStorage) {
        try {
          const localStorageData = await page.evaluate(() => {
            const storage: Record<string, string> = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (key) {
                storage[key] = window.localStorage.getItem(key) || '';
              }
            }
            return storage;
          });
          snapshotData.localStorage = localStorageData;
        } catch (error) {
          this.logger.warn(
            `Failed to capture localStorage: ${error.message}`,
          );
          snapshotData.localStorage = null;
        }
      }

      // 6. Conditionally capture sessionStorage
      if (sessionStorage) {
        try {
          const sessionStorageData = await page.evaluate(() => {
            const storage: Record<string, string> = {};
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const key = window.sessionStorage.key(i);
              if (key) {
                storage[key] = window.sessionStorage.getItem(key) || '';
              }
            }
            return storage;
          });
          snapshotData.sessionStorage = sessionStorageData;
        } catch (error) {
          this.logger.warn(
            `Failed to capture sessionStorage: ${error.message}`,
          );
          snapshotData.sessionStorage = null;
        }
      }

      // 7. Convert to JSON buffer
      const jsonString = JSON.stringify(snapshotData, null, 2);
      const jsonBuffer = Buffer.from(jsonString, 'utf-8');

      // 8. Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `${timestamp}-snapshot.json`;

      // 9. Save artifact
      const filePath = await this.artifactStorageService.saveArtifact(
        jsonBuffer,
        jobId,
        filename,
        ArtifactType.SNAPSHOT,
        'application/json',
      );

      this.logger.log(`Snapshot saved successfully: ${filePath}`);

      return {
        success: true,
        artifactId: filePath,
        data: {
          filePath,
          size: jsonBuffer.length,
          mimeType: 'application/json',
          url,
          title,
          timestamp: snapshotData.timestamp,
        },
      };
    } catch (error) {
      this.logger.error(
        `Snapshot action failed for job ${jobId}: ${error.message}`,
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

