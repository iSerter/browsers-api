import { Test, TestingModule } from '@nestjs/testing';
import {
  ConfidenceScoringService,
  ConfidenceScoringConfig,
} from './confidence-scoring.service';
import {
  DetectionSignal,
  SignalStrength,
  AntiBotSystemType,
} from '../interfaces';

describe('ConfidenceScoringService', () => {
  let service: ConfidenceScoringService;

  beforeEach(() => {
    // ConfidenceScoringService doesn't require DI, instantiate directly
    service = new ConfidenceScoringService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateConfidence', () => {
    it('should return 0 for no signals', () => {
      const score = service.calculateConfidence([]);
      expect(score).toBe(0);
    });

    it('should calculate correct base score for single strong signal', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'test-element',
          strength: SignalStrength.STRONG,
        },
      ];

      const score = service.calculateConfidence(signals);
      expect(score).toBe(0.4); // Default strong weight
    });

    it('should calculate correct base score for single moderate signal', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'script',
          name: 'test-script',
          strength: SignalStrength.MODERATE,
        },
      ];

      const score = service.calculateConfidence(signals);
      expect(score).toBe(0.25); // Default moderate weight
    });

    it('should calculate correct base score for single weak signal', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'header',
          name: 'test-header',
          strength: SignalStrength.WEAK,
        },
      ];

      const score = service.calculateConfidence(signals);
      expect(score).toBe(0.1); // Default weak weight
    });

    it('should add signal weights for multiple signals', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.MODERATE,
        },
        {
          type: 'header',
          name: 'header1',
          strength: SignalStrength.WEAK,
        },
      ];

      const score = service.calculateConfidence(signals);
      // Base: 0.4 + 0.25 + 0.1 = 0.75
      // Diversity bonus for 3 types: 0.075
      expect(score).toBe(0.83); // 0.75 + 0.075 rounded
    });

    it('should cap confidence at 1.0', () => {
      // Create many strong signals to exceed 1.0
      const signals: DetectionSignal[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          type: 'dom-element',
          name: `element-${i}`,
          strength: SignalStrength.STRONG,
        }));

      const score = service.calculateConfidence(signals);
      expect(score).toBe(1.0);
    });
  });

  describe('calculateDetailedScore', () => {
    it('should return empty breakdown for no signals', () => {
      const breakdown = service.calculateDetailedScore([]);

      expect(breakdown.score).toBe(0);
      expect(breakdown.baseScore).toBe(0);
      expect(breakdown.strongSignalsBonus).toBe(0);
      expect(breakdown.diversityBonus).toBe(0);
      expect(breakdown.signalCounts.total).toBe(0);
      expect(breakdown.signalTypes).toEqual([]);
      expect(breakdown.meetsThreshold).toBe(false);
    });

    it('should provide detailed breakdown for single signal', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'test',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      expect(breakdown.score).toBe(0.4);
      expect(breakdown.baseScore).toBe(0.4);
      expect(breakdown.strongSignalsBonus).toBe(0);
      expect(breakdown.diversityBonus).toBe(0);
      expect(breakdown.signalCounts).toEqual({
        total: 1,
        strong: 1,
        moderate: 0,
        weak: 0,
      });
      expect(breakdown.signalTypes).toEqual(['dom-element']);
      expect(breakdown.meetsThreshold).toBe(true);
    });

    it('should calculate strong signals bonus for 2 strong signals', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'dom-element',
          name: 'element2',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.4 + 0.4 = 0.8
      // Strong bonus: 0.15 (for 2 strong signals)
      expect(breakdown.baseScore).toBe(0.8);
      expect(breakdown.strongSignalsBonus).toBe(0.15);
      expect(breakdown.score).toBe(0.95);
    });

    it('should calculate diminishing returns for 3+ strong signals', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'cookie',
          name: 'cookie1',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.4 * 3 = 1.2 (will be capped)
      // Strong bonus: 0.15 + (0.15 * 0.5) = 0.225 for 3 signals
      // Due to floating point precision, 0.15 + 0.075 = 0.224999... which rounds to 0.22
      expect(breakdown.strongSignalsBonus).toBe(0.22); // Rounded
      expect(breakdown.score).toBe(1.0); // Capped at max
    });

    it('should calculate diversity bonus for 2 signal types', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.MODERATE,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.MODERATE,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.25 * 2 = 0.5
      // Diversity bonus: 0.1 * 0.5 = 0.05 (for 2 types)
      expect(breakdown.baseScore).toBe(0.5);
      expect(breakdown.diversityBonus).toBe(0.05);
      expect(breakdown.score).toBe(0.55);
    });

    it('should calculate diversity bonus for 3 signal types', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'cookie',
          name: 'cookie1',
          strength: SignalStrength.WEAK,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.1 * 3 = 0.3
      // Diversity bonus: 0.1 * 0.75 = 0.075 (for 3 types)
      expect(breakdown.baseScore).toBe(0.3);
      expect(breakdown.diversityBonus).toBe(0.08); // Rounded
      expect(breakdown.score).toBe(0.38);
    });

    it('should calculate full diversity bonus for 4+ signal types', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'cookie',
          name: 'cookie1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'header',
          name: 'header1',
          strength: SignalStrength.WEAK,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.1 * 4 = 0.4
      // Diversity bonus: 0.1 (full, for 4 types)
      expect(breakdown.baseScore).toBe(0.4);
      expect(breakdown.diversityBonus).toBe(0.1);
      expect(breakdown.score).toBe(0.5);
    });

    it('should correctly count signals by strength', () => {
      const signals: DetectionSignal[] = [
        { type: 'dom-element', name: 'e1', strength: SignalStrength.STRONG },
        { type: 'dom-element', name: 'e2', strength: SignalStrength.STRONG },
        { type: 'script', name: 's1', strength: SignalStrength.MODERATE },
        { type: 'cookie', name: 'c1', strength: SignalStrength.WEAK },
        { type: 'header', name: 'h1', strength: SignalStrength.WEAK },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      expect(breakdown.signalCounts).toEqual({
        total: 5,
        strong: 2,
        moderate: 1,
        weak: 2,
      });
    });

    it('should meet threshold when score >= 0.3', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);
      expect(breakdown.score).toBe(0.4);
      expect(breakdown.meetsThreshold).toBe(true);
    });

    it('should not meet threshold when score < 0.3', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'header',
          name: 'header1',
          strength: SignalStrength.WEAK,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);
      expect(breakdown.score).toBe(0.1);
      expect(breakdown.meetsThreshold).toBe(false);
    });
  });

  describe('Context-aware scoring', () => {
    it('should apply context adjustment for Cloudflare challenge-form', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'challenge-form',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(
        signals,
        AntiBotSystemType.CLOUDFLARE,
      );

      // Base: 0.4, context adjustment: 0.05
      expect(breakdown.score).toBe(0.45);
    });

    it('should apply context adjustment for multiple Cloudflare signals', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'challenge-form',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'dom-element',
          name: 'turnstile-widget',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'header',
          name: 'cf-ray',
          strength: SignalStrength.MODERATE,
        },
      ];

      const breakdown = service.calculateDetailedScore(
        signals,
        AntiBotSystemType.CLOUDFLARE,
      );

      // Base: 0.4 + 0.4 + 0.25 = 1.05
      // Strong bonus: 0.15
      // Context adjustments: 0.05 + 0.05 + 0.03 = 0.13
      // Total would exceed 1.0, so capped
      expect(breakdown.score).toBe(1.0);
    });

    it('should apply context adjustment for DataDome', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'script',
          name: 'datadome-js',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(
        signals,
        AntiBotSystemType.DATADOME,
      );

      // Base: 0.4, context adjustment: 0.05
      expect(breakdown.score).toBe(0.45);
    });

    it('should apply context adjustment for reCAPTCHA', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'recaptcha-widget',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'script',
          name: 'recaptcha-api',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(
        signals,
        AntiBotSystemType.RECAPTCHA,
      );

      // Base: 0.8, strong bonus: 0.15, context: 0.05 + 0.05 = 0.1
      expect(breakdown.score).toBe(1.0); // Capped
    });

    it('should not apply context adjustment for unknown system type', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'challenge-form',
          strength: SignalStrength.STRONG,
        },
      ];

      const withoutContext = service.calculateDetailedScore(signals);
      const withContext = service.calculateDetailedScore(
        signals,
        AntiBotSystemType.UNKNOWN,
      );

      expect(withoutContext.score).toBe(withContext.score);
    });
  });

  describe('Configuration management', () => {
    it('should use custom configuration', () => {
      const customConfig: Partial<ConfidenceScoringConfig> = {
        signalWeights: {
          [SignalStrength.STRONG]: 0.5,
          [SignalStrength.MODERATE]: 0.3,
          [SignalStrength.WEAK]: 0.15,
        },
      };

      const customService = new ConfidenceScoringService(customConfig);

      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'test',
          strength: SignalStrength.STRONG,
        },
      ];

      const score = customService.calculateConfidence(signals);
      expect(score).toBe(0.5); // Custom strong weight
    });

    it('should get current configuration', () => {
      const config = service.getConfig();

      expect(config.signalWeights[SignalStrength.STRONG]).toBe(0.4);
      expect(config.signalWeights[SignalStrength.MODERATE]).toBe(0.25);
      expect(config.signalWeights[SignalStrength.WEAK]).toBe(0.1);
      expect(config.multipleStrongSignalsBonus).toBe(0.15);
      expect(config.diversityBonus).toBe(0.1);
      expect(config.maxConfidence).toBe(1.0);
      expect(config.minDetectionThreshold).toBe(0.3);
    });

    it('should update configuration', () => {
      service.updateConfig({
        minDetectionThreshold: 0.5,
      });

      const config = service.getConfig();
      expect(config.minDetectionThreshold).toBe(0.5);
    });
  });

  describe('Edge cases', () => {
    it('should handle signals with same type but different names', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'dom-element',
          name: 'element2',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'dom-element',
          name: 'element3',
          strength: SignalStrength.STRONG,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Should not get diversity bonus (all same type)
      expect(breakdown.diversityBonus).toBe(0);
      // But should get strong signals bonus
      expect(breakdown.strongSignalsBonus).toBeGreaterThan(0);
      expect(breakdown.signalTypes).toEqual(['dom-element']);
    });

    it('should handle mixed strength signals correctly', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.STRONG,
        },
        {
          type: 'cookie',
          name: 'cookie1',
          strength: SignalStrength.MODERATE,
        },
        {
          type: 'header',
          name: 'header1',
          strength: SignalStrength.WEAK,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.4 + 0.4 + 0.25 + 0.1 = 1.15
      // Strong bonus: 0.15
      // Diversity bonus: 0.1 (4 types)
      // Total: 1.4, capped at 1.0
      expect(breakdown.score).toBe(1.0);
      expect(breakdown.signalCounts).toEqual({
        total: 4,
        strong: 2,
        moderate: 1,
        weak: 1,
      });
    });

    it('should round scores to 2 decimal places', () => {
      const signals: DetectionSignal[] = [
        {
          type: 'dom-element',
          name: 'element1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'script',
          name: 'script1',
          strength: SignalStrength.WEAK,
        },
        {
          type: 'cookie',
          name: 'cookie1',
          strength: SignalStrength.WEAK,
        },
      ];

      const breakdown = service.calculateDetailedScore(signals);

      // Base: 0.3, diversity: 0.075
      // Should be rounded properly
      expect(breakdown.score).toBeCloseTo(0.38, 2);
    });
  });
});
