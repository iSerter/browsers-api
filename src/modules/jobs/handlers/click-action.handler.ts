import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import {
  getLocator,
  isStrictModeViolation,
  getStrictModeViolationSuggestions,
} from '../utils/locator-helper';

interface ClickActionConfig extends ActionConfig {
  target: string;
  getTargetBy:
    | 'getByLabel'
    | 'getByText'
    | 'getByRole'
    | 'getBySelector'
    | 'getByPlaceholder';
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  waitForNavigation?: boolean;
  index?: number;
}

@Injectable()
export class ClickActionHandler implements IActionHandler {
  private readonly logger = new Logger(ClickActionHandler.name);

  async execute(
    page: Page,
    config: ClickActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      target,
      getTargetBy,
      button = 'left',
      clickCount = 1,
      waitForNavigation = false,
      index = 0,
    } = config;

    try {
      this.logger.log(
        `Starting click action for job ${jobId} on target: ${target} (${getTargetBy}${index > 0 ? `, index: ${index}` : ''})`,
      );

      // Validate required fields
      if (!target || !getTargetBy) {
        throw new Error('Click action requires target and getTargetBy');
      }

      // Get the locator based on getTargetBy method with index support
      const locator = getLocator(page, target, getTargetBy, index);

      // Perform click with 2 second timeout
      if (clickCount === 1) {
        await locator.click({ button, timeout: 2000 });
      } else {
        await locator.click({ button, clickCount, timeout: 2000 });
      }

      this.logger.debug(
        `Clicked element: ${target} (button: ${button}, count: ${clickCount})`,
      );

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
          index,
        },
      };
    } catch (error) {
      this.logger.error(
        `Click action failed for job ${jobId}: ${error.message}`,
      );

      // Enhance error message for strict mode violations
      let errorMessage = error.message;
      if (isStrictModeViolation(error)) {
        const suggestions = getStrictModeViolationSuggestions(error);
        errorMessage = `${error.message}. ${suggestions}`;
      }

      return {
        success: false,
        error: {
          message: errorMessage,
          code: this.getErrorCode(error),
          retryable: this.isRetryableError(error),
        },
      };
    }
  }

  private getErrorCode(error: any): string {
    // Timeout errors from element selection should be treated as element not found
    if (error.name === 'TimeoutError') {
      return 'ELEMENT_NOT_FOUND_ERROR';
    }
    if (isStrictModeViolation(error)) {
      return 'STRICT_MODE_VIOLATION';
    }
    if (error.message.includes('not found')) {
      return 'ELEMENT_NOT_FOUND_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: any): boolean {
    const errorCode = this.getErrorCode(error);
    // Element not found and strict mode violations are not retryable - they require user action
    return false;
  }
}
