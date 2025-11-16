import { Page } from 'playwright';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  DetectionContext,
  DetectionSignal,
} from '../interfaces';
import { IDetectionStrategy } from './detection-strategy.interface';
import { ConfidenceScoringService } from './confidence-scoring.service';

/**
 * Base abstract class for detection strategies
 * 
 * Provides common functionality and utilities for implementing
 * detection strategies. Subclasses should implement the detect()
 * method with their specific detection logic.
 */
export abstract class BaseDetectionStrategy implements IDetectionStrategy {
  abstract readonly systemType: AntiBotSystemType;

  constructor(
    protected readonly confidenceScoring: ConfidenceScoringService,
  ) {}

  /**
   * Abstract method to be implemented by subclasses
   * Contains the specific detection logic for the anti-bot system
   */
  abstract detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult>;

  /**
   * Get the name of this strategy (defaults to system type)
   */
  getName(): string {
    return `${this.systemType}-detection-strategy`;
  }

  /**
   * Calculate confidence score for detected signals
   * 
   * @param signals - Array of detection signals
   * @returns Confidence score (0-1)
   */
  protected calculateConfidence(signals: DetectionSignal[]): number {
    try {
      return this.confidenceScoring.calculateConfidence(
        signals,
        this.systemType,
      );
    } catch (error) {
      // Return 0 on scoring error
      return 0;
    }
  }

  /**
   * Create a detection result with the given signals
   * 
   * @param signals - Array of detection signals
   * @param additionalDetails - Additional details to include in the result
   * @returns AntiBotDetectionResult
   */
  protected createDetectionResult(
    signals: DetectionSignal[],
    additionalDetails?: Record<string, any>,
  ): AntiBotDetectionResult {
    const detected = signals.length > 0;
    const confidence = this.calculateConfidence(signals);

    return {
      detected,
      type: detected ? this.systemType : null,
      confidence,
      details: {
        signals,
        ...additionalDetails,
      },
      detectedAt: new Date(),
      durationMs: 0, // Will be set by caller
    };
  }

  /**
   * Create a "not detected" result
   */
  protected createNoDetectionResult(): AntiBotDetectionResult {
    return {
      detected: false,
      type: null,
      confidence: 0,
      details: { signals: [] },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }
}

