import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';
import { NetworkException } from './network.exception';

describe('NetworkException', () => {
  describe('Constructor', () => {
    it('should create an exception without original error', () => {
      const exception = new NetworkException('Network timeout');

      expect(exception.message).toBe('Network timeout');
      expect(exception.originalError).toBeUndefined();
      expect(exception.code).toBe('NETWORK_ERROR');
      expect(exception.category).toBe(ErrorCategory.NETWORK);
      expect(exception.isRecoverable).toBe(true);
    });

    it('should create an exception with original error', () => {
      const originalError = new Error('Connection refused');
      const exception = new NetworkException(
        'Network error occurred',
        originalError,
      );

      expect(exception.originalError).toBe(originalError);
      expect(exception.context?.originalError).toBeDefined();
      expect(exception.context?.originalError?.name).toBe('Error');
      expect(exception.context?.originalError?.message).toBe('Connection refused');
    });

    it('should include original error details in context', () => {
      const originalError = new Error('ETIMEDOUT');
      originalError.name = 'TimeoutError';
      const exception = new NetworkException(
        'Request timed out',
        originalError,
      );

      expect(exception.context?.originalError?.name).toBe('TimeoutError');
      expect(exception.context?.originalError?.message).toBe('ETIMEDOUT');
      expect(exception.context?.originalError?.stack).toBeDefined();
    });

    it('should merge additional context', () => {
      const originalError = new Error('Network error');
      const exception = new NetworkException(
        'Network request failed',
        originalError,
        { url: 'https://api.example.com', timeout: 5000 },
      );

      expect(exception.context?.originalError).toBeDefined();
      expect(exception.context?.url).toBe('https://api.example.com');
      expect(exception.context?.timeout).toBe(5000);
    });

    it('should handle undefined original error in context', () => {
      const exception = new NetworkException('Network error');

      expect(exception.context?.originalError).toBeUndefined();
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new NetworkException('Test');

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new NetworkException('Test');

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should be an instance of NetworkException', () => {
      const exception = new NetworkException('Test');

      expect(exception instanceof NetworkException).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with all properties', () => {
      const originalError = new Error('Connection failed');
      const exception = new NetworkException(
        'Network error',
        originalError,
        { url: 'https://api.example.com' },
      );

      const json = exception.toJSON();

      expect(json.name).toBe('NetworkException');
      expect(json.message).toBe('Network error');
      expect(json.code).toBe('NETWORK_ERROR');
      expect(json.category).toBe(ErrorCategory.NETWORK);
      expect(json.isRecoverable).toBe(true);
      expect(json.context?.originalError?.name).toBe('Error');
      expect(json.context?.originalError?.message).toBe('Connection failed');
      expect(json.context?.url).toBe('https://api.example.com');
    });

    it('should return formatted string representation', () => {
      const originalError = new Error('Timeout');
      const exception = new NetworkException(
        'Network timeout',
        originalError,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('NetworkException [NETWORK_ERROR]');
      expect(stringRep).toContain('Category: NETWORK');
      expect(stringRep).toContain('Recoverable: true');
      expect(stringRep).toContain('Message: Network timeout');
    });
  });

  describe('Error handling', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new NetworkException('Test');
      }).toThrow(NetworkException);

      try {
        throw new NetworkException('Test', new Error('Original'));
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkException);
        expect(error).toBeInstanceOf(CaptchaSolverException);
        if (error instanceof NetworkException) {
          expect(error.isRecoverable).toBe(true);
          expect(error.originalError).toBeInstanceOf(Error);
        }
      }
    });
  });
});

