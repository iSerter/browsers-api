import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ApiKeyValidationService } from './api-key-validation.service';
import { AxiosResponse } from 'axios';

describe('ApiKeyValidationService', () => {
  let service: ApiKeyValidationService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyValidationService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<ApiKeyValidationService>(ApiKeyValidationService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate2CaptchaKey', () => {
    it('should return valid result when API key is valid', async () => {
      // Arrange
      const apiKey = 'valid-2captcha-key';
      const mockResponse: AxiosResponse = {
        data: { status: 1, request: '10.50' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validate2CaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual({ balance: '10.50' });
      expect(result.error).toBeUndefined();
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://2captcha.com/res.php',
        {
          params: {
            key: apiKey,
            action: 'getbalance',
            json: 1,
          },
          timeout: 10000,
        },
      );
    });

    it('should return invalid result when API key is wrong', async () => {
      // Arrange
      const apiKey = 'invalid-key';
      const mockResponse: AxiosResponse = {
        data: { status: 0, request: 'ERROR_WRONG_USER_KEY' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validate2CaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should return invalid result when API returns other error', async () => {
      // Arrange
      const apiKey = 'test-key';
      const mockResponse: AxiosResponse = {
        data: { status: 0, request: 'ERROR_ZERO_BALANCE' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validate2CaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('ERROR_ZERO_BALANCE');
    });

    it('should handle network errors', async () => {
      // Arrange
      const apiKey = 'test-key';
      const networkError = new Error('Network timeout');
      mockHttpService.get.mockReturnValue(throwError(() => networkError));

      // Act
      const result = await service.validate2CaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('validateAntiCaptchaKey', () => {
    it('should return valid result when API key is valid', async () => {
      // Arrange
      const apiKey = 'valid-anticaptcha-key';
      const mockResponse: AxiosResponse = {
        data: { errorId: 0, balance: 15.75 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validateAntiCaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual({ balance: 15.75 });
      expect(result.error).toBeUndefined();
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.anti-captcha.com/getBalance',
        { clientKey: apiKey },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
    });

    it('should return invalid result when API key is wrong', async () => {
      // Arrange
      const apiKey = 'invalid-key';
      const mockResponse: AxiosResponse = {
        data: {
          errorId: 1,
          errorDescription: 'ERROR_KEY_DOES_NOT_EXIST',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validateAntiCaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('ERROR_KEY_DOES_NOT_EXIST');
    });

    it('should handle network errors', async () => {
      // Arrange
      const apiKey = 'test-key';
      const networkError = new Error('Connection refused');
      mockHttpService.post.mockReturnValue(throwError(() => networkError));

      // Act
      const result = await service.validateAntiCaptchaKey(apiKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('validateApiKey', () => {
    it('should validate 2captcha key', async () => {
      // Arrange
      const apiKey = 'test-2captcha-key';
      const mockResponse: AxiosResponse = {
        data: { status: 1, request: '5.00' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validateApiKey('2captcha', apiKey);

      // Assert
      expect(result.isValid).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should validate anticaptcha key', async () => {
      // Arrange
      const apiKey = 'test-anticaptcha-key';
      const mockResponse: AxiosResponse = {
        data: { errorId: 0, balance: 10.0 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validateApiKey('anticaptcha', apiKey);

      // Assert
      expect(result.isValid).toBe(true);
      expect(mockHttpService.post).toHaveBeenCalled();
    });

    it('should return invalid for unknown provider', async () => {
      // Act
      const result = await service.validateApiKey('unknown', 'test-key');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('should handle case-insensitive provider names', async () => {
      // Arrange
      const apiKey = 'test-key';
      const mockResponse: AxiosResponse = {
        data: { status: 1, request: '5.00' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      mockHttpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.validateApiKey('2CAPTCHA', apiKey);

      // Assert
      expect(result.isValid).toBe(true);
    });
  });
});

