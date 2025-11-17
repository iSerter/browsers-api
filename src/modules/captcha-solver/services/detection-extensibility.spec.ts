import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DetectionService } from './detection.service';
import { DetectionRegistryService } from './detection-registry.service';
import { ConfidenceScoringService } from './confidence-scoring.service';
import { CaptchaLoggingService } from './captcha-logging.service';
import { DetectionCacheService } from './detection-cache.service';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service';
import {
  IDetectionStrategy,
} from './detection-strategy.interface';
import {
  AntiBotSystemType,
  AntiBotDetectionResult,
  DetectionContext,
  DetectionSignal,
  SignalStrength,
} from '../interfaces';
import { Page } from 'playwright';

/**
 * Mock detection strategy for testing extensibility
 * Simulates a new anti-bot system called "TestBot"
 */
class MockTestBotStrategy implements IDetectionStrategy {
  readonly systemType = 'testbot' as AntiBotSystemType;

  getName(): string {
    return 'testbot-detection-strategy';
  }

  async detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    // Mock detection logic
    const testBotData = await page.evaluate(() => {
      const testBotElement = document.querySelector('#testbot-challenge');
      return {
        hasTestBotElement: !!testBotElement,
        scripts: [] as string[],
      };
    });

    if (testBotData.hasTestBotElement) {
      signals.push({
        type: 'dom-element',
        name: 'testbot-challenge',
        strength: SignalStrength.STRONG,
      });
    }

    // Check for testbot cookies
    const testBotCookies =
      context.cookies?.filter((c) => c.name.includes('testbot')) || [];
    if (testBotCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'testbot-cookies',
        strength: SignalStrength.MODERATE,
        context: { count: testBotCookies.length },
      });
    }

    const detected = signals.length > 0;
    return {
      detected,
      type: detected ? (this.systemType as AntiBotSystemType) : null,
      confidence: detected ? 0.85 : 0,
      details: { signals },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }
}

