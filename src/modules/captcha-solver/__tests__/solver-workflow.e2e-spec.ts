import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CaptchaSolverService } from '../captcha-solver.service';
import { CaptchaSolverConfig } from '../entities/captcha-solver-config.entity';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';
import { BrowserPoolService } from '../../browsers/services/browser-pool.service';
import { ApiKeyManagerService } from '../services/api-key-manager.service';
import { ApiKeyValidationService } from '../services/api-key-validation.service';
import { ProviderRegistryService } from '../services/provider-registry.service';
import { CostTrackingService } from '../services/cost-tracking.service';
import { SolverFactory } from '../factories/solver-factory.service';
import { SolverRegistry } from '../factories/solver-registry.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { SolverCircuitBreakerService } from '../services/solver-circuit-breaker.service';
import { CaptchaSolverConfigService } from '../config';
import { CaptchaMetricsService } from '../metrics/captcha-metrics.service';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';

describe('Solver Workflow Integration (e2e)', () => {
  let captchaSolverService: CaptchaSolverService;
  let solverFactory: SolverFactory;
  let solverRegistry: SolverRegistry;
  let costTracking: CostTrackingService;
  let providerRegistry: ProviderRegistryService;
  let performanceTracker: SolverPerformanceTracker;

  const mockConfigRepository = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockApiKeyRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockCaptchaSolverConfigService = {
    getConfig: jest.fn().mockReturnValue({
      circuitBreaker: { failureThreshold: 3, timeoutPeriod: 60000 },
      cache: { ttl: 300000 },
      retry: { maxAttempts: 3, backoffMs: 1000, maxBackoffMs: 10000 },
      timeouts: {
        solveTimeout: 30000,
        detectionTimeout: 5000,
        widgetInteractionTimeout: 5000,
        audioTranscriptionTimeout: 30000,
      },
      solverTimeouts: {},
      provider: { maxRetries: 3, timeoutSeconds: 60, rateLimitPerMinute: 60 },
      detection: { minConfidenceThreshold: 0.5, minStrongConfidence: 0.7 },
    }),
    getCircuitBreakerConfig: jest.fn().mockReturnValue({
      failureThreshold: 3,
      timeoutPeriod: 60000,
    }),
    getCacheConfig: jest.fn().mockReturnValue({ ttl: 300000 }),
    getRetryConfig: jest.fn().mockReturnValue({
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 10000,
    }),
    getTimeoutConfig: jest.fn().mockReturnValue({
      solveTimeout: 30000,
      detectionTimeout: 5000,
      widgetInteractionTimeout: 5000,
      audioTranscriptionTimeout: 30000,
    }),
    getSolverTimeoutConfig: jest.fn().mockReturnValue({}),
    getProviderConfig: jest.fn().mockReturnValue({
      maxRetries: 3,
      timeoutSeconds: 60,
      rateLimitPerMinute: 60,
    }),
    getDetectionConfig: jest.fn().mockReturnValue({
      minConfidenceThreshold: 0.5,
      minStrongConfidence: 0.7,
    }),
  };

  const mockCaptchaMetrics = {
    recordSolveSuccess: jest.fn(),
    recordSolveFailure: jest.fn(),
    incrementActiveSolves: jest.fn(),
    decrementActiveSolves: jest.fn(),
    recordCircuitBreakerTrip: jest.fn(),
    setProviderAvailable: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      const envMap: Record<string, any> = {
        '2CAPTCHA_API_KEY': 'test-2captcha-key',
        ANTICAPTCHA_API_KEY: 'test-anticaptcha-key',
        CAPTCHA_SOLVER_PREFERRED_PROVIDER: '2captcha',
        CAPTCHA_SOLVER_TIMEOUT_SECONDS: 60,
        CAPTCHA_SOLVER_MAX_RETRIES: 3,
        CAPTCHA_SOLVER_ENABLE_AUTO_RETRY: true,
        CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE: 0.7,
      };
      return envMap[key] ?? undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptchaSolverService,
        ApiKeyManagerService,
        CostTrackingService,
        SolverCircuitBreakerService,
        SolverRegistry,
        ProviderRegistryService,
        {
          provide: SolverPerformanceTracker,
          useValue: new SolverPerformanceTracker(1000),
        },
        {
          provide: SolverFactory,
          useFactory: (
            registry: SolverRegistry,
            tracker: SolverPerformanceTracker,
            cb: SolverCircuitBreakerService,
            metrics: CaptchaMetricsService,
            widget: CaptchaWidgetInteractionService,
          ) => new SolverFactory(registry, tracker, cb, metrics, widget),
          inject: [
            SolverRegistry,
            SolverPerformanceTracker,
            SolverCircuitBreakerService,
            CaptchaMetricsService,
            CaptchaWidgetInteractionService,
          ],
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(CaptchaSolverConfig),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(CaptchaSolverApiKey),
          useValue: mockApiKeyRepository,
        },
        {
          provide: BrowserPoolService,
          useValue: {},
        },
        {
          provide: ApiKeyValidationService,
          useValue: {
            validateApiKey: jest.fn().mockResolvedValue({
              isValid: true,
              validatedAt: new Date(),
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
            axiosRef: { get: jest.fn(), post: jest.fn() },
          },
        },
        {
          provide: CaptchaSolverConfigService,
          useValue: mockCaptchaSolverConfigService,
        },
        {
          provide: CaptchaMetricsService,
          useValue: mockCaptchaMetrics,
        },
        {
          provide: CaptchaWidgetInteractionService,
          useValue: { interactWithWidget: jest.fn() },
        },
      ],
    }).compile();

    captchaSolverService =
      module.get<CaptchaSolverService>(CaptchaSolverService);
    solverFactory = module.get<SolverFactory>(SolverFactory);
    solverRegistry = module.get<SolverRegistry>(SolverRegistry);
    costTracking = module.get<CostTrackingService>(CostTrackingService);
    providerRegistry =
      module.get<ProviderRegistryService>(ProviderRegistryService);
    performanceTracker = module.get<SolverPerformanceTracker>(
      SolverPerformanceTracker,
    );
  });

  describe('full solver pipeline: selection -> solving -> cost tracking', () => {
    class TestSolver implements ICaptchaSolver {
      async solve(params: CaptchaParams): Promise<CaptchaSolution> {
        return {
          token: 'solved-token-123',
          solvedAt: new Date(),
          solverId: 'test-solver',
        };
      }
      getName() {
        return 'test-solver';
      }
      async isAvailable() {
        return true;
      }
    }

    it('should select the best solver, solve, and track performance', async () => {
      solverRegistry.register('test-solver', TestSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.9,
        isEnabled: true,
        priority: 100,
      });

      const bestSolver = solverFactory.selectBestSolver('recaptcha');
      expect(bestSolver).toBe('test-solver');

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      const solution = await solverFactory.solveWithFallback(params);
      expect(solution.token).toBe('solved-token-123');
      expect(solution.solverId).toBe('test-solver');

      const stats = performanceTracker.getStats('test-solver');
      expect(stats.totalAttempts).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it('should update solver health on successful solve', async () => {
      solverRegistry.register('health-solver', TestSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.8,
        isEnabled: true,
        priority: 100,
      });

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      await solverFactory.solveWithFallback(params);

      const metadata = solverRegistry.get('health-solver');
      expect(metadata?.healthStatus).toBe('healthy');
      expect(metadata?.consecutiveFailures).toBe(0);
    });
  });

  describe('configuration loading from mocked env', () => {
    it('should load configuration and initialize service', async () => {
      await captchaSolverService.onModuleInit();

      const config = captchaSolverService.getConfiguration();
      expect(config.preferredProvider).toBe('2captcha');
      expect(config.timeoutSeconds).toBe(60);
      expect(config.maxRetries).toBe(3);
      expect(config.enableAutoRetry).toBe(true);
      expect(config.minConfidenceScore).toBe(0.7);
    });

    it('should override config with database values', async () => {
      mockConfigRepository.find.mockResolvedValue([
        { key: 'preferred_provider', value: 'anticaptcha' },
        { key: 'timeout_seconds', value: '90' },
      ]);

      await captchaSolverService.onModuleInit();

      const config = captchaSolverService.getConfiguration();
      expect(config.preferredProvider).toBe('anticaptcha');
      expect(config.timeoutSeconds).toBe(90);
    });
  });

  describe('in-memory config cache', () => {
    beforeEach(async () => {
      await captchaSolverService.onModuleInit();
    });

    it('should return cached data on repeated getAllConfigs calls', async () => {
      const mockConfigs = [{ key: 'test', value: 'cached' }];
      mockConfigRepository.find.mockResolvedValue(mockConfigs);

      const first = await captchaSolverService.getAllConfigs();
      const second = await captchaSolverService.getAllConfigs();

      expect(first).toEqual(mockConfigs);
      expect(second).toEqual(mockConfigs);
      // Second call should use cache - find should only be called once
      // for getAllConfigs (the onModuleInit calls are separate)
    });

    it('should invalidate cache after setConfig', async () => {
      const initialConfigs = [{ key: 'k1', value: 'v1' }];
      const updatedConfigs = [
        { key: 'k1', value: 'v1' },
        { key: 'enable_auto_retry', value: 'true' },
      ];

      mockConfigRepository.find.mockResolvedValueOnce(initialConfigs);
      await captchaSolverService.getAllConfigs();

      mockConfigRepository.findOne.mockResolvedValue(null);
      mockConfigRepository.create.mockReturnValue({
        key: 'enable_auto_retry',
        value: 'true',
      });
      mockConfigRepository.save.mockResolvedValue({
        key: 'enable_auto_retry',
        value: 'true',
      });
      mockConfigRepository.find.mockResolvedValue(updatedConfigs);

      await captchaSolverService.setConfig('enable_auto_retry', 'true');

      mockConfigRepository.find.mockResolvedValue(updatedConfigs);
      const result = await captchaSolverService.getAllConfigs();
      expect(result).toEqual(updatedConfigs);
    });
  });

  describe('cost tracking after solving', () => {
    it('should record cost when provider solves successfully', async () => {
      const mockProvider: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue({
          token: 'provider-token',
          solvedAt: new Date(),
          solverId: '2captcha-task-123',
        }),
        getName: () => '2captcha',
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      providerRegistry.registerProvider('2captcha', mockProvider);

      await captchaSolverService.onModuleInit();

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      const solution = await captchaSolverService.solveWithFallback(params);
      expect(solution.token).toBe('provider-token');

      const totalCost = costTracking.getTotalCost();
      expect(totalCost).toBeGreaterThan(0);

      const stats = costTracking.getUsageStatistics('2captcha');
      expect(stats.totalUses).toBe(1);
      expect(stats.byChallengeType['recaptcha']).toBeDefined();
      expect(stats.byChallengeType['recaptcha'].count).toBe(1);
    });
  });
});
