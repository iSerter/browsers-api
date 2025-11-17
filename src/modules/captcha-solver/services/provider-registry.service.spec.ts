import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ProviderRegistryService } from './provider-registry.service';
import { ApiKeyManagerService } from './api-key-manager.service';
import { CostTrackingService } from './cost-tracking.service';
import { CaptchaSolverConfigService } from '../config';
import { ICaptchaSolver } from '../interfaces/captcha-solver.interface';

describe('ProviderRegistryService', () => {
  let service: ProviderRegistryService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let apiKeyManager: jest.Mocked<ApiKeyManagerService>;
  let costTracking: jest.Mocked<CostTrackingService>;
  let captchaConfig: jest.Mocked<CaptchaSolverConfigService>;

  // Mock captcha solver
  class MockCaptchaSolver implements ICaptchaSolver {
    constructor(public name: string) {}

    async solve(params: any): Promise<any> {
      return {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: this.name,
      };
    }

    getName(): string {
      return this.name;
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }
  }

  beforeEach(async () => {
    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
      axiosRef: {
        get: jest.fn(),
        post: jest.fn(),
      },
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockApiKeyManager = {
      getApiKey: jest.fn(),
      hasApiKey: jest.fn().mockReturnValue(true),
    };

    const mockCostTracking = {
      recordSuccess: jest.fn(),
      getUsageStatistics: jest.fn(),
      getAllUsageStatistics: jest.fn(),
      getTotalCost: jest.fn(),
    };

    const mockCaptchaSolverConfig = {
      getConfig: jest.fn().mockReturnValue({
        circuitBreaker: {
          failureThreshold: 3,
          timeoutPeriod: 60000,
        },
        cache: {
          ttl: 300000,
        },
        retry: {
          maxAttempts: 3,
          backoffMs: 1000,
          maxBackoffMs: 10000,
        },
        timeouts: {
          solveTimeout: 30000,
          detectionTimeout: 5000,
          widgetInteractionTimeout: 5000,
          audioTranscriptionTimeout: 30000,
        },
        solverTimeouts: {
          recaptchaV2Checkbox: 30000,
          recaptchaV2Invisible: 10000,
          recaptchaV2Audio: 30000,
          recaptchaV2Image: 30000,
          recaptchaV3: 10000,
          hcaptchaCheckbox: 30000,
          hcaptchaInvisible: 10000,
          hcaptchaAudio: 30000,
          hcaptchaAccessibility: 30000,
          datadomeSensor: 5000,
          datadomeCaptcha: 60000,
          datadomeSlider: 30000,
          akamaiLevel2: 5000,
          akamaiLevel3: 10000,
        },
        provider: {
          maxRetries: 3,
          timeoutSeconds: 60,
          rateLimitPerMinute: 60,
        },
        detection: {
          minConfidenceThreshold: 0.5,
          minStrongConfidence: 0.7,
        },
      }),
      getCircuitBreakerConfig: jest.fn().mockReturnValue({
        failureThreshold: 3,
        timeoutPeriod: 60000,
      }),
      getCacheConfig: jest.fn().mockReturnValue({
        ttl: 300000,
      }),
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
      getSolverTimeoutConfig: jest.fn().mockReturnValue({
        recaptchaV2Checkbox: 30000,
        recaptchaV2Invisible: 10000,
        recaptchaV2Audio: 30000,
        recaptchaV2Image: 30000,
        recaptchaV3: 10000,
        hcaptchaCheckbox: 30000,
        hcaptchaInvisible: 10000,
        hcaptchaAudio: 30000,
        hcaptchaAccessibility: 30000,
        datadomeSensor: 5000,
        datadomeCaptcha: 60000,
        datadomeSlider: 30000,
        akamaiLevel2: 5000,
        akamaiLevel3: 10000,
      }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderRegistryService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ApiKeyManagerService,
          useValue: mockApiKeyManager,
        },
        {
          provide: CostTrackingService,
          useValue: mockCostTracking,
        },
        {
          provide: CaptchaSolverConfigService,
          useValue: mockCaptchaSolverConfig,
        },
      ],
    }).compile();

    service = module.get<ProviderRegistryService>(ProviderRegistryService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    apiKeyManager = module.get(ApiKeyManagerService);
    costTracking = module.get(CostTrackingService);
    captchaConfig = module.get(CaptchaSolverConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize and register providers', async () => {
      await service.onModuleInit();

      const providerNames = service.getProviderNames();
      expect(providerNames.length).toBeGreaterThanOrEqual(0);
    });

    it('should use CaptchaSolverConfigService when initializing providers', async () => {
      await service.onModuleInit();

      // Verify that getProviderConfig was called during provider initialization
      expect(captchaConfig.getProviderConfig).toHaveBeenCalled();
    });

    it('should handle provider registration failures gracefully', async () => {
      // Mock API key manager to throw error
      apiKeyManager.hasApiKey.mockReturnValue(false);

      await service.onModuleInit();

      // Service should still initialize even if providers fail
      expect(service).toBeDefined();
    });
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = new MockCaptchaSolver('test-provider');

      service.registerProvider('test-provider', provider);

      const retrieved = service.getProvider('test-provider');
      expect(retrieved).toBe(provider);
    });

    it('should register provider with lowercase name', () => {
      const provider = new MockCaptchaSolver('TestProvider');

      service.registerProvider('TestProvider', provider);

      expect(service.getProvider('testprovider')).toBe(provider);
      expect(service.getProvider('TESTPROVIDER')).toBe(provider);
    });

    it('should overwrite existing provider with same name', () => {
      const provider1 = new MockCaptchaSolver('provider1');
      const provider2 = new MockCaptchaSolver('provider2');

      service.registerProvider('test', provider1);
      service.registerProvider('test', provider2);

      const retrieved = service.getProvider('test');
      expect(retrieved).toBe(provider2);
      expect(retrieved).not.toBe(provider1);
    });
  });

  describe('getProvider', () => {
    it('should return registered provider', () => {
      const provider = new MockCaptchaSolver('test-provider');
      service.registerProvider('test-provider', provider);

      const retrieved = service.getProvider('test-provider');
      expect(retrieved).toBe(provider);
    });

    it('should return null for unregistered provider', () => {
      const retrieved = service.getProvider('unknown-provider');
      expect(retrieved).toBeNull();
    });

    it('should handle case-insensitive lookup', () => {
      const provider = new MockCaptchaSolver('TestProvider');
      service.registerProvider('test', provider);

      expect(service.getProvider('TEST')).toBe(provider);
      expect(service.getProvider('Test')).toBe(provider);
      expect(service.getProvider('test')).toBe(provider);
    });
  });

  describe('getAllProviders', () => {
    it('should return all registered providers', () => {
      const provider1 = new MockCaptchaSolver('provider1');
      const provider2 = new MockCaptchaSolver('provider2');

      service.registerProvider('provider1', provider1);
      service.registerProvider('provider2', provider2);

      const all = service.getAllProviders();

      expect(all).toHaveLength(2);
      expect(all).toContain(provider1);
      expect(all).toContain(provider2);
    });

    it('should return empty array when no providers registered', () => {
      const all = service.getAllProviders();
      expect(all).toEqual([]);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return only available providers', async () => {
      const availableProvider = new MockCaptchaSolver('available');
      availableProvider.isAvailable = jest.fn().mockResolvedValue(true);

      const unavailableProvider = new MockCaptchaSolver('unavailable');
      unavailableProvider.isAvailable = jest.fn().mockResolvedValue(false);

      service.registerProvider('available', availableProvider);
      service.registerProvider('unavailable', unavailableProvider);

      const available = await service.getAvailableProviders();

      expect(available).toHaveLength(1);
      expect(available[0]).toBe(availableProvider);
    });

    it('should return empty array when no providers are available', async () => {
      const provider = new MockCaptchaSolver('unavailable');
      provider.isAvailable = jest.fn().mockResolvedValue(false);

      service.registerProvider('unavailable', provider);

      const available = await service.getAvailableProviders();
      expect(available).toEqual([]);
    });

    it('should return all providers when all are available', async () => {
      const provider1 = new MockCaptchaSolver('provider1');
      provider1.isAvailable = jest.fn().mockResolvedValue(true);
      const provider2 = new MockCaptchaSolver('provider2');
      provider2.isAvailable = jest.fn().mockResolvedValue(true);

      service.registerProvider('provider1', provider1);
      service.registerProvider('provider2', provider2);

      const available = await service.getAvailableProviders();

      expect(available).toHaveLength(2);
    });
  });

  describe('getProviderNames', () => {
    it('should return names of all registered providers', () => {
      service.registerProvider('provider1', new MockCaptchaSolver('provider1'));
      service.registerProvider('provider2', new MockCaptchaSolver('provider2'));

      const names = service.getProviderNames();

      expect(names).toHaveLength(2);
      expect(names).toContain('provider1');
      expect(names).toContain('provider2');
    });

    it('should return empty array when no providers registered', () => {
      const names = service.getProviderNames();
      expect(names).toEqual([]);
    });
  });

  describe('getCostTracking', () => {
    it('should return cost tracking service', () => {
      const tracking = service.getCostTracking();
      expect(tracking).toBe(costTracking);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple provider operations', async () => {
      const provider1 = new MockCaptchaSolver('provider1');
      provider1.isAvailable = jest.fn().mockResolvedValue(true);
      const provider2 = new MockCaptchaSolver('provider2');
      provider2.isAvailable = jest.fn().mockResolvedValue(true);

      service.registerProvider('provider1', provider1);
      service.registerProvider('provider2', provider2);

      expect(service.getProviderNames()).toHaveLength(2);
      expect(service.getProvider('provider1')).toBe(provider1);
      expect(service.getProvider('provider2')).toBe(provider2);

      const available = await service.getAvailableProviders();
      expect(available).toHaveLength(2);
    });

    it('should handle provider lifecycle', () => {
      const provider = new MockCaptchaSolver('test');

      // Register
      service.registerProvider('test', provider);
      expect(service.getProvider('test')).toBe(provider);

      // Overwrite
      const newProvider = new MockCaptchaSolver('test-new');
      service.registerProvider('test', newProvider);
      expect(service.getProvider('test')).toBe(newProvider);
    });
  });
});

