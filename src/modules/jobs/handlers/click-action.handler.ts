import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';

interface ClickActionConfig extends ActionConfig {
  target: string;
  getTargetBy: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder';
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  waitForNavigation?: boolean;
}

@Injectable()
export class ClickActionHandler implements IActionHandler {
  private readonly logger = new Logger(ClickActionHandler.name);

  async execute(
    page: Page,
    config: ClickActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const { target, getTargetBy, button = 'left', clickCount = 1, waitForNavigation = false } = config;

    try {
      this.logger.log(
        `Starting click action for job ${jobId} on target: ${target} (${getTargetBy})`,
      );

      // Validate required fields
      if (!target || !getTargetBy) {
        throw new Error('Click action requires target and getTargetBy');
      }

      // Get the locator based on getTargetBy method
      const locator = this.getLocator(page, target, getTargetBy);

      // Perform click
      if (clickCount === 1) {
        await locator.click({ button });
      } else {
        await locator.click({ button, clickCount });
      }

      this.logger.debug(`Clicked element: ${target} (button: ${button}, count: ${clickCount})`);

      // Wait for navigation after click if requested
      if (waitForNavigation) {
        await page.waitForLoadState('networkidle');
        this.logger.debug('Navigation completed after click');
      }

      this.logger.log(`Click action completed successfully`);

      return {
        success: true,
        data: {
          target,
          getTargetBy,
          button,
          clickCount,
          waitedForNavigation: waitForNavigation,
        },
      };
    } catch (error) {
      this.logger.error(`Click action failed for job ${jobId}: ${error.message}`);

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

  private getLocator(page: Page, target: string, getTargetBy: string) {
    switch (getTargetBy) {
      case 'getByLabel':
        return page.getByLabel(target);
      case 'getByText':
        return page.getByText(target);
      case 'getByRole':
        return page.getByRole(target as any);
      case 'getByPlaceholder':
        return page.getByPlaceholder(target);
      case 'getBySelector':
        return page.locator(target);
      default:
        throw new Error(`Unknown getTargetBy method: ${getTargetBy}`);
    }
  }

  private getErrorCode(error: any): string {
    if (error.name === 'TimeoutError') {
      return 'TIMEOUT_ERROR';
    }
    if (error.message.includes('not found')) {
      return 'ELEMENT_NOT_FOUND_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: any): boolean {
    const errorCode = this.getErrorCode(error);
    return ['TIMEOUT_ERROR'].includes(errorCode);
  }
}
