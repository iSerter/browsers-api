import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AntiCaptchaProvider } from './anti-captcha.provider';
import { ApiKeyManagerService } from '../services/api-key-manager.service';
import { CaptchaParams } from '../interfaces/captcha-solver.interface';
import { of, throwError } from 'rxjs';

describe('AntiCaptchaProvider', () => {
  let provider: AntiCaptchaProvider;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let apiKeyManager: jest.Mocked<ApiKeyManagerService>;

  beforeEach(async () => {
    const mockHttpService = {
      request: jest.fn().mockReturnValue(of({ data: {} })),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockApiKeyManager = {
      getApiKey: jest.fn().mockReturnValue('test-api-key'),
      isProviderAvailable: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
      ],
    }).compile();

    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    apiKeyManager = module.get(ApiKeyManagerService);

    provider = new AntiCaptchaProvider(
      httpService,
      configService,
      apiKeyManager,
    );

    // Reset mocks before each test (but keep mock implementations)
    httpService.request.mockReset();
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('anticaptcha');
    });
  });

  describe('isAvailable', () => {
    it('should return true when provider is available', async () => {
      apiKeyManager.isProviderAvailable.mockResolvedValue(true);

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when provider is not available', async () => {
      apiKeyManager.isProviderAvailable.mockResolvedValue(false);

      const result = await provider.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('solve', () => {
    it('should solve reCAPTCHA v2', async () => {
      const createTaskResponse = {
        errorId: 0,
        taskId: 12345678,
      };

      const getTaskResponse = {
        errorId: 0,
        status: 'ready',
        solution: {
          gRecaptchaResponse: '03AGdBq24P5Y2q',
        },
      };

      httpService.request
        .mockReturnValueOnce(of({ data: createTaskResponse }))
        .mockReturnValueOnce(of({ data: { errorId: 0, status: 'processing' } }))
        .mockReturnValueOnce(of({ data: getTaskResponse }))
        .mockReturnValueOnce(of({ data: getTaskResponse })); // For final getTaskResult call

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-',
        url: 'https://example.com',
        version: 'v2',
      };

      jest.spyOn(provider as any, 'sleep').mockResolvedValue(undefined);

      const result = await provider.solve(params);

      expect(result.token).toBe('03AGdBq24P5Y2q');
      expect(apiKeyManager.recordSuccess).toHaveBeenCalledWith('anticaptcha', 'test-api-key');
    });

    it('should solve reCAPTCHA v3', async () => {
      const createTaskResponse = {
        errorId: 0,
        taskId: 12345678,
      };

      const getTaskResponse = {
        errorId: 0,
        status: 'ready',
        solution: {
          gRecaptchaResponse: '03AGdBq24P5Y2q',
        },
      };

      httpService.request
        .mockReturnValueOnce(of({ data: createTaskResponse }))
        .mockReturnValueOnce(of({ data: getTaskResponse }))
        .mockReturnValueOnce(of({ data: getTaskResponse })); // For getTaskResult call

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-',
        url: 'https://example.com',
        version: 'v3',
        action: 'verify',
      };

      jest.spyOn(provider as any, 'sleep').mockResolvedValue(undefined);

      const result = await provider.solve(params);

      expect(result.token).toBe('03AGdBq24P5Y2q');
    });

    it('should solve hCAPTCHA', async () => {
      const createTaskResponse = {
        errorId: 0,
        taskId: 12345678,
      };

      const getTaskResponse = {
        errorId: 0,
        status: 'ready',
        solution: {
          gRecaptchaResponse: 'P0_eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9',
        },
      };

      httpService.request
        .mockReturnValueOnce(of({ data: createTaskResponse }))
        .mockReturnValueOnce(of({ data: getTaskResponse }))
        .mockReturnValueOnce(of({ data: getTaskResponse })); // For getTaskResult call

      const params: CaptchaParams = {
        type: 'hcaptcha',
        sitekey: '10000000-ffff-ffff-ffff-000000000001',
        url: 'https://example.com',
      };

      jest.spyOn(provider as any, 'sleep').mockResolvedValue(undefined);

      const result = await provider.solve(params);

      expect(result.token).toBe('P0_eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9');
    });

    it('should handle API key not available', async () => {
      apiKeyManager.getApiKey.mockReturnValue(null);

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      await expect(provider.solve(params)).rejects.toThrow('API key not available');
    });

    it('should handle task creation errors', async () => {
      httpService.request.mockReturnValue(
        of({
          data: {
            errorId: 1,
            errorCode: 'ERROR_KEY_DOES_NOT_EXIST',
            errorDescription: 'API key does not exist',
          },
        }),
      );

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      await expect(provider.solve(params)).rejects.toThrow();
      expect(apiKeyManager.recordFailure).toHaveBeenCalled();
    });
  });
});

