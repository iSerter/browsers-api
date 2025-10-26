import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  ActionResult,
  ActionConfig,
  IActionHandler,
} from '../interfaces/action-handler.interface';
import { humanScroll } from '../utils/human-scroll';

interface ScrollActionConfig extends ActionConfig {
  targetY?: number;       // final scrollTop target
  target?: string;       // target element selector (optional)
  getTargetBy?:         // how to find the target element
    | 'getByLabel'
    | 'getByText'
    | 'getByRole'
    | 'getBySelector'
    | 'getByPlaceholder';
  speed?: number;         // base pixels per second (default 2500)
  variance?: number;      // randomness factor 0–1 (default 0.35)
  stepMin?: number;       // minimal pixels per step (default 60)
  stepMax?: number;       // max pixels per step (default 180)
  pauseChance?: number;   // probability per step to pause briefly (default 0.15)
}

@Injectable()
export class ScrollActionHandler implements IActionHandler {
  private readonly logger = new Logger(ScrollActionHandler.name);

  async execute(
    page: Page,
    config: ScrollActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      target,
      getTargetBy,
      targetY,
      speed,
      variance,
      stepMin,
      stepMax,
      pauseChance,
    } = config;

    try {
      this.logger.log(
        `Starting scroll action for job ${jobId}${target ? ` to target: ${target} (${getTargetBy})` : ''}`,
      );

      // If scrolling to a specific element, find it and calculate its position
      let finalTargetY = targetY;
      
      if (target && getTargetBy) {
        const locator = this.getLocator(page, target, getTargetBy);
        await locator.waitFor({ state: 'visible' });
        const element = await locator.elementHandle();
        
        if (!element) {
          throw new Error('Element handle not found for scroll target');
        }

        const boundingBox = await element.boundingBox();
        if (!boundingBox) {
          throw new Error('Element not visible for scroll target');
        }

        // Calculate target Y position (element position minus half viewport for centering)
        const viewport = await page.viewportSize();
        finalTargetY = boundingBox.y - (viewport?.height ?? 800) / 2 + boundingBox.height / 2;
        
        this.logger.debug(`Scrolling to element: ${target} at Y position: ${finalTargetY}`);
      }

      // Perform human-like scrolling
      await humanScroll(page, {
        targetY: finalTargetY,
        speed,
        variance,
        stepMin,
        stepMax,
        pauseChance,
      });

      this.logger.log(`Scroll action completed successfully`);

      return {
        success: true,
        data: {
          target,
          getTargetBy,
          targetY: finalTargetY,
          options: {
            speed,
            variance,
            stepMin,
            stepMax,
            pauseChance,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Scroll action failed for job ${jobId}: ${error.message}`,
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

