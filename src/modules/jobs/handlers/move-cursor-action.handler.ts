import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import { moveMouseHuman } from '../utils/human-mouse';

interface MoveCursorActionConfig extends ActionConfig {
  target: string;
  getTargetBy:
    | 'getByLabel'
    | 'getByText'
    | 'getByRole'
    | 'getBySelector'
    | 'getByPlaceholder';
  speed?: number;
  jitter?: number;
  overshoot?: number;
  minPauseMs?: number;
  maxPauseMs?: number;
  stepsMin?: number;
  stepsMax?: number;
  padding?: number;
}

@Injectable()
export class MoveCursorActionHandler implements IActionHandler {
  private readonly logger = new Logger(MoveCursorActionHandler.name);

  async execute(
    page: Page,
    config: MoveCursorActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      target,
      getTargetBy,
      speed,
      jitter,
      overshoot,
      minPauseMs,
      maxPauseMs,
      stepsMin,
      stepsMax,
      padding,
    } = config;

    try {
      this.logger.log(
        `Starting move cursor action for job ${jobId} on target: ${target} (${getTargetBy})`,
      );

      // Validate required fields
      if (!target || !getTargetBy) {
        throw new Error('Move cursor action requires target and getTargetBy');
      }

      // Get the locator based on getTargetBy method
      const locator = this.getLocator(page, target, getTargetBy);

      // Wait for element to be visible
      await locator.waitFor({ state: 'visible' });

      // Get the element handle
      const element = await locator.elementHandle();
      if (!element) {
        throw new Error('Element handle not found');
      }

      // Move cursor to element using human-like movement
      await moveMouseHuman(page, { el: element, padding }, {
        speed,
        jitter,
        overshoot,
        minPauseMs,
        maxPauseMs,
        stepsMin,
        stepsMax,
      });

      this.logger.debug(`Moved cursor to element: ${target}`);

      this.logger.log(`Move cursor action completed successfully`);

      return {
        success: true,
        data: {
          target,
          getTargetBy,
          options: {
            speed,
            jitter,
            overshoot,
            minPauseMs,
            maxPauseMs,
            stepsMin,
            stepsMax,
            padding,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Move cursor action failed for job ${jobId}: ${error.message}`,
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

