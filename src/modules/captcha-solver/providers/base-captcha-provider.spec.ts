import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BaseCaptchaProvider } from './base-captcha-provider';
import { CaptchaParams } from '../interfaces/captcha-solver.interface';
import { of, throwError, NEVER } from 'rxjs';

class TestProvider extends BaseCaptchaProvider {
  protected async solveCaptcha(params: CaptchaParams): Promise<any> {
    return { token: 'test-token', solvedAt: new Date(), solverId: 'test' };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getName(): string {
    return 'test';
  }
}

describe('BaseCaptchaProvider', () => {
  let provider: TestProvider;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const mockHttpService = {
      request: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    httpService = module.get(HttpService);
    provider = new TestProvider(httpService, 3, 60);
  });

  describe('solve', () => {
    it('should solve captcha on first attempt', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      const result = await provider.solve(params);

      expect(result.token).toBe('test-token');
      expect(result.solverId).toBe('test');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const mockSolve = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary error');
        }
        return { token: 'test-token', solvedAt: new Date(), solverId: 'test' };
      });

      provider['solveCaptcha'] = mockSolve;

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      const result = await provider.solve(params);

      expect(result.token).toBe('test-token');
      expect(attempts).toBe(3);
    });

    it('should not retry on authentication errors', async () => {
      const authError = {
        response: { status: 401 },
        message: 'Unauthorized',
        code: 401,
      };
      const mockSolve = jest.fn().mockRejectedValue(authError);

      provider['solveCaptcha'] = mockSolve;

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      await expect(provider.solve(params)).rejects.toMatchObject({
        response: { status: 401 },
        message: 'Unauthorized',
      });
      expect(mockSolve).toHaveBeenCalledTimes(1);
    });

    it('should not retry on invalid parameter errors', async () => {
      const invalidParamError = {
        message: 'Invalid parameter',
      };
      const mockSolve = jest.fn().mockRejectedValue(invalidParamError);

      provider['solveCaptcha'] = mockSolve;

      const params: CaptchaParams = {
        type: 'recaptcha',
        sitekey: 'test-key',
        url: 'https://example.com',
      };

      await expect(provider.solve(params)).rejects.toMatchObject({
        message: 'Invalid parameter',
      });
      expect(mockSolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('makeRequest', () => {
    it('should make HTTP request successfully', async () => {
      httpService.request.mockReturnValue(
        of({ data: { status: 'ok' } }),
      );

      const result = await provider['makeRequest']('GET', 'https://api.example.com');

      expect(result).toEqual({ status: 'ok' });
      expect(httpService.request).toHaveBeenCalled();
    });

    it('should handle timeout', async () => {
      jest.useFakeTimers();
      
      // Mock an observable that never emits to simulate timeout
      httpService.request.mockReturnValue(NEVER);

      // Use a shorter timeout for testing by temporarily modifying the provider
      const originalTimeout = provider['timeoutSeconds'];
      provider['timeoutSeconds'] = 0.1; // 100ms for testing

      try {
        const requestPromise = provider['makeRequest']('GET', 'https://api.example.com');
        
        // Fast-forward time to trigger timeout
        jest.advanceTimersByTime(150);
        
        await expect(requestPromise).rejects.toThrow('Request timeout');
      } finally {
        // Restore original timeout and timers
        provider['timeoutSeconds'] = originalTimeout;
        jest.useRealTimers();
      }
    });

    it('should handle HTTP errors', async () => {
      httpService.request.mockReturnValue(
        throwError(() => ({ response: { status: 500 } })),
      );

      await expect(
        provider['makeRequest']('GET', 'https://api.example.com'),
      ).rejects.toBeDefined();
    });
  });

  describe('formatProxy', () => {
    it('should format proxy without credentials', () => {
      const proxy = {
        type: 'http' as const,
        host: 'proxy.example.com',
        port: 8080,
      };

      const formatted = provider['formatProxy'](proxy);

      expect(formatted).toBe('http://proxy.example.com:8080');
    });

    it('should format proxy with credentials', () => {
      const proxy = {
        type: 'https' as const,
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass',
      };

      const formatted = provider['formatProxy'](proxy);

      expect(formatted).toBe('https://user:pass@proxy.example.com:8080');
    });

    it('should return undefined for no proxy', () => {
      const formatted = provider['formatProxy'](undefined);

      expect(formatted).toBeUndefined();
    });
  });
});

