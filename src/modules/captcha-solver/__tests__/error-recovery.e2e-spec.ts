import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';
import { ApiKeyManagerService } from '../services/api-key-manager.service';
import { ApiKeyValidationService } from '../services/api-key-validation.service';
import {
  SolverCircuitBreakerService,
  CircuitState,
} from '../services/solver-circuit-breaker.service';
import { SolverFactory } from '../factories/solver-factory.service';
import { SolverRegistry } from '../factories/solver-registry.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { CaptchaSolverConfigService } from '../config';
import { CaptchaMetricsService } from '../metrics/captcha-metrics.service';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { ApiKeyHealthStatus } from '../interfaces/captcha-config.interface';
import {
  SolverUnavailableException,
  ProviderException,
  ValidationException,
} from '../exceptions';

describe('Error Recovery Integration (e2e)', () => {
  let circuitBreaker: SolverCircuitBreakerService;
  let solverFactory: SolverFactory;
  let solverRegistry: SolverRegistry;
  let apiKeyManager: ApiKeyManagerService;
  let performanceTracker: SolverPerformanceTracker;

  const mockApiKeyRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const envMap: Record<string, any> = {
        '2CAPTCHA_API_KEY': 'key-alpha,key-beta',
        ANTICAPTCHA_API_KEY: 'ac-key-1',
      };
      return envMap[key] ?? undefined;
    }),
  };

  const mockApiKeyValidationService = {
    validateApiKey: jest.fn().mockResolvedValue({
      isValid: true,
      validatedAt: new Date(),
    }),
  };

  const mockCaptchaSolverConfigService = {
    getCircuitBreakerConfig: jest.fn().mockReturnValue({
      failureThreshold: 3,
      timeoutPeriod: 100, // Short timeout for testing
    }),
    getCacheConfig: jest.fn().mockReturnValue({ ttl: 300000 }),
    getRetryConfig: jest.fn().mockReturnValue({
      maxAttempts: 3,
      backoffMs: 10,
      maxBackoffMs: 100,
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
    getConfig: jest.fn().mockReturnValue({
      circuitBreaker: { failureThreshold: 3, timeoutPeriod: 100 },
      cache: { ttl: 300000 },
      retry: { maxAttempts: 3, backoffMs: 10, maxBackoffMs: 100 },
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
  };

  const mockCaptchaMetrics = {
    recordSolveSuccess: jest.fn(),
    recordSolveFailure: jest.fn(),
    incrementActiveSolves: jest.fn(),
    decrementActiveSolves: jest.fn(),
    recordCircuitBreakerTrip: jest.fn(),
    setProviderAvailable: jest.fn(),
  };

  // Solver classes for tests
  class FailingSolver implements ICaptchaSolver {
    private name: string;
    constructor(name?: string) {
      this.name = name || 'failing-solver';
    }
    async solve(): Promise<CaptchaSolution> {
      throw new Error(`${this.name} failed`);
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
        token: `recovered-token-${this.name}`,
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
        SolverCircuitBreakerService,
        SolverRegistry,
        ApiKeyManagerService,
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
          provide: getRepositoryToken(CaptchaSolverApiKey),
          useValue: mockApiKeyRepository,
        },
        {
          provide: ApiKeyValidationService,
          useValue: mockApiKeyValidationService,
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

    circuitBreaker = module.get<SolverCircuitBreakerService>(
      SolverCircuitBreakerService,
    );
    solverFactory = module.get<SolverFactory>(SolverFactory);
    solverRegistry = module.get<SolverRegistry>(SolverRegistry);
    apiKeyManager = module.get<ApiKeyManagerService>(ApiKeyManagerService);
    performanceTracker = module.get<SolverPerformanceTracker>(
      SolverPerformanceTracker,
    );
  });

  describe('circuit breaker: open after N failures', () => {
    it('should open circuit after 3 consecutive failures', () => {
      const solverType = 'test-solver';

      expect(circuitBreaker.isAvailable(solverType)).toBe(true);

      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);
      expect(circuitBreaker.isAvailable(solverType)).toBe(true);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.CLOSED);

      circuitBreaker.recordFailure(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isAvailable(solverType)).toBe(false);
    });

    it('should mark solver unavailable in SolverFactory after circuit opens', async () => {
      solverRegistry.register('fragile-solver', FailingSolver, {
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

      for (let i = 0; i < 3; i++) {
        try {
          await solverFactory.solveWithFallback(params);
        } catch {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState('fragile-solver')).toBe(
        CircuitState.OPEN,
      );

      await expect(solverFactory.solveWithFallback(params)).rejects.toThrow(
        SolverUnavailableException,
      );
    });
  });

  describe('circuit breaker recovery (half-open state)', () => {
    it('should transition OPEN -> HALF_OPEN after timeout', () => {
      const solverType = 'recovering-solver';

      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.OPEN);

      const state = circuitBreaker['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 10;
      }

      expect(circuitBreaker.isAvailable(solverType)).toBe(true);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit on success in HALF_OPEN state', () => {
      const solverType = 'half-open-solver';

      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);

      const state = circuitBreaker['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 10;
      }

      circuitBreaker.isAvailable(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      circuitBreaker.recordSuccess(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.CLOSED);

      const details = circuitBreaker.getStateDetails(solverType);
      expect(details?.consecutiveFailures).toBe(0);
    });

    it('should reopen circuit on failure in HALF_OPEN state', () => {
      const solverType = 'unstable-solver';

      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);
      circuitBreaker.recordFailure(solverType);

      const state = circuitBreaker['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 10;
      }
      circuitBreaker.isAvailable(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      circuitBreaker.recordFailure(solverType);
      expect(circuitBreaker.getState(solverType)).toBe(CircuitState.OPEN);
    });

    it('should allow solver to recover end-to-end', async () => {
      let callCount = 0;
      class RecoveringSolver implements ICaptchaSolver {
        constructor(public name?: string) {
          this.name = name || 'recovering';
        }
        async solve(): Promise<CaptchaSolution> {
          callCount++;
          if (callCount <= 3) {
            throw new Error('Still broken');
          }
          return {
            token: 'recovered-token',
            solvedAt: new Date(),
            solverId: 'recovering',
          };
        }
        getName() {
          return 'recovering';
        }
        async isAvailable() {
          return true;
        }
      }

      solverRegistry.register('recovering', RecoveringSolver, {
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

      for (let i = 0; i < 3; i++) {
        try {
          await solverFactory.solveWithFallback(params);
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState('recovering')).toBe(CircuitState.OPEN);

      const state = circuitBreaker['solverStates'].get('recovering');
      if (state) {
        state.nextAttemptTime = Date.now() - 10;
      }

      const solution = await solverFactory.solveWithFallback(params);
      expect(solution.token).toBe('recovered-token');
      expect(circuitBreaker.getState('recovering')).toBe(CircuitState.CLOSED);
    });
  });

  describe('API key rotation on failure', () => {
    beforeEach(async () => {
      await apiKeyManager.onModuleInit();
    });

    it('should rotate API keys in round-robin fashion', () => {
      const key1 = apiKeyManager.getApiKey('2captcha');
      const key2 = apiKeyManager.getApiKey('2captcha');

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(new Set([key1, key2]).size).toBe(2);
    });

    it('should mark key as unhealthy after 3 consecutive failures', async () => {
      const key = apiKeyManager.getApiKey('2captcha');
      expect(key).toBeDefined();

      mockApiKeyRepository.findOne.mockResolvedValue(null);

      await apiKeyManager.recordFailure('2captcha', key!, 'Error 1');
      await apiKeyManager.recordFailure('2captcha', key!, 'Error 2');
      await apiKeyManager.recordFailure('2captcha', key!, 'Error 3');

      const metadata = apiKeyManager.getApiKeyMetadata('2captcha');
      const keyMeta = metadata.find((m) => m.key === key);
      expect(keyMeta?.healthStatus).toBe(ApiKeyHealthStatus.UNHEALTHY);
      expect(keyMeta?.consecutiveFailures).toBe(3);
    });

    it('should prefer healthy keys over unhealthy ones', async () => {
      const key1 = apiKeyManager.getApiKey('2captcha');
      const key2 = apiKeyManager.getApiKey('2captcha');

      mockApiKeyRepository.findOne.mockResolvedValue(null);
      await apiKeyManager.recordFailure('2captcha', key1!, 'Error');
      await apiKeyManager.recordFailure('2captcha', key1!, 'Error');
      await apiKeyManager.recordFailure('2captcha', key1!, 'Error');

      const nextKey = apiKeyManager.getApiKey('2captcha');
      expect(nextKey).toBe(key2);
    });

    it('should reset consecutive failures on success', async () => {
      const key = apiKeyManager.getApiKey('2captcha');

      mockApiKeyRepository.findOne.mockResolvedValue(null);
      await apiKeyManager.recordFailure('2captcha', key!, 'Error');
      await apiKeyManager.recordFailure('2captcha', key!, 'Error');

      await apiKeyManager.recordSuccess('2captcha', key!);

      const metadata = apiKeyManager.getApiKeyMetadata('2captcha');
      const keyMeta = metadata.find((m) => m.key === key);
      expect(keyMeta?.consecutiveFailures).toBe(0);
      expect(keyMeta?.healthStatus).toBe(ApiKeyHealthStatus.HEALTHY);
    });
  });

  describe('exception types are correctly thrown', () => {
    it('should throw SolverUnavailableException when no solvers exist', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      try {
        await solverFactory.solveWithFallback(params);
        fail('Expected SolverUnavailableException');
      } catch (error) {
        expect(error).toBeInstanceOf(SolverUnavailableException);
        const solvErr = error as SolverUnavailableException;
        expect(solvErr.solverType).toBe('native');
        expect(solvErr.reason).toBe('no_solvers_enabled');
      }
    });

    it('should throw SolverUnavailableException when all solvers circuit-broken', async () => {
      solverRegistry.register('broken-solver', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.8,
        isEnabled: true,
        priority: 100,
      });

      circuitBreaker.recordFailure('broken-solver');
      circuitBreaker.recordFailure('broken-solver');
      circuitBreaker.recordFailure('broken-solver');

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      try {
        await solverFactory.solveWithFallback(params);
        fail('Expected SolverUnavailableException');
      } catch (error) {
        expect(error).toBeInstanceOf(SolverUnavailableException);
        const solvErr = error as SolverUnavailableException;
        expect(solvErr.reason).toContain('circuit_broken');
      }
    });

    it('should handle ProviderException in parallel solvers', async () => {
      class ProviderFailSolver implements ICaptchaSolver {
        constructor(public name?: string) {
          this.name = name || 'prov-fail';
        }
        async solve(): Promise<CaptchaSolution> {
          throw new ProviderException(
            '2captcha API error',
            '2captcha',
            { status: 503 },
            { retryable: true },
          );
        }
        getName() {
          return 'prov-fail';
        }
        async isAvailable() {
          return true;
        }
      }

      solverRegistry.register('prov-fail', ProviderFailSolver, {
        supportedChallengeTypes: ['hcaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
      });

      const params: CaptchaParams = {
        type: 'hcaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      await expect(
        solverFactory.solveInParallel(params, ['prov-fail']),
      ).rejects.toThrow();

      const details = circuitBreaker.getStateDetails('prov-fail');
      expect(details?.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should record metrics on circuit breaker trip', async () => {
      solverRegistry.register('trip-solver', FailingSolver, {
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
      });

      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-key',
      };

      // Fail enough times to trigger circuit breaker trip
      for (let i = 0; i < 3; i++) {
        try {
          await solverFactory.solveWithFallback(params);
        } catch {
          // Expected
        }
      }

      expect(mockCaptchaMetrics.recordCircuitBreakerTrip).toHaveBeenCalledWith(
        'trip-solver',
      );
    });
  });
});
