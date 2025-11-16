import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptchaSolverService } from './captcha-solver.service';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { BrowserPoolService } from '../browsers/services/browser-pool.service';

describe('CaptchaSolverService', () => {
  let service: CaptchaSolverService;
  let configService: ConfigService;
  let configRepository: Repository<CaptchaSolverConfig>;

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
      ],
    }).compile();

    service = module.get<CaptchaSolverService>(CaptchaSolverService);
    configService = module.get<ConfigService>(ConfigService);
    configRepository = module.get<Repository<CaptchaSolverConfig>>(
      getRepositoryToken(CaptchaSolverConfig),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load API keys from environment', async () => {
      mockConfigService.get.mockReturnValueOnce('test-2captcha-key');
      mockConfigService.get.mockReturnValueOnce('test-anticaptcha-key');

      await service.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('2CAPTCHA_API_KEY');
      expect(mockConfigService.get).toHaveBeenCalledWith('ANTICAPTCHA_API_KEY');
    });

    it('should handle multiple API keys separated by comma', async () => {
      mockConfigService.get.mockReturnValueOnce('key1,key2,key3');

      await service.onModuleInit();

      const providers = service.getAvailableProviders();
      expect(providers).toContain('2captcha');
    });
  });

  describe('getApiKey', () => {
    it('should return an API key for available provider', async () => {
      mockConfigService.get.mockReturnValueOnce('test-key');
      await service.onModuleInit();

      const key = service.getApiKey('2captcha');
      expect(key).toBe('test-key');
    });

    it('should return null for unavailable provider', () => {
      const key = service.getApiKey('nonexistent');
      expect(key).toBeNull();
    });

    it('should rotate keys when multiple are available', async () => {
      mockConfigService.get.mockReturnValueOnce('key1,key2,key3');
      await service.onModuleInit();

      const key1 = service.getApiKey('2captcha');
      const key2 = service.getApiKey('2captcha');
      const key3 = service.getApiKey('2captcha');

      expect(key1).toBe('key1');
      expect(key2).toBe('key2');
      expect(key3).toBe('key3');
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for available provider', async () => {
      mockConfigService.get.mockReturnValueOnce('test-key');
      await service.onModuleInit();

      expect(service.isProviderAvailable('2captcha')).toBe(true);
    });

    it('should return false for unavailable provider', () => {
      expect(service.isProviderAvailable('nonexistent')).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of available providers', async () => {
      mockConfigService.get.mockReturnValueOnce('test-2captcha-key');
      mockConfigService.get.mockReturnValueOnce('test-anticaptcha-key');
      await service.onModuleInit();

      const providers = service.getAvailableProviders();
      expect(providers).toContain('2captcha');
      expect(providers).toContain('anticaptcha');
    });

    it('should return empty array when no providers available', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      await service.onModuleInit();

      const providers = service.getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('config management', () => {
    it('should get config by key', async () => {
      const mockConfig = { key: 'test', value: 'value' };
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      const result = await service.getConfig('test');
      expect(result).toEqual(mockConfig);
      expect(mockConfigRepository.findOne).toHaveBeenCalledWith({
        where: { key: 'test' },
      });
    });

    it('should create new config if not exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      mockConfigRepository.create.mockReturnValue({ key: 'test', value: 'value' });
      mockConfigRepository.save.mockResolvedValue({ key: 'test', value: 'value' });

      const result = await service.setConfig('test', 'value');
      expect(result).toEqual({ key: 'test', value: 'value' });
      expect(mockConfigRepository.create).toHaveBeenCalledWith({
        key: 'test',
        value: 'value',
      });
    });

    it('should update existing config', async () => {
      const existingConfig = { key: 'test', value: 'old', updatedAt: new Date() };
      mockConfigRepository.findOne.mockResolvedValue(existingConfig);
      mockConfigRepository.save.mockResolvedValue({ ...existingConfig, value: 'new' });

      const result = await service.setConfig('test', 'new');
      expect(result.value).toBe('new');
    });

    it('should get all configs', async () => {
      const mockConfigs = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ];
      mockConfigRepository.find.mockResolvedValue(mockConfigs);

      const result = await service.getAllConfigs();
      expect(result).toEqual(mockConfigs);
    });
  });
});
