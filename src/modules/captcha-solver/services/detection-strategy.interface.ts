import { Page } from 'playwright';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  DetectionContext,
} from '../interfaces';

/**
 * Interface for anti-bot detection strategies
 * 
 * Each anti-bot system should implement this interface to provide
 * its detection logic. This allows for easy extensibility when
 * adding new anti-bot systems.
 */
export interface IDetectionStrategy {
  /**
   * The anti-bot system type this strategy detects
   */
  readonly systemType: AntiBotSystemType;

  /**
   * Detect the anti-bot system on the given page
   * 
   * @param page - Playwright Page object to analyze
   * @param context - Detection context (URL, cookies, headers, etc.)
   * @returns Detection result with confidence score and signals
   */
  detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult>;

  /**
   * Get the name/identifier of this detection strategy
   * Useful for logging and debugging
   */
  getName(): string;
}

