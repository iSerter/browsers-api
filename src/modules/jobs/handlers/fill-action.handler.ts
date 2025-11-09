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
import { moveMouseHuman } from '../utils/human-mouse';

interface FillActionConfig extends ActionConfig {
  target: string;
  getTargetBy:
    | 'getByLabel'
    | 'getByText'
    | 'getByRole'
    | 'getBySelector'
    | 'getByPlaceholder';
  value: string;
  index?: number;
  // Human-like mouse movement options
  speed?: number;
  jitter?: number;
  overshoot?: number;
  minPauseMs?: number;
  maxPauseMs?: number;
  stepsMin?: number;
  stepsMax?: number;
  padding?: number;
  // Human-like typing options
  typingDelay?: number; // Delay between keystrokes in ms (default: 50-150ms random)
  typingDelayMin?: number; // Minimum delay between keystrokes (default: 50)
  typingDelayMax?: number; // Maximum delay between keystrokes (default: 150)
}

@Injectable()
export class FillActionHandler implements IActionHandler {
  private readonly logger = new Logger(FillActionHandler.name);

  async execute(
    page: Page,
    config: FillActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      target,
      getTargetBy,
      value,
      index = 0,
      speed,
      jitter,
      overshoot,
      minPauseMs,
      maxPauseMs,
      stepsMin,
      stepsMax,
      padding,
      typingDelay,
      typingDelayMin = 50,
      typingDelayMax = 150,
    } = config;

    try {
      this.logger.log(
        `Starting fill action for job ${jobId} on target: ${target} (${getTargetBy}${index > 0 ? `, index: ${index}` : ''}) with value: ${value}`,
      );

      // Validate required fields
      if (!target || !getTargetBy || value === undefined) {
        throw new Error('Fill action requires target, getTargetBy, and value');
      }

      // Get the locator based on getTargetBy method with index support
      const locator = getLocator(page, target, getTargetBy, index);

      // Wait for element to be visible with 2 second timeout
      await locator.waitFor({ state: 'visible', timeout: 2000 });

      // Get the element handle for human-like mouse movement
      const element = await locator.elementHandle();
      if (!element) {
        throw new Error('Element handle not found');
      }

      // Step 1: Move cursor to the input element using human-like movement
      this.logger.debug(`Moving cursor to input element: ${target}`);
      await moveMouseHuman(
        page,
        { el: element, padding },
        {
          speed,
          jitter,
          overshoot,
          minPauseMs,
          maxPauseMs,
          stepsMin,
          stepsMax,
        },
      );

      // Step 2: Click to focus the input field
      // Brief hover dwell before click (human-like behavior)
      await page.waitForTimeout(this.randomDelay(40, 140));
      await page.mouse.down();
      await page.waitForTimeout(this.randomDelay(20, 90));
      await page.mouse.up();

      // Small delay after click before typing
      await page.waitForTimeout(this.randomDelay(50, 150));

      // Step 3: Type the text with human-like delays
      this.logger.debug(`Typing value into field: ${target}`);
      
      // Calculate typing delay - use explicit delay if provided, otherwise random between min/max
      const delay = typingDelay ?? this.randomDelay(typingDelayMin, typingDelayMax);
      
      // Type character by character with human-like delays
      await locator.type(value, { delay });

      this.logger.debug(`Filled field: ${target} with value: ${value}`);

      this.logger.log(`Fill action completed successfully`);

      return {
        success: true,
        data: {
          target,
          getTargetBy,
          value,
          index,
          humanLike: true,
        },
      };
    } catch (error) {
      this.logger.error(
        `Fill action failed for job ${jobId}: ${error.message}`,
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

  /**
   * Generate a random delay between min and max milliseconds
   */
  private randomDelay(min: number, max: number): number {
    return Math.random() * (max - min) + min;
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