describe('DetectionService Extensibility', () => {
  let service: DetectionService;
  let registry: DetectionRegistryService;
  let mockPage: any;
  let mockContext: any;

  const mockWinstonLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    getLogger: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        CAPTCHA_LOG_RETENTION: 1000,
        CAPTCHA_ALERT_CONSECUTIVE_FAILURES: 5,
        CAPTCHA_ALERT_TIME_WINDOW_MS: 60000,
        CAPTCHA_ALERT_FAILURE_COUNT: 10,
        CAPTCHA_ALERT_COOLDOWN_MS: 300000,
        CAPTCHA_CACHE_TTL: 300000,
        NODE_ENV: 'test',
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockCaptchaLogging = {
    logDetection: jest.fn(),
    logSolving: jest.fn(),
    logError: jest.fn(),
  };

  const mockDetectionCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    generateContentHash: jest.fn().mockReturnValue('test-hash'),
    invalidate: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0 }),
    resetStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionService,
        DetectionRegistryService,
        {
          provide: ConfidenceScoringService,
          useFactory: () => new ConfidenceScoringService(),
        },
        {
          provide: CaptchaLoggingService,
          useValue: mockCaptchaLogging,
        },
        {
          provide: DetectionCacheService,
          useValue: mockDetectionCache,
        },
        {
          provide: WinstonLoggerService,
          useValue: mockWinstonLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DetectionService>(DetectionService);
    registry = module.get<DetectionRegistryService>(DetectionRegistryService);

    // Create mock Playwright context
    mockContext = {
      cookies: jest.fn().mockResolvedValue([]),
    };

    // Create mock Playwright page
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page'),
      evaluate: jest.fn(),
      content: jest.fn().mockResolvedValue('<html></html>'),
      context: jest.fn().mockReturnValue(mockContext),
    };

    // Reset mocks
    jest.clearAllMocks();
    mockDetectionCache.get.mockResolvedValue(null);
    mockDetectionCache.set.mockResolvedValue(undefined);
  });

  describe('Custom Strategy Registration', () => {
    it('should allow registering a custom detection strategy', () => {
      const customStrategy = new MockTestBotStrategy();
      
      service.registerStrategy(customStrategy);

      expect(registry.has('testbot' as AntiBotSystemType)).toBe(true);
      expect(registry.get('testbot' as AntiBotSystemType)).toBe(customStrategy);
    });

    it('should use custom strategy when detecting', async () => {
      const customStrategy = new MockTestBotStrategy();
      service.registerStrategy(customStrategy);

      mockPage.evaluate.mockResolvedValue({
        hasTestBotElement: true,
      });

      const result = await service.detectAll(mockPage, {
        targetSystems: ['testbot' as AntiBotSystemType],
      });

      expect(result.detections.length).toBeGreaterThan(0);
      expect(result.primary?.type).toBe('testbot');
      expect(result.primary?.detected).toBe(true);
    });

    it('should allow overriding built-in strategies', () => {
      // Create a custom Cloudflare strategy
      const customCloudflareStrategy: IDetectionStrategy = {
        systemType: AntiBotSystemType.CLOUDFLARE,
        getName: () => 'custom-cloudflare',
        detect: async () => ({
          detected: true,
          type: AntiBotSystemType.CLOUDFLARE,
          confidence: 1.0,
          details: { signals: [] },
          detectedAt: new Date(),
          durationMs: 0,
        }),
      };

      // Register should succeed (overwrites built-in)
      expect(() => {
        service.registerStrategy(customCloudflareStrategy);
      }).not.toThrow();

      expect(registry.get(AntiBotSystemType.CLOUDFLARE)).toBe(
        customCloudflareStrategy,
      );
    });
  });

  describe('Registry Service', () => {
    it('should register and retrieve strategies', () => {
      const strategy = new MockTestBotStrategy();
      registry.register(strategy);

      expect(registry.has('testbot' as AntiBotSystemType)).toBe(true);
      expect(registry.get('testbot' as AntiBotSystemType)).toBe(strategy);
    });

    it('should get all registered system types', () => {
      const strategy = new MockTestBotStrategy();
      registry.register(strategy);

      const types = registry.getRegisteredTypes();
      expect(types).toContain('testbot' as AntiBotSystemType);
    });

    it('should get all registered strategies', () => {
      const strategy = new MockTestBotStrategy();
      registry.register(strategy);

      const strategies = registry.getAll();
      expect(strategies).toContain(strategy);
    });

    it('should unregister strategies', () => {
      const strategy = new MockTestBotStrategy();
      registry.register(strategy);

      expect(registry.unregister('testbot' as AntiBotSystemType)).toBe(true);
      expect(registry.has('testbot' as AntiBotSystemType)).toBe(false);
    });

    it('should clear all strategies', () => {
      const strategy = new MockTestBotStrategy();
      registry.register(strategy);

      registry.clear();
      expect(registry.getCount()).toBe(0);
    });
  });

  describe('Integration with DetectionService', () => {
    it('should detect using custom strategy', async () => {
      const customStrategy = new MockTestBotStrategy();
      service.registerStrategy(customStrategy);

      mockPage.evaluate.mockResolvedValue({
        hasTestBotElement: true,
      });

      mockContext.cookies.mockResolvedValue([
        { name: 'testbot-session', value: 'abc123', domain: '.example.com' },
      ]);

      const result = await service.detectAll(mockPage, {
        targetSystems: ['testbot' as AntiBotSystemType],
      });

      expect(result.detections.length).toBe(1);
      expect(result.primary?.type).toBe('testbot');
      expect(result.primary?.detected).toBe(true);
      expect(result.primary?.confidence).toBeGreaterThan(0);
    });

    it('should work with multiple custom strategies', async () => {
      const strategy1 = new MockTestBotStrategy();
      const strategy2: IDetectionStrategy = {
        systemType: 'anotherbot' as AntiBotSystemType,
        getName: () => 'anotherbot-strategy',
        detect: async () => ({
          detected: true,
          type: 'anotherbot' as AntiBotSystemType,
          confidence: 0.9,
          details: { signals: [] },
          detectedAt: new Date(),
          durationMs: 0,
        }),
      };

      service.registerStrategy(strategy1);
      service.registerStrategy(strategy2);

      expect(registry.getCount()).toBeGreaterThanOrEqual(2);
    });

    it('should fallback to built-in methods if strategy not registered', async () => {
      // Don't register a strategy for Cloudflare
      // Should use built-in method
      mockPage.evaluate.mockResolvedValue({
        hasChallengeForm: false,
        hasTurnstile: false,
        scripts: [],
      });

      const result = await service.detectAll(mockPage, {
        targetSystems: [AntiBotSystemType.CLOUDFLARE],
      });

      // Should still work using built-in method
      expect(result.detections).toBeDefined();
    });
  });

  describe('Strategy Interface Compliance', () => {
    it('should require systemType property', () => {
      const strategy: IDetectionStrategy = {
        systemType: 'testbot' as AntiBotSystemType,
        getName: () => 'test',
        detect: async () => ({
          detected: false,
          type: null,
          confidence: 0,
          details: { signals: [] },
          detectedAt: new Date(),
          durationMs: 0,
        }),
      };

      expect(strategy.systemType).toBeDefined();
    });

    it('should require detect method', () => {
      const strategy: IDetectionStrategy = {
        systemType: 'testbot' as AntiBotSystemType,
        getName: () => 'test',
        detect: async () => ({
          detected: false,
          type: null,
          confidence: 0,
          details: { signals: [] },
          detectedAt: new Date(),
          durationMs: 0,
        }),
      };

      expect(typeof strategy.detect).toBe('function');
    });

    it('should require getName method', () => {
      const strategy: IDetectionStrategy = {
        systemType: 'testbot' as AntiBotSystemType,
        getName: () => 'test',
        detect: async () => ({
          detected: false,
          type: null,
          confidence: 0,
          details: { signals: [] },
          detectedAt: new Date(),
          durationMs: 0,
        }),
      };

      expect(typeof strategy.getName).toBe('function');
      expect(strategy.getName()).toBe('test');
    });
  });
});

