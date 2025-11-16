import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CaptchaSolverController } from './captcha-solver.controller';
import { CaptchaSolverService } from './captcha-solver.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { TestCaptchaDto, CaptchaType, RecaptchaVersion } from './dto/test-captcha.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { CaptchaSolution } from './interfaces/captcha-solver.interface';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { UsageStatistics } from './services/cost-tracking.service';

describe('CaptchaSolverController', () => {
  let controller: CaptchaSolverController;
  let captchaSolverService: jest.Mocked<CaptchaSolverService>;
  let providerRegistry: jest.Mocked<ProviderRegistryService>;

  const mockCaptchaSolverService = {
    getAvailableProviders: jest.fn(),
    solveWithFallback: jest.fn(),
    getAllConfigs: jest.fn(),
    getConfiguration: jest.fn(),
    setConfig: jest.fn(),
    getUsageStatistics: jest.fn(),
    getTotalCost: jest.fn(),
  };

  const mockProviderRegistry = {
    getProviderNames: jest.fn(),
    getProvider: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaptchaSolverController],
      providers: [
        {
          provide: CaptchaSolverService,
          useValue: mockCaptchaSolverService,
        },
        {
          provide: ProviderRegistryService,
          useValue: mockProviderRegistry,
        },
      ],
    }).compile();

    controller = module.get<CaptchaSolverController>(CaptchaSolverController);
    captchaSolverService = module.get(CaptchaSolverService);
    providerRegistry = module.get(ProviderRegistryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProviders', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should return list of providers with availability status', async () => {
      const mockProviders = ['2captcha', 'anticaptcha'];
      const mockAvailableProviders = ['2captcha'];
      
      const mockProvider1 = {
        isAvailable: jest.fn().mockResolvedValue(true),
      };
      const mockProvider2 = {
        isAvailable: jest.fn().mockResolvedValue(false),
      };

      captchaSolverService.getAvailableProviders.mockReturnValue(mockAvailableProviders);
      providerRegistry.getProviderNames.mockReturnValue(mockProviders);
      providerRegistry.getProvider
        .mockReturnValueOnce(mockProvider1)
        .mockReturnValueOnce(mockProvider2);

      const result = await controller.getProviders();

      expect(result).toHaveProperty('providers');
      expect(result).toHaveProperty('availableCount');
      expect(result).toHaveProperty('totalCount');
      expect(result.providers).toHaveLength(2);
      expect(result.providers[0]).toEqual({ name: '2captcha', available: true });
      expect(result.providers[1]).toEqual({ name: 'anticaptcha', available: false });
      expect(result.availableCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(captchaSolverService.getAvailableProviders).toHaveBeenCalled();
      expect(providerRegistry.getProviderNames).toHaveBeenCalled();
    });

    it('should handle providers that are not available', async () => {
      const mockProviders = ['2captcha'];
      const mockAvailableProviders: string[] = [];
      
      const mockProvider = {
        isAvailable: jest.fn().mockResolvedValue(false),
      };

      captchaSolverService.getAvailableProviders.mockReturnValue(mockAvailableProviders);
      providerRegistry.getProviderNames.mockReturnValue(mockProviders);
      providerRegistry.getProvider.mockReturnValue(mockProvider);

      const result = await controller.getProviders();

      expect(result.providers[0]).toEqual({ name: '2captcha', available: false });
      expect(result.availableCount).toBe(0);
      expect(result.totalCount).toBe(1);
    });

    it('should handle null provider gracefully', async () => {
      const mockProviders = ['2captcha'];
      const mockAvailableProviders: string[] = [];

      captchaSolverService.getAvailableProviders.mockReturnValue(mockAvailableProviders);
      providerRegistry.getProviderNames.mockReturnValue(mockProviders);
      providerRegistry.getProvider.mockReturnValue(null);

      const result = await controller.getProviders();

      expect(result.providers[0]).toEqual({ name: '2captcha', available: false });
    });
  });

  describe('testCaptcha', () => {
    const mockTestCaptchaDto: TestCaptchaDto = {
      type: CaptchaType.RECAPTCHA,
      url: 'https://example.com',
      sitekey: 'test-sitekey',
      version: RecaptchaVersion.V2,
    };

    const mockSolution: CaptchaSolution = {
      token: 'test-token',
      solvedAt: new Date(),
      solverId: 'test-solver-id',
    };

    it('should solve captcha successfully', async () => {
      captchaSolverService.getAvailableProviders.mockReturnValue(['2captcha']);
      captchaSolverService.solveWithFallback.mockResolvedValue(mockSolution);

      const result = await controller.testCaptcha(mockTestCaptchaDto);

      expect(result).toEqual({
        success: true,
        solution: {
          token: mockSolution.token,
          solvedAt: mockSolution.solvedAt,
          solverId: mockSolution.solverId,
        },
      });
      expect(captchaSolverService.solveWithFallback).toHaveBeenCalledWith({
        type: CaptchaType.RECAPTCHA,
        url: 'https://example.com',
        sitekey: 'test-sitekey',
        version: RecaptchaVersion.V2,
        action: undefined,
        proxy: undefined,
      });
    });

    it('should throw BadRequestException when no providers are available', async () => {
      captchaSolverService.getAvailableProviders.mockReturnValue([]);

      await expect(controller.testCaptcha(mockTestCaptchaDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(captchaSolverService.solveWithFallback).not.toHaveBeenCalled();
    });

    it('should handle captcha solving errors', async () => {
      captchaSolverService.getAvailableProviders.mockReturnValue(['2captcha']);
      captchaSolverService.solveWithFallback.mockRejectedValue(
        new Error('Provider error'),
      );

      await expect(controller.testCaptcha(mockTestCaptchaDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle proxy configuration', async () => {
      const dtoWithProxy: TestCaptchaDto = {
        ...mockTestCaptchaDto,
        proxy: {
          type: 'http',
          host: 'proxy.example.com',
          port: 8080,
          username: 'user',
          password: 'pass',
        },
      };

      captchaSolverService.getAvailableProviders.mockReturnValue(['2captcha']);
      captchaSolverService.solveWithFallback.mockResolvedValue(mockSolution);

      await controller.testCaptcha(dtoWithProxy);

      expect(captchaSolverService.solveWithFallback).toHaveBeenCalledWith({
        type: CaptchaType.RECAPTCHA,
        url: 'https://example.com',
        sitekey: 'test-sitekey',
        version: RecaptchaVersion.V2,
        action: undefined,
        proxy: {
          type: 'http',
          host: 'proxy.example.com',
          port: 8080,
          username: 'user',
          password: 'pass',
        },
      });
    });

    it('should handle reCAPTCHA v3 with action', async () => {
      const dtoV3: TestCaptchaDto = {
        type: CaptchaType.RECAPTCHA,
        url: 'https://example.com',
        sitekey: 'test-sitekey',
        version: RecaptchaVersion.V3,
        action: 'submit',
      };

      captchaSolverService.getAvailableProviders.mockReturnValue(['2captcha']);
      captchaSolverService.solveWithFallback.mockResolvedValue(mockSolution);

      await controller.testCaptcha(dtoV3);

      expect(captchaSolverService.solveWithFallback).toHaveBeenCalledWith({
        type: CaptchaType.RECAPTCHA,
        url: 'https://example.com',
        sitekey: 'test-sitekey',
        version: RecaptchaVersion.V3,
        action: 'submit',
        proxy: undefined,
      });
    });
  });

  describe('getConfig', () => {
    it('should return configuration', async () => {
      const mockConfigs: CaptchaSolverConfig[] = [
        {
          id: 1,
          key: 'preferred_provider',
          value: '2captcha',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          key: 'timeout_seconds',
          value: '60',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockConfiguration = {
        preferredProvider: '2captcha',
        timeoutSeconds: 60,
      };

      captchaSolverService.getAllConfigs.mockResolvedValue(mockConfigs);
      captchaSolverService.getConfiguration.mockReturnValue(mockConfiguration);

      const result = await controller.getConfig();

      expect(result).toHaveProperty('configs');
      expect(result).toHaveProperty('configuration');
      expect(result.configs).toEqual({
        preferred_provider: '2captcha',
        timeout_seconds: '60',
      });
      expect(result.configuration).toEqual(mockConfiguration);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', async () => {
      const updateConfigDto: UpdateConfigDto = {
        key: 'preferred_provider',
        value: 'anticaptcha',
      };

      const mockConfig: CaptchaSolverConfig = {
        id: 1,
        key: 'preferred_provider',
        value: 'anticaptcha',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      captchaSolverService.setConfig.mockResolvedValue(mockConfig);

      const result = await controller.updateConfig(updateConfigDto);

      expect(result).toEqual({
        message: 'Configuration updated successfully',
        config: {
          key: mockConfig.key,
          value: mockConfig.value,
        },
      });
      expect(captchaSolverService.setConfig).toHaveBeenCalledWith(
        'preferred_provider',
        'anticaptcha',
      );
    });
  });

  describe('getStats', () => {
    it('should return usage statistics', async () => {
      const mockStats: UsageStatistics[] = [
        {
          provider: '2captcha',
          totalUses: 10,
          totalCost: 0.02,
          successCount: 10,
          failureCount: 0,
          byChallengeType: {
            recaptcha: { count: 10, cost: 0.02 },
          },
          lastUsed: new Date(),
        },
      ];

      const mockTotalCost = 0.02;
      const mockAvailableProviders = ['2captcha'];

      captchaSolverService.getUsageStatistics.mockReturnValue(mockStats);
      captchaSolverService.getTotalCost.mockReturnValue(mockTotalCost);
      captchaSolverService.getAvailableProviders.mockReturnValue(
        mockAvailableProviders,
      );

      const result = await controller.getStats();

      expect(result).toHaveProperty('totalCost');
      expect(result).toHaveProperty('availableProviders');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('summary');
      expect(result.totalCost).toBe(mockTotalCost);
      expect(result.availableProviders).toEqual(mockAvailableProviders);
      expect(result.usage).toEqual(mockStats);
      expect(result.summary).toEqual({
        totalUses: 10,
        totalCost: 0.02,
        providerCount: 1,
      });
    });

    it('should handle empty statistics', async () => {
      captchaSolverService.getUsageStatistics.mockReturnValue([]);
      captchaSolverService.getTotalCost.mockReturnValue(0);
      captchaSolverService.getAvailableProviders.mockReturnValue([]);

      const result = await controller.getStats();

      expect(result.totalCost).toBe(0);
      expect(result.availableProviders).toEqual([]);
      expect(result.usage).toEqual([]);
      expect(result.summary).toEqual({
        totalUses: 0,
        totalCost: 0,
        providerCount: 0,
      });
    });
  });
});

