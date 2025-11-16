import { Page } from 'playwright';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  DetectionContext,
} from '../interfaces';
import { IDetectionStrategy } from './detection-strategy.interface';

/**
 * Adapter that wraps DetectionService methods as strategies
 * 
 * This allows the existing DetectionService methods to be used
 * as detection strategies without major refactoring.
 */
export class DetectionServiceAdapter implements IDetectionStrategy {
  constructor(
    public readonly systemType: AntiBotSystemType,
    private readonly detectionMethod: (
      page: Page,
      context: DetectionContext,
    ) => Promise<AntiBotDetectionResult>,
    private readonly name?: string,
  ) {}

  async detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    return this.detectionMethod(page, context);
  }

  getName(): string {
    return this.name || `${this.systemType}-adapter`;
  }
}

