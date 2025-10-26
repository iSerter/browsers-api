import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';

interface FillActionConfig extends ActionConfig {
  target: string;
  getTargetBy: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder';
  value: string;
}

@Injectable()
export class FillActionHandler implements IActionHandler {
  private readonly logger = new Logger(FillActionHandler.name);

  async execute(
    page: Page,
    config: FillActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const { target, getTargetBy, value } = config;

    try {
      this.logger.log(
        `Starting fill action for job ${jobId} on target: ${target} (${getTargetBy}) with value: ${value}`,
      );

      // Validate required fields
      if (!target || !getTargetBy || value === undefined) {
        throw new Error('Fill action requires target, getTargetBy, and value');
      }

      // Get the locator based on getTargetBy method
      const locator = this.getLocator(page, target, getTargetBy);

      // Fill the field
      await locator.fill(value);

      this.logger.debug(`Filled field: ${target} with value: ${value}`);

      this.logger.log(`Fill action completed successfully`);

      return {
        success: true,
        data: {
          target,
          getTargetBy,
          value,
        },
      };
    } catch (error) {
      this.logger.error(`Fill action failed for job ${jobId}: ${error.message}`);

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

