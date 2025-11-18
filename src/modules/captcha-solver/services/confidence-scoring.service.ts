import { Injectable, Optional } from '@nestjs/common';
import {
  DetectionSignal,
  SignalStrength,
  AntiBotSystemType,
} from '../interfaces';

/**
 * Configuration for confidence scoring algorithm
 */
export interface ConfidenceScoringConfig {
  /**
   * Base weights for signal strengths
   */
  signalWeights: {
    [SignalStrength.STRONG]: number;
    [SignalStrength.MODERATE]: number;
    [SignalStrength.WEAK]: number;
  };

  /**
   * Bonus multiplier for having multiple strong signals
   */
  multipleStrongSignalsBonus: number;

  /**
   * Bonus for signal diversity (different signal types)
   */
  diversityBonus: number;

  /**
   * Maximum confidence score (cap)
   */
  maxConfidence: number;

  /**
   * Minimum confidence threshold for a positive detection
   */
  minDetectionThreshold: number;
}

/**
 * Default configuration for confidence scoring
 */
const DEFAULT_CONFIG: ConfidenceScoringConfig = {
  signalWeights: {
    [SignalStrength.STRONG]: 0.4,
    [SignalStrength.MODERATE]: 0.25,
    [SignalStrength.WEAK]: 0.1,
  },
  multipleStrongSignalsBonus: 0.15,
  diversityBonus: 0.1,
  maxConfidence: 1.0,
  minDetectionThreshold: 0.3,
};

/**
 * Detailed confidence score breakdown
 */
export interface ConfidenceScoreBreakdown {
  /**
   * Final confidence score (0-1)
   */
  score: number;

  /**
   * Base score from signal weights
   */
  baseScore: number;

  /**
   * Bonus from multiple strong signals
   */
  strongSignalsBonus: number;

  /**
   * Bonus from signal diversity
   */
  diversityBonus: number;

  /**
   * Signal count breakdown
   */
  signalCounts: {
    total: number;
    strong: number;
    moderate: number;
    weak: number;
  };

  /**
   * Unique signal types detected
   */
  signalTypes: string[];

  /**
   * Whether this meets minimum detection threshold
   */
  meetsThreshold: boolean;
}

/**
 * Service for calculating confidence scores for anti-bot detection results
 * 
 * The confidence scoring algorithm uses a multi-factor approach:
 * 1. Base scoring from weighted signal strengths
 * 2. Bonus for multiple strong signals (indicates high certainty)
 * 3. Bonus for signal diversity (different types of evidence)
 * 
 * This provides a more nuanced confidence assessment than simple addition.
 */
@Injectable()
export class ConfidenceScoringService {
  private config: ConfidenceScoringConfig;

