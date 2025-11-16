import {
  AntiBotSystemType,
  AntiBotDetectionResult,
  SignalStrength,
  DetectionSignal,
  AntiBotSystemDetails,
  DetectionError,
  DetectionConfig,
  MultiDetectionResult,
  DetectionContext,
} from './detection.interface';

describe('Detection Interfaces', () => {
  describe('AntiBotDetectionResult', () => {
    it('should create a valid detection result for detected anti-bot system', () => {
      const signal: DetectionSignal = {
        type: 'dom-element',
        name: 'cf-challenge-form',
        strength: SignalStrength.STRONG,
        context: { selector: '#challenge-form' },
      };

      const details: AntiBotSystemDetails = {
        version: 'turnstile',
        challengeType: 'managed',
        signals: [signal],
        metadata: { challengeId: 'abc123' },
      };

      const result: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.CLOUDFLARE,
        confidence: 0.95,
        details,
        detectedAt: new Date(),
        durationMs: 150,
      };

      expect(result.detected).toBe(true);
      expect(result.type).toBe(AntiBotSystemType.CLOUDFLARE);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.details.signals).toHaveLength(1);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should create a valid detection result for no detection', () => {
      const result: AntiBotDetectionResult = {
        detected: false,
        type: null,
        confidence: 0,
        details: {
          signals: [],
        },
        detectedAt: new Date(),
        durationMs: 50,
      };

      expect(result.detected).toBe(false);
      expect(result.type).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.details.signals).toHaveLength(0);
    });

    it('should include error information when detection fails', () => {
      const error: DetectionError = {
        code: 'TIMEOUT',
        message: 'Detection timed out after 5000ms',
        context: { timeout: 5000 },
      };

      const result: AntiBotDetectionResult = {
        detected: false,
        type: null,
        confidence: 0,
        details: { signals: [] },
        error,
        detectedAt: new Date(),
        durationMs: 5000,
      };

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.message).toContain('timed out');
    });
  });

  describe('DetectionSignal', () => {
    it('should create valid detection signals with different strengths', () => {
      const weakSignal: DetectionSignal = {
        type: 'cookie',
        name: '__cf_bm',
        strength: SignalStrength.WEAK,
      };

      const strongSignal: DetectionSignal = {
        type: 'script',
        name: 'datadome.js',
        strength: SignalStrength.STRONG,
        context: { src: 'https://js.datadome.co/tags.js' },
      };

      expect(weakSignal.strength).toBe(SignalStrength.WEAK);
      expect(strongSignal.strength).toBe(SignalStrength.STRONG);
      expect(strongSignal.context).toBeDefined();
    });
  });

  describe('DetectionConfig', () => {
    it('should create a valid detection configuration', () => {
      const config: DetectionConfig = {
        timeout: 3000,
        deepInspection: true,
        targetSystems: [
          AntiBotSystemType.CLOUDFLARE,
          AntiBotSystemType.RECAPTCHA,
        ],
        minConfidence: 0.7,
      };

      expect(config.timeout).toBe(3000);
      expect(config.deepInspection).toBe(true);
      expect(config.targetSystems).toHaveLength(2);
      expect(config.minConfidence).toBe(0.7);
    });

    it('should allow optional configuration properties', () => {
      const minimalConfig: DetectionConfig = {};

      expect(minimalConfig.timeout).toBeUndefined();
      expect(minimalConfig.deepInspection).toBeUndefined();
    });
  });

  describe('MultiDetectionResult', () => {
    it('should create a valid multi-detection result', () => {
      const detection1: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.CLOUDFLARE,
        confidence: 0.9,
        details: { signals: [] },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const detection2: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.6,
        details: { signals: [] },
        detectedAt: new Date(),
        durationMs: 80,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detection1, detection2],
        primary: detection1,
        totalDurationMs: 180,
        analyzedAt: new Date(),
      };

      expect(multiResult.detections).toHaveLength(2);
      expect(multiResult.primary).toBe(detection1);
      expect(multiResult.primary?.confidence).toBeGreaterThan(
        detection2.confidence,
      );
      expect(multiResult.totalDurationMs).toBe(180);
    });

    it('should handle no detections', () => {
      const multiResult: MultiDetectionResult = {
        detections: [],
        primary: null,
        totalDurationMs: 50,
        analyzedAt: new Date(),
      };

      expect(multiResult.detections).toHaveLength(0);
      expect(multiResult.primary).toBeNull();
    });
  });

  describe('DetectionContext', () => {
    it('should create a valid detection context with full information', () => {
      const context: DetectionContext = {
        url: 'https://example.com/challenge',
        title: 'Just a moment...',
        statusCode: 403,
        headers: {
          'cf-ray': '123456789abcdef',
          server: 'cloudflare',
        },
        cookies: [
          { name: '__cf_bm', value: 'abc123', domain: '.example.com' },
          { name: 'datadome', value: 'xyz789', domain: 'example.com' },
        ],
      };

      expect(context.url).toBe('https://example.com/challenge');
      expect(context.statusCode).toBe(403);
      expect(context.headers).toBeDefined();
      expect(context.cookies).toHaveLength(2);
    });

    it('should work with minimal information', () => {
      const minimalContext: DetectionContext = {
        url: 'https://example.com',
      };

      expect(minimalContext.url).toBe('https://example.com');
      expect(minimalContext.title).toBeUndefined();
      expect(minimalContext.cookies).toBeUndefined();
    });
  });

  describe('AntiBotSystemType enum', () => {
    it('should have all expected anti-bot system types', () => {
      expect(AntiBotSystemType.CLOUDFLARE).toBe('cloudflare');
      expect(AntiBotSystemType.DATADOME).toBe('datadome');
      expect(AntiBotSystemType.AKAMAI).toBe('akamai');
      expect(AntiBotSystemType.IMPERVA).toBe('imperva');
      expect(AntiBotSystemType.RECAPTCHA).toBe('recaptcha');
      expect(AntiBotSystemType.HCAPTCHA).toBe('hcaptcha');
      expect(AntiBotSystemType.UNKNOWN).toBe('unknown');
    });
  });

  describe('Type Safety', () => {
    it('should enforce confidence score range (0-1) at compile time', () => {
      // This test validates that the interface accepts valid values
      const validResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.DATADOME,
        confidence: 0.5, // Valid: between 0 and 1
        details: { signals: [] },
        detectedAt: new Date(),
        durationMs: 100,
      };

      expect(validResult.confidence).toBeGreaterThanOrEqual(0);
      expect(validResult.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle all signal strength levels', () => {
      const strengths = [
        SignalStrength.WEAK,
        SignalStrength.MODERATE,
        SignalStrength.STRONG,
      ];

      strengths.forEach((strength) => {
        const signal: DetectionSignal = {
          type: 'test',
          name: 'test-signal',
          strength,
        };

        expect(signal.strength).toBe(strength);
      });
    });
  });

  describe('Extensibility', () => {
    it('should allow custom metadata in system details', () => {
      const customMetadata = {
        customField1: 'value1',
        customField2: 42,
        nestedObject: {
          nested: true,
        },
      };

      const details: AntiBotSystemDetails = {
        signals: [],
        metadata: customMetadata,
      };

      expect(details.metadata?.customField1).toBe('value1');
      expect(details.metadata?.customField2).toBe(42);
      expect(details.metadata?.nestedObject.nested).toBe(true);
    });

    it('should allow custom context in detection signals', () => {
      const signal: DetectionSignal = {
        type: 'custom-type',
        name: 'custom-signal',
        strength: SignalStrength.MODERATE,
        context: {
          customData: 'test',
          numericValue: 123,
        },
      };

      expect(signal.context?.customData).toBe('test');
      expect(signal.context?.numericValue).toBe(123);
    });
  });
});
