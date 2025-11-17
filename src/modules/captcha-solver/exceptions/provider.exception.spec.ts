import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';
import { ProviderException } from './provider.exception';

describe('ProviderException', () => {
  describe('Constructor', () => {
    it('should create an exception with provider name', () => {
      const exception = new ProviderException(
        'Provider API error',
        '2captcha',
      );

      expect(exception.message).toBe('Provider API error');
      expect(exception.providerName).toBe('2captcha');
      expect(exception.code).toBe('PROVIDER_ERROR');
      expect(exception.category).toBe(ErrorCategory.PROVIDER);
      expect(exception.isRecoverable).toBe(true);
    });

    it('should include provider name and API response in context', () => {
      const apiResponse = { error: 'Invalid API key', code: 401 };
      const exception = new ProviderException(
        'Provider error',
        'anti-captcha',
        apiResponse,
      );

      expect(exception.apiResponse).toEqual(apiResponse);
      expect(exception.context?.providerName).toBe('anti-captcha');
      expect(exception.context?.apiResponse).toEqual(apiResponse);
    });

    it('should merge additional context', () => {
      const apiResponse = { error: 'Rate limit exceeded' };
      const exception = new ProviderException(
        'Provider error',
        '2captcha',
        apiResponse,
        { requestId: '123', retryAfter: 60 },
      );

      expect(exception.context?.providerName).toBe('2captcha');
      expect(exception.context?.apiResponse).toEqual(apiResponse);
      expect(exception.context?.requestId).toBe('123');
      expect(exception.context?.retryAfter).toBe(60);
    });

    it('should handle undefined API response', () => {
      const exception = new ProviderException(
        'Provider error',
        'native',
      );

      expect(exception.apiResponse).toBeUndefined();
      expect(exception.context?.providerName).toBe('native');
      expect(exception.context?.apiResponse).toBeUndefined();
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new ProviderException('Test', '2captcha');

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new ProviderException('Test', '2captcha');

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should be an instance of ProviderException', () => {
      const exception = new ProviderException('Test', '2captcha');

      expect(exception instanceof ProviderException).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with all properties', () => {
      const apiResponse = { error: 'Invalid API key', code: 401 };
      const exception = new ProviderException(
        'Provider API error',
        'anti-captcha',
        apiResponse,
        { requestId: '123' },
      );

      const json = exception.toJSON();

      expect(json.name).toBe('ProviderException');
      expect(json.message).toBe('Provider API error');
      expect(json.code).toBe('PROVIDER_ERROR');
      expect(json.category).toBe(ErrorCategory.PROVIDER);
      expect(json.isRecoverable).toBe(true);
      expect(json.context?.providerName).toBe('anti-captcha');
      expect(json.context?.apiResponse).toEqual(apiResponse);
      expect(json.context?.requestId).toBe('123');
    });

    it('should return formatted string representation', () => {
      const apiResponse = { error: 'Rate limit exceeded' };
      const exception = new ProviderException(
        'Provider error',
        '2captcha',
        apiResponse,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('ProviderException [PROVIDER_ERROR]');
      expect(stringRep).toContain('Category: PROVIDER');
      expect(stringRep).toContain('Recoverable: true');
      expect(stringRep).toContain('Message: Provider error');
      expect(stringRep).toContain('"providerName":"2captcha"');
    });
  });

  describe('Error handling', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new ProviderException('Test', '2captcha');
      }).toThrow(ProviderException);

      try {
        throw new ProviderException('Test', 'anti-captcha');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderException);
        expect(error).toBeInstanceOf(CaptchaSolverException);
        if (error instanceof ProviderException) {
          expect(error.providerName).toBe('anti-captcha');
          expect(error.isRecoverable).toBe(true);
        }
      }
    });
  });
});

