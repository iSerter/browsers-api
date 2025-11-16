import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyManagerService } from './api-key-manager.service';
import { ApiKeyValidationService } from './api-key-validation.service';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';
import { ApiKeyHealthStatus } from '../interfaces/captcha-config.interface';

describe('ApiKeyManagerService', () => {
  let service: ApiKeyManagerService;
  let configService: ConfigService;
  let apiKeyRepository: Repository<CaptchaSolverApiKey>;
  let validationService: ApiKeyValidationService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockApiKeyRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockValidationService = {
    validateApiKey: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyManagerService,
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
          useValue: mockValidationService,
        },
      ],
    }).compile();

    service = module.get<ApiKeyManagerService>(ApiKeyManagerService);
    configService = module.get<ConfigService>(ConfigService);
    apiKeyRepository = module.get<Repository<CaptchaSolverApiKey>>(
      getRepositoryToken(CaptchaSolverApiKey),
    );
    validationService = module.get<ApiKeyValidationService>(
      ApiKeyValidationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load API keys from environment variables', async () => {
      // Arrange
      mockConfigService.get
        .mockReturnValueOnce('env-key-1,env-key-2')
        .mockReturnValueOnce('anticaptcha-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockConfigService.get).toHaveBeenCalledWith('2CAPTCHA_API_KEY');
      expect(mockConfigService.get).toHaveBeenCalledWith('ANTICAPTCHA_API_KEY');
      expect(service.getAvailableProviders()).toContain('2captcha');
      expect(service.getAvailableProviders()).toContain('anticaptcha');
    });

    it('should load API keys from database', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(undefined);
      const dbKey: Partial<CaptchaSolverApiKey> = {
        id: 1,
        provider: '2captcha',
        apiKey: 'db-key-1',
        healthStatus: ApiKeyHealthStatus.HEALTHY,
        consecutiveFailures: 0,
        totalUses: 10,
        totalFailures: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockApiKeyRepository.find.mockResolvedValue([dbKey]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockApiKeyRepository.find).toHaveBeenCalled();
      expect(service.getAvailableProviders()).toContain('2captcha');
    });

    it('should validate all loaded API keys', async () => {
      // Arrange
      mockConfigService.get.mockReturnValueOnce('test-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });

      // Act
      await service.onModuleInit();

      // Assert
      expect(mockValidationService.validateApiKey).toHaveBeenCalledWith(
        '2captcha',
        'test-key',
      );
    });

    it('should handle validation failures', async () => {
      // Arrange
      mockConfigService.get.mockReturnValueOnce('invalid-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: false,
        error: 'Invalid API key',
        validatedAt: new Date(),
      });

      // Act
      await service.onModuleInit();

      // Assert
      const metadata = service.getApiKeyMetadata('2captcha');
      expect(metadata[0].healthStatus).toBe(ApiKeyHealthStatus.UNHEALTHY);
      expect(metadata[0].lastValidationError).toBe('Invalid API key');
    });
  });

  describe('getApiKey', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValueOnce('key1,key2');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });
      await service.onModuleInit();
    });

    it('should return API key for available provider', () => {
      // Act
      const key = service.getApiKey('2captcha');

      // Assert
      expect(key).toBe('key1');
    });

    it('should return null for unavailable provider', () => {
      // Act
      const key = service.getApiKey('nonexistent');

      // Assert
      expect(key).toBeNull();
    });

    it('should rotate keys in round-robin fashion', () => {
      // Act - get keys multiple times
      const key1 = service.getApiKey('2captcha');
      const key2 = service.getApiKey('2captcha');
      const key3 = service.getApiKey('2captcha');
      const key4 = service.getApiKey('2captcha');

      // Assert - should rotate through keys
      expect(key1).toBe('key1');
      expect(key2).toBe('key2');
      // After rotation, should cycle back
      expect([key1, key2]).toContain(key3);
      expect([key1, key2]).toContain(key4);
      // All keys should be used
      expect(new Set([key1, key2, key3, key4]).size).toBeGreaterThan(1);
    });

    it('should prioritize healthy keys over unhealthy', async () => {
      // Arrange - reset and setup with mixed health statuses
      mockConfigService.get.mockReset();
      mockApiKeyRepository.find.mockReset();
      
      const healthyKey: Partial<CaptchaSolverApiKey> = {
        id: 1,
        provider: '2captcha',
        apiKey: 'healthy-key',
        healthStatus: ApiKeyHealthStatus.HEALTHY,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const unhealthyKey: Partial<CaptchaSolverApiKey> = {
        id: 2,
        provider: '2captcha',
        apiKey: 'unhealthy-key',
        healthStatus: ApiKeyHealthStatus.UNHEALTHY,
        consecutiveFailures: 5,
        totalUses: 0,
        totalFailures: 5,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      mockConfigService.get.mockReturnValue(undefined);
      // Put unhealthy first to test sorting
      mockApiKeyRepository.find.mockResolvedValue([unhealthyKey, healthyKey]);
      mockValidationService.validateApiKey
        .mockResolvedValueOnce({
          isValid: false,
          error: 'Invalid',
          validatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          isValid: true,
          validatedAt: new Date(),
        });
      
      await service.onModuleInit();

      // Act
      const key = service.getApiKey('2captcha');

      // Assert - should prefer healthy key
      expect(key).toBe('healthy-key');
    });

    it('should track usage statistics', () => {
      // Act
      service.getApiKey('2captcha');
      service.getApiKey('2captcha');

      // Assert
      const metadata = service.getApiKeyMetadata('2captcha');
      expect(metadata[0].totalUses).toBeGreaterThan(0);
    });
  });

  describe('recordSuccess', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValueOnce('test-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });
      await service.onModuleInit();
    });

    it('should update key metadata on success', async () => {
      // Arrange
      const key = service.getApiKey('2captcha');
      mockApiKeyRepository.findOne.mockResolvedValue({
        id: 1,
        provider: '2captcha',
        apiKey: key,
        healthStatus: ApiKeyHealthStatus.HEALTHY,
      });
      mockApiKeyRepository.save.mockResolvedValue({} as CaptchaSolverApiKey);

      // Act
      await service.recordSuccess('2captcha', key!);

      // Assert
      const metadata = service.getApiKeyMetadata('2captcha');
      expect(metadata[0].lastSuccessfulUse).toBeDefined();
      expect(metadata[0].consecutiveFailures).toBe(0);
      expect(metadata[0].healthStatus).toBe(ApiKeyHealthStatus.HEALTHY);
    });
  });

  describe('recordFailure', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValueOnce('test-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });
      await service.onModuleInit();
    });

    it('should update key metadata on failure', async () => {
      // Arrange
      const key = service.getApiKey('2captcha');
      mockApiKeyRepository.findOne.mockResolvedValue({
        id: 1,
        provider: '2captcha',
        apiKey: key,
        healthStatus: ApiKeyHealthStatus.HEALTHY,
        consecutiveFailures: 0,
      });
      mockApiKeyRepository.save.mockResolvedValue({} as CaptchaSolverApiKey);

      // Act
      await service.recordFailure('2captcha', key!, 'Test error');

      // Assert
      const metadata = service.getApiKeyMetadata('2captcha');
      expect(metadata[0].lastFailure).toBeDefined();
      expect(metadata[0].consecutiveFailures).toBeGreaterThan(0);
      expect(metadata[0].lastValidationError).toBe('Test error');
    });

    it('should mark key as unhealthy after 3 consecutive failures', async () => {
      // Arrange
      const key = service.getApiKey('2captcha');
      const metadata = service.getApiKeyMetadata('2captcha');
      const keyMetadata = metadata.find((k) => k.key === key);
      
      // Set up initial state with 2 consecutive failures
      if (keyMetadata) {
        keyMetadata.consecutiveFailures = 2;
        keyMetadata.healthStatus = ApiKeyHealthStatus.UNKNOWN;
      }
      
      mockApiKeyRepository.findOne.mockResolvedValue({
        id: 1,
        provider: '2captcha',
        apiKey: key,
        healthStatus: ApiKeyHealthStatus.UNKNOWN,
        consecutiveFailures: 2,
      });
      mockApiKeyRepository.save.mockResolvedValue({} as CaptchaSolverApiKey);

      // Act - record 3rd failure
      await service.recordFailure('2captcha', key!, 'Error');

      // Assert
      const updatedMetadata = service.getApiKeyMetadata('2captcha');
      const updatedKeyMetadata = updatedMetadata.find((k) => k.key === key);
      expect(updatedKeyMetadata?.consecutiveFailures).toBe(3);
      expect(updatedKeyMetadata?.healthStatus).toBe(ApiKeyHealthStatus.UNHEALTHY);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true when provider has healthy keys', async () => {
      // Arrange
      mockConfigService.get.mockReturnValueOnce('test-key');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });
      await service.onModuleInit();

      // Act
      const available = service.isProviderAvailable('2captcha');

      // Assert
      expect(available).toBe(true);
    });

    it('should return false when provider has no keys', () => {
      // Act
      const available = service.isProviderAvailable('nonexistent');

      // Assert
      expect(available).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of providers with available keys', async () => {
      // Arrange
      mockConfigService.get
        .mockReturnValueOnce('key1')
        .mockReturnValueOnce('key2');
      mockApiKeyRepository.find.mockResolvedValue([]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: true,
        validatedAt: new Date(),
      });
      await service.onModuleInit();

      // Act
      const providers = service.getAvailableProviders();

      // Assert
      expect(providers).toContain('2captcha');
      expect(providers).toContain('anticaptcha');
    });

    it('should exclude providers with only unhealthy keys', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue(undefined);
      const unhealthyKey: Partial<CaptchaSolverApiKey> = {
        id: 1,
        provider: '2captcha',
        apiKey: 'unhealthy-key',
        healthStatus: ApiKeyHealthStatus.UNHEALTHY,
        consecutiveFailures: 10,
        isActive: true,
      };
      mockApiKeyRepository.find.mockResolvedValue([unhealthyKey]);
      mockValidationService.validateApiKey.mockResolvedValue({
        isValid: false,
        error: 'Invalid',
        validatedAt: new Date(),
      });
      await service.onModuleInit();

      // Act
      const providers = service.getAvailableProviders();

      // Assert
      expect(providers).not.toContain('2captcha');
    });
  });
});

