import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import { moveMouseHuman } from '../utils/human-mouse';
import {
  getLocator,
  isStrictModeViolation,
  getStrictModeViolationSuggestions,
} from '../utils/locator-helper';

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
  index?: number;
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
      index = 0,
    } = config;

    try {
      this.logger.log(
        `Starting move cursor action for job ${jobId} on target: ${target} (${getTargetBy}${index > 0 ? `, index: ${index}` : ''})`,
      );

      // Validate required fields
      if (!target || !getTargetBy) {
        throw new Error('Move cursor action requires target and getTargetBy');
      }

      // Get the locator based on getTargetBy method with index support
      const locator = getLocator(page, target, getTargetBy, index);

      // Wait for element to be visible with 2 second timeout
      await locator.waitFor({ state: 'visible', timeout: 2000 });

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
          index,
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

