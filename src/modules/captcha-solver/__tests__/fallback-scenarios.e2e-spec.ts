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
import {
  SolverUnavailableException,
  ValidationException,
  ProviderException,
} from '../exceptions';

describe('Fallback Scenarios Integration (e2e)', () => {
  let captchaSolverService: CaptchaSolverService;
  let solverFactory: SolverFactory;
  let solverRegistry: SolverRegistry;
  let providerRegistry: ProviderRegistryService;

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
    get: jest.fn().mockImplementation((key: string) => {
      const envMap: Record<string, any> = {
        '2CAPTCHA_API_KEY': 'test-key-1',
        ANTICAPTCHA_API_KEY: 'test-key-2',
        CAPTCHA_SOLVER_PREFERRED_PROVIDER: '2captcha',
        CAPTCHA_SOLVER_TIMEOUT_SECONDS: 60,
        CAPTCHA_SOLVER_MAX_RETRIES: 3,
        CAPTCHA_SOLVER_ENABLE_AUTO_RETRY: true,
        CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE: 0.7,
      };
      return envMap[key] ?? undefined;
    }),
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

  // Helper solver classes
  class FailingSolver implements ICaptchaSolver {
    private name: string;
    constructor(name?: string) {
      this.name = name || 'failing-solver';
    }
    async solve(): Promise<CaptchaSolution> {
      throw new Error(`${this.name} failed to solve`);
    }
    getName() {
      return this.name;
    }
    async isAvailable() {
      return true;
    }
  }

  class WorkingSolver implements ICaptchaSolver {
    private name: string;
    constructor(name?: string) {
      this.name = name || 'working-solver';
    }
    async solve(params: CaptchaParams): Promise<CaptchaSolution> {
      return {
        token: `token-from-${this.name}`,
        solvedAt: new Date(),
        solverId: this.name,
      };
    }
    getName() {
      return this.name;
    }
    async isAvailable() {
      return true;
    }
  }

  class SlowSolver implements ICaptchaSolver {
    private name: string;
    constructor(name?: string) {
      this.name = name || 'slow-solver';
    }
    async solve(params: CaptchaParams): Promise<CaptchaSolution> {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        token: `slow-token-from-${this.name}`,
        solvedAt: new Date(),
        solverId: this.name,
      };
    }
    getName() {
      return this.name;
    }
    async isAvailable() {
      return true;
    }
  }

  beforeEach(async () => {
    jest.clearAllMocks();

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
    providerRegistry =
      module.get<ProviderRegistryService>(ProviderRegistryService);
  });

  describe('provider fallback chain', () => {
    it('should try next provider when preferred provider fails', async () => {
      await captchaSolverService.onModuleInit();

      const failingProvider: ICaptchaSolver = {
        solve: jest.fn().mockRejectedValue(new Error('2captcha down')),
        getName: () => '2captcha',
        isAvailable: jest.fn().mockResolvedValue(true),
      };
      const workingProvider: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue({
          token: 'anticaptcha-token',
          solvedAt: new Date(),
          solverId: 'anticaptcha-task',
        }),
        getName: () => 'anticaptcha',
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      providerRegistry.registerProvider('2captcha', failingProvider);
      providerRegistry.registerProvider('anticaptcha', workingProvider);

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      const solution = await captchaSolverService.solveWithFallback(params);

      expect(failingProvider.solve).toHaveBeenCalled();
      expect(workingProvider.solve).toHaveBeenCalled();
      expect(solution.token).toBe('anticaptcha-token');
    });

    it('should throw ProviderException when all providers fail', async () => {
      await captchaSolverService.onModuleInit();

      const failingProvider1: ICaptchaSolver = {
        solve: jest
          .fn()
          .mockRejectedValue(
            new ProviderException('2captcha error', '2captcha'),
          ),
        getName: () => '2captcha',
        isAvailable: jest.fn().mockResolvedValue(true),
      };
      const failingProvider2: ICaptchaSolver = {
        solve: jest
          .fn()
          .mockRejectedValue(
            new ProviderException('anticaptcha error', 'anticaptcha'),
          ),
        getName: () => 'anticaptcha',
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      providerRegistry.registerProvider('2captcha', failingProvider1);
      providerRegistry.registerProvider('anticaptcha', failingProvider2);

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      await expect(
        captchaSolverService.solveWithFallback(params),
      ).rejects.toThrow(ProviderException);
    });

    it('should throw SolverUnavailableException when no providers available', async () => {
      await captchaSolverService.onModuleInit();

      const unavailableProvider: ICaptchaSolver = {
        solve: jest.fn(),
        getName: () => 'unavailable',
        isAvailable: jest.fn().mockResolvedValue(false),
      };
      // Clear existing providers and add only an unavailable one
      providerRegistry['providers'] = new Map();
      providerRegistry.registerProvider('unavailable', unavailableProvider);

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      await expect(
        captchaSolverService.solveWithFallback(params),
      ).rejects.toThrow(SolverUnavailableException);
    });
  });

  describe('fallback disabled per challenge type', () => {
    it('should throw ValidationException when fallback disabled for type', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'CAPTCHA_SOLVER_FALLBACK_DATADOME') return false;
        if (key === '2CAPTCHA_API_KEY') return 'test-key';
        if (key === 'CAPTCHA_SOLVER_PREFERRED_PROVIDER') return '2captcha';
        return undefined;
      });
      mockConfigRepository.find.mockResolvedValue([
        { key: 'fallback_enabled_datadome', value: 'false' },
      ]);

      await captchaSolverService.onModuleInit();

      const params: CaptchaParams = {
        type: 'datadome',
        url: 'https://example.com',
      };

      await expect(
        captchaSolverService.solveWithFallback(params),
      ).rejects.toThrow(ValidationException);
    });

    it('should allow fallback for enabled challenge types', async () => {
      await captchaSolverService.onModuleInit();

      expect(captchaSolverService.isFallbackEnabled('recaptcha')).toBe(true);
      expect(captchaSolverService.isFallbackEnabled('hcaptcha')).toBe(true);
    });
  });

  describe('SolverFactory solveWithFallback', () => {
    const params: CaptchaParams = {
      type: 'recaptcha',
      url: 'https://example.com',
      sitekey: 'test-key',
    };

    it('should fall back to second solver when first fails', async () => {
      solverRegistry.register('failing-solver', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.8,
        isEnabled: true,
        priority: 100,
      });

      solverRegistry.register('working-solver', WorkingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.8,
        isEnabled: true,
        priority: 90,
      });

      const solution = await solverFactory.solveWithFallback(params);

      expect(solution.solverId).toBe('working-solver');
      expect(solution.token).toContain('token-from-');
    });

    it('should throw when all registered solvers fail', async () => {
      solverRegistry.register('fail-1', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
      });

      solverRegistry.register('fail-2', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 90,
      });

      await expect(solverFactory.solveWithFallback(params)).rejects.toThrow();
    });

    it('should throw when no solvers are registered', async () => {
      await expect(solverFactory.solveWithFallback(params)).rejects.toThrow(
        SolverUnavailableException,
      );
    });
  });

  describe('parallel solver attempts (solveInParallel)', () => {
    const params: CaptchaParams = {
      type: 'recaptcha',
      url: 'https://example.com',
      sitekey: 'test-key',
    };

    it('should return first successful result from parallel execution', async () => {
      solverRegistry.register('slow-solver', SlowSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 10000,
        successRate: 0.8,
        isEnabled: true,
        priority: 90,
      });

      solverRegistry.register('fast-solver', WorkingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 100,
        successRate: 0.9,
        isEnabled: true,
        priority: 100,
      });

      const solution = await solverFactory.solveInParallel(params, [
        'slow-solver',
        'fast-solver',
      ]);

      expect(solution).toBeDefined();
      expect(solution.token).toBeDefined();
    });

    it('should throw when all parallel solvers fail', async () => {
      solverRegistry.register('fail-a', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
      });

      solverRegistry.register('fail-b', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 90,
      });

      await expect(
        solverFactory.solveInParallel(params, ['fail-a', 'fail-b']),
      ).rejects.toThrow(SolverUnavailableException);
    });

    it('should throw when no solver types are provided', async () => {
      await expect(
        solverFactory.solveInParallel(params, []),
      ).rejects.toThrow(SolverUnavailableException);
    });

    it('should succeed even if one parallel solver fails', async () => {
      solverRegistry.register('fail-solver', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
      });

      solverRegistry.register('ok-solver', WorkingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.9,
        isEnabled: true,
        priority: 90,
      });

      const solution = await solverFactory.solveInParallel(params, [
        'fail-solver',
        'ok-solver',
      ]);

      // WorkingSolver defaults to 'working-solver' when no name arg is passed
      expect(solution.solverId).toBe('working-solver');
    });
  });
});
