import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { CaptchaSolverService } from './captcha-solver.service';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { BrowserPoolService } from '../browsers/services/browser-pool.service';
import { ApiKeyManagerService } from './services/api-key-manager.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { CostTrackingService } from './services/cost-tracking.service';

describe('CaptchaSolverService', () => {
  let service: CaptchaSolverService;
  let configService: ConfigService;
  let configRepository: Repository<CaptchaSolverConfig>;
  let apiKeyManager: ApiKeyManagerService;

  const mockConfigRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockBrowserPoolService = {
    // Add mock methods as needed
  };

  const mockApiKeyManager = {
    getApiKey: jest.fn(),
    isProviderAvailable: jest.fn(),
    getAvailableProviders: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };

  const mockProviderRegistry = {
    getProvider: jest.fn(),
    getAllProviders: jest.fn().mockReturnValue([]),
    isProviderAvailable: jest.fn(),
    registerProvider: jest.fn(),
  };

  const mockCostTracking = {
    recordCost: jest.fn(),
    getTotalCost: jest.fn().mockReturnValue(0),
    getCostByProvider: jest.fn().mockReturnValue(0),
    getUsageStatistics: jest.fn().mockReturnValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptchaSolverService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(CaptchaSolverConfig),
          useValue: mockConfigRepository,
        },
        {
          provide: BrowserPoolService,
          useValue: mockBrowserPoolService,
        },
        {
          provide: ApiKeyManagerService,
          useValue: mockApiKeyManager,
        },
        {
          provide: ProviderRegistryService,
          useValue: mockProviderRegistry,
        },
        {
          provide: CostTrackingService,
          useValue: mockCostTracking,
        },
      ],
    }).compile();

    service = module.get<CaptchaSolverService>(CaptchaSolverService);
    configService = module.get<ConfigService>(ConfigService);
    configRepository = module.get<Repository<CaptchaSolverConfig>>(
      getRepositoryToken(CaptchaSolverConfig),
    );
    apiKeyManager = module.get<ApiKeyManagerService>(ApiKeyManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load configuration and validate on startup', async () => {
      // Arrange
      mockConfigService.get
        .mockReturnValueOnce('2captcha') // CAPTCHA_SOLVER_PREFERRED_PROVIDER
        .mockReturnValueOnce(60) // CAPTCHA_SOLVER_TIMEOUT_SECONDS
        .mockReturnValueOnce(3) // CAPTCHA_SOLVER_MAX_RETRIES
        .mockReturnValueOnce(true) // CAPTCHA_SOLVER_ENABLE_AUTO_RETRY
        .mockReturnValueOnce(0.7); // CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE
      mockConfigRepository.find.mockResolvedValue([]);
      mockApiKeyManager.getAvailableProviders.mockReturnValue(['2captcha']);

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'CAPTCHA_SOLVER_PREFERRED_PROVIDER',
      );
      expect(mockConfigRepository.find).toHaveBeenCalled();
    });

    it('should throw error in production when no providers available', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mockConfigService.get.mockReturnValue(undefined);
      mockConfigRepository.find.mockResolvedValue([]);
      mockApiKeyManager.getAvailableProviders.mockReturnValue([]);

      // Act & Assert
      await expect(service.onModuleInit()).rejects.toThrow(
        'No captcha solver providers are available',
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('should log error but not throw in development when no providers', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      mockConfigService.get.mockReturnValue(undefined);
      mockConfigRepository.find.mockResolvedValue([]);
      mockApiKeyManager.getAvailableProviders.mockReturnValue([]);

      // Act
      await service.onModuleInit();

      // Assert - should not throw
      expect(service).toBeDefined();

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('getApiKey', () => {
    it('should delegate to ApiKeyManagerService', () => {
      // Arrange
      mockApiKeyManager.getApiKey.mockReturnValue('test-key');

      // Act
      const key = service.getApiKey('2captcha');

      // Assert
      expect(key).toBe('test-key');
      expect(mockApiKeyManager.getApiKey).toHaveBeenCalledWith('2captcha');
    });

    it('should return null when ApiKeyManager returns null', () => {
      // Arrange
      mockApiKeyManager.getApiKey.mockReturnValue(null);

      // Act
      const key = service.getApiKey('nonexistent');

      // Assert
      expect(key).toBeNull();
    });
  });

  describe('recordApiKeySuccess', () => {
    it('should delegate to ApiKeyManagerService', async () => {
      // Arrange
      mockApiKeyManager.recordSuccess.mockResolvedValue(undefined);

      // Act
      await service.recordApiKeySuccess('2captcha', 'test-key');

      // Assert
      expect(mockApiKeyManager.recordSuccess).toHaveBeenCalledWith(
        '2captcha',
        'test-key',
      );
    });
  });

  describe('recordApiKeyFailure', () => {
    it('should delegate to ApiKeyManagerService', async () => {
      // Arrange
      mockApiKeyManager.recordFailure.mockResolvedValue(undefined);

      // Act
      await service.recordApiKeyFailure('2captcha', 'test-key', 'Error');

      // Assert
      expect(mockApiKeyManager.recordFailure).toHaveBeenCalledWith(
        '2captcha',
        'test-key',
        'Error',
      );
    });
  });

  describe('isProviderAvailable', () => {
    it('should delegate to ApiKeyManagerService', () => {
      // Arrange
      mockApiKeyManager.isProviderAvailable.mockReturnValue(true);

      // Act
      const result = service.isProviderAvailable('2captcha');

      // Assert
      expect(result).toBe(true);
      expect(mockApiKeyManager.isProviderAvailable).toHaveBeenCalledWith(
        '2captcha',
      );
    });
  });

  describe('getAvailableProviders', () => {
    it('should delegate to ApiKeyManagerService', () => {
      // Arrange
      mockApiKeyManager.getAvailableProviders.mockReturnValue([
        '2captcha',
        'anticaptcha',
      ]);

      // Act
      const providers = service.getAvailableProviders();

      // Assert
      expect(providers).toEqual(['2captcha', 'anticaptcha']);
      expect(mockApiKeyManager.getAvailableProviders).toHaveBeenCalled();
    });
  });

  describe('getConfiguration', () => {
    beforeEach(async () => {
      mockConfigService.get
        .mockReturnValueOnce('2captcha')
        .mockReturnValueOnce(60)
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(0.7);
      mockConfigRepository.find.mockResolvedValue([]);
      mockApiKeyManager.getAvailableProviders.mockReturnValue(['2captcha']);
      await service.onModuleInit();
    });

    it('should return current configuration', () => {
      // Act
      const config = service.getConfiguration();

      // Assert
      expect(config.preferredProvider).toBe('2captcha');
      expect(config.timeoutSeconds).toBe(60);
      expect(config.maxRetries).toBe(3);
      expect(config.enableAutoRetry).toBe(true);
      expect(config.minConfidenceScore).toBe(0.7);
    });

    it('should return a copy of configuration', () => {
      // Act
      const config1 = service.getConfiguration();
      const config2 = service.getConfiguration();

      // Assert - should be different objects
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('config management', () => {
    beforeEach(async () => {
      mockConfigService.get
        .mockReturnValueOnce('2captcha')
        .mockReturnValueOnce(60)
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(0.7);
      mockConfigRepository.find.mockResolvedValue([]);
      mockApiKeyManager.getAvailableProviders.mockReturnValue(['2captcha']);
      await service.onModuleInit();
    });

    it('should get config by key', async () => {
      // Arrange
      const mockConfig = { key: 'test', value: 'value' };
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      // Act
      const result = await service.getConfig('test');

      // Assert
      expect(result).toEqual(mockConfig);
      expect(mockConfigRepository.findOne).toHaveBeenCalledWith({
        where: { key: 'test' },
      });
    });

    it('should get config value by key', async () => {
      // Arrange
      const mockConfig = { key: 'test', value: 'value' };
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      // Act
      const result = await service.getConfigValue('test');

      // Assert
      expect(result).toBe('value');
    });

    it('should return null when config not found', async () => {
      // Arrange
      mockConfigRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getConfigValue('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should create new config if not exists', async () => {
      // Arrange
      mockConfigRepository.findOne.mockResolvedValue(null);
      mockConfigRepository.create.mockReturnValue({ key: 'test', value: 'value' });
      mockConfigRepository.save.mockResolvedValue({ key: 'test', value: 'value' });
      mockConfigRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.setConfig('test', 'value');

      // Assert
      expect(result).toEqual({ key: 'test', value: 'value' });
      expect(mockConfigRepository.create).toHaveBeenCalledWith({
        key: 'test',
        value: 'value',
      });
    });

    it('should update existing config', async () => {
      // Arrange
      const existingConfig = {
        key: 'test',
        value: 'old',
        updatedAt: new Date(),
      };
      mockConfigRepository.findOne.mockResolvedValue(existingConfig);
      mockConfigRepository.save.mockResolvedValue({
        ...existingConfig,
        value: 'new',
      });
      mockConfigRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.setConfig('test', 'new');

      // Assert
      expect(result.value).toBe('new');
    });

    it('should validate preferred_provider value', async () => {
      // Act & Assert
      await expect(
        service.setConfig('preferred_provider', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate timeout_seconds value', async () => {
      // Act & Assert
      await expect(service.setConfig('timeout_seconds', '5')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.setConfig('timeout_seconds', '500')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate max_retries value', async () => {
      // Act & Assert
      await expect(service.setConfig('max_retries', '-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.setConfig('max_retries', '15')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate enable_auto_retry value', async () => {
      // Act & Assert
      await expect(service.setConfig('enable_auto_retry', 'yes')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate min_confidence_score value', async () => {
      // Act & Assert
      await expect(service.setConfig('min_confidence_score', '-0.1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.setConfig('min_confidence_score', '1.5')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reload configuration after setting config', async () => {
      // Arrange
      mockConfigRepository.findOne.mockResolvedValue(null);
      mockConfigRepository.create.mockReturnValue({
        key: 'preferred_provider',
        value: 'anticaptcha',
      });
      mockConfigRepository.save.mockResolvedValue({
        key: 'preferred_provider',
        value: 'anticaptcha',
      });
      mockConfigRepository.find.mockResolvedValue([
        { key: 'preferred_provider', value: 'anticaptcha' },
      ]);

      // Act
      await service.setConfig('preferred_provider', 'anticaptcha');

      // Assert
      const config = service.getConfiguration();
      expect(config.preferredProvider).toBe('anticaptcha');
    });

    it('should get all configs', async () => {
      // Arrange
      const mockConfigs = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ];
      mockConfigRepository.find.mockResolvedValue(mockConfigs);

      // Act
      const result = await service.getAllConfigs();

      // Assert
      expect(result).toEqual(mockConfigs);
    });
  });
});