  constructor(@Optional() config?: Partial<ConfidenceScoringConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate confidence score for a set of detection signals
   * 
   * @param signals - Array of detection signals
   * @param systemType - Optional system type for context-aware scoring
   * @returns Confidence score between 0 and 1
   */
  calculateConfidence(
    signals: DetectionSignal[],
    systemType?: AntiBotSystemType,
  ): number {
    if (signals.length === 0) return 0;

    const breakdown = this.calculateDetailedScore(signals, systemType);
    return breakdown.score;
  }

  /**
   * Calculate detailed confidence score with breakdown
   * 
   * Provides insight into how the confidence score was calculated
   * 
   * @param signals - Array of detection signals
   * @param systemType - Optional system type for context-aware scoring
   * @returns Detailed score breakdown
   */
  calculateDetailedScore(
    signals: DetectionSignal[],
    systemType?: AntiBotSystemType,
  ): ConfidenceScoreBreakdown {
    if (signals.length === 0) {
      return this.createEmptyBreakdown();
    }

    // Count signals by strength
    const signalCounts = this.countSignalsByStrength(signals);

    // Calculate base score from weighted signals
    const baseScore = this.calculateBaseScore(signals);

    // Calculate bonus for multiple strong signals
    const strongSignalsBonus = this.calculateStrongSignalsBonus(signalCounts.strong);

    // Calculate diversity bonus
    const signalTypes = this.extractSignalTypes(signals);
    const diversityBonus = this.calculateDiversityBonus(signalTypes);

    // Apply context-aware adjustments if system type is provided
    const contextAdjustment = systemType 
      ? this.calculateContextAdjustment(signals, systemType)
      : 0;

    // Calculate final score
    let finalScore = baseScore + strongSignalsBonus + diversityBonus + contextAdjustment;

    // Cap at maximum confidence
    finalScore = Math.min(finalScore, this.config.maxConfidence);

    // Round to 2 decimal places
    finalScore = Math.round(finalScore * 100) / 100;

    return {
      score: finalScore,
      baseScore: Math.round(baseScore * 100) / 100,
      strongSignalsBonus: Math.round(strongSignalsBonus * 100) / 100,
      diversityBonus: Math.round(diversityBonus * 100) / 100,
      signalCounts: {
        total: signals.length,
        ...signalCounts,
      },
      signalTypes,
      meetsThreshold: finalScore >= this.config.minDetectionThreshold,
    };
  }

  /**
   * Calculate base score from signal weights
   */
  private calculateBaseScore(signals: DetectionSignal[]): number {
    let score = 0;
    
    for (const signal of signals) {
      score += this.config.signalWeights[signal.strength];
    }

    return score;
  }

  /**
   * Calculate bonus for having multiple strong signals
   * 
   * Multiple strong signals indicate very high certainty.
   * The bonus increases with more strong signals but with diminishing returns.
   */
  private calculateStrongSignalsBonus(strongSignalCount: number): number {
    if (strongSignalCount <= 1) return 0;

    // Apply bonus with diminishing returns
    // 2 strong signals: full bonus
    // 3+ strong signals: bonus + half bonus for each additional
    const baseBonus = this.config.multipleStrongSignalsBonus;
    
    if (strongSignalCount === 2) {
      return baseBonus;
    }

    // 3+ signals get bonus + diminishing returns
    const additionalSignals = strongSignalCount - 2;
    const additionalBonus = additionalSignals * (baseBonus * 0.5);
    
    return baseBonus + additionalBonus;
  }

  /**
   * Calculate diversity bonus
   * 
   * Having different types of signals (DOM, script, cookie, header)
   * provides more confidence than multiple signals of the same type.
   */
  private calculateDiversityBonus(signalTypes: string[]): number {
    const uniqueTypes = signalTypes.length;
    
    if (uniqueTypes <= 1) return 0;
    
    // Scale bonus based on number of unique signal types
    // 2 types: 50% of max bonus
    // 3 types: 75% of max bonus
    // 4+ types: full bonus
    const maxBonus = this.config.diversityBonus;
    
    if (uniqueTypes === 2) return maxBonus * 0.5;
    if (uniqueTypes === 3) return maxBonus * 0.75;
    
    return maxBonus;
  }

  /**
   * Calculate context-aware adjustment based on system type
   * 
   * Some signals are more definitive for certain anti-bot systems.
   * This method provides small adjustments based on signal-system combinations.
   */
  private calculateContextAdjustment(
    signals: DetectionSignal[],
    systemType: AntiBotSystemType,
  ): number {
    let adjustment = 0;

    // Context-specific signal importance
    const contextRules = this.getContextRules(systemType);

    for (const signal of signals) {
      const rule = contextRules.find(r => 
        r.signalName === signal.name && r.signalType === signal.type
      );

      if (rule) {
        adjustment += rule.adjustment;
      }
    }

    return adjustment;
  }

  /**
   * Get context-aware rules for specific anti-bot systems
   * 
   * These rules encode domain knowledge about which signals
   * are particularly strong indicators for specific systems.
   */
  private getContextRules(systemType: AntiBotSystemType): Array<{
    signalType: string;
    signalName: string;
    adjustment: number;
  }> {
    const rules: Record<AntiBotSystemType, Array<{
      signalType: string;
      signalName: string;
      adjustment: number;
    }>> = {
      [AntiBotSystemType.CLOUDFLARE]: [
        { signalType: 'dom-element', signalName: 'challenge-form', adjustment: 0.05 },
        { signalType: 'dom-element', signalName: 'turnstile-widget', adjustment: 0.05 },
        { signalType: 'header', signalName: 'cf-ray', adjustment: 0.03 },
      ],
      [AntiBotSystemType.DATADOME]: [
        { signalType: 'script', signalName: 'datadome-js', adjustment: 0.05 },
        { signalType: 'dom-element', signalName: 'datadome-captcha', adjustment: 0.05 },
      ],
      [AntiBotSystemType.AKAMAI]: [
        { signalType: 'script', signalName: 'akamai-sensor', adjustment: 0.05 },
        { signalType: 'script', signalName: 'akamai-bot-manager', adjustment: 0.05 },
        { signalType: 'cookie', signalName: 'akamai-cookies', adjustment: 0.03 },
      ],
      [AntiBotSystemType.IMPERVA]: [
        { signalType: 'script', signalName: 'imperva-script', adjustment: 0.05 },
        { signalType: 'cookie', signalName: 'imperva-cookies', adjustment: 0.03 },
      ],
      [AntiBotSystemType.RECAPTCHA]: [
        { signalType: 'dom-element', signalName: 'recaptcha-widget', adjustment: 0.05 },
        { signalType: 'script', signalName: 'recaptcha-api', adjustment: 0.05 },
      ],
      [AntiBotSystemType.HCAPTCHA]: [
        { signalType: 'dom-element', signalName: 'hcaptcha-widget', adjustment: 0.05 },
        { signalType: 'script', signalName: 'hcaptcha-api', adjustment: 0.05 },
      ],
      [AntiBotSystemType.UNKNOWN]: [],
    };

    return rules[systemType] || [];
  }

  /**
   * Count signals by strength
   */
  private countSignalsByStrength(signals: DetectionSignal[]): {
    strong: number;
    moderate: number;
    weak: number;
  } {
    return {
      strong: signals.filter(s => s.strength === SignalStrength.STRONG).length,
      moderate: signals.filter(s => s.strength === SignalStrength.MODERATE).length,
      weak: signals.filter(s => s.strength === SignalStrength.WEAK).length,
    };
  }

  /**
   * Extract unique signal types from signals
   */
  private extractSignalTypes(signals: DetectionSignal[]): string[] {
    const types = new Set(signals.map(s => s.type));
    return Array.from(types);
  }

  /**
   * Create an empty score breakdown
   */
  private createEmptyBreakdown(): ConfidenceScoreBreakdown {
    return {
      score: 0,
      baseScore: 0,
      strongSignalsBonus: 0,
      diversityBonus: 0,
      signalCounts: {
        total: 0,
        strong: 0,
        moderate: 0,
        weak: 0,
      },
      signalTypes: [],
      meetsThreshold: false,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ConfidenceScoringConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConfidenceScoringConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
