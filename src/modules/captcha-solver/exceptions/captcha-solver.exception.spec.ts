import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';

describe('CaptchaSolverException', () => {
  describe('Constructor', () => {
    it('should create an exception with all required properties', () => {
      const exception = new CaptchaSolverException(
        'Test error message',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
        false,
      );

      expect(exception.message).toBe('Test error message');
      expect(exception.code).toBe('TEST_ERROR');
      expect(exception.category).toBe(ErrorCategory.INTERNAL);
      expect(exception.isRecoverable).toBe(false);
      expect(exception.context).toBeUndefined();
    });

    it('should create an exception with context', () => {
      const context = { provider: 'test-provider', requestId: '123' };
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.PROVIDER,
        true,
        context,
      );

      expect(exception.context).toEqual(context);
      expect(exception.isRecoverable).toBe(true);
    });

    it('should set default isRecoverable to false when not provided', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.VALIDATION,
      );

      expect(exception.isRecoverable).toBe(false);
    });

    it('should set the correct name property', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      expect(exception.name).toBe('CaptchaSolverException');
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should maintain proper prototype chain', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      expect(Object.getPrototypeOf(exception)).toBe(
        CaptchaSolverException.prototype,
      );
    });
  });

  describe('Stack Trace', () => {
    it('should capture stack trace when available', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe('string');
      expect(exception.stack).toContain('CaptchaSolverException');
    });

    it('should include stack trace in error', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      const stackString = exception.stack || '';
      expect(stackString.length).toBeGreaterThan(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize exception to JSON with all properties', () => {
      const context = { provider: 'test', requestId: '123' };
      const exception = new CaptchaSolverException(
        'Test error message',
        'TEST_ERROR',
        ErrorCategory.PROVIDER,
        true,
        context,
      );

      const json = exception.toJSON();

      expect(json).toEqual({
        name: 'CaptchaSolverException',
        message: 'Test error message',
        code: 'TEST_ERROR',
        category: ErrorCategory.PROVIDER,
        isRecoverable: true,
        context: context,
        stack: exception.stack,
      });
    });

    it('should serialize exception without context when context is undefined', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.VALIDATION,
        false,
      );

      const json = exception.toJSON();

      expect(json.context).toBeUndefined();
      expect(json.name).toBe('CaptchaSolverException');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.category).toBe(ErrorCategory.VALIDATION);
      expect(json.isRecoverable).toBe(false);
    });

    it('should include stack trace in JSON', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
      );

      const json = exception.toJSON();

      expect(json.stack).toBeDefined();
      expect(json.stack).toBe(exception.stack);
    });
  });

  describe('toString', () => {
    it('should return formatted string with all properties', () => {
      const context = { provider: 'test-provider', requestId: '123' };
      const exception = new CaptchaSolverException(
        'Test error message',
        'TEST_ERROR',
        ErrorCategory.PROVIDER,
        true,
        context,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('CaptchaSolverException [TEST_ERROR]');
      expect(stringRep).toContain('Category: PROVIDER');
      expect(stringRep).toContain('Recoverable: true');
      expect(stringRep).toContain('Message: Test error message');
      expect(stringRep).toContain('Context:');
      expect(stringRep).toContain('"provider":"test-provider"');
    });

    it('should return formatted string without context when context is undefined', () => {
      const exception = new CaptchaSolverException(
        'Test error message',
        'TEST_ERROR',
        ErrorCategory.VALIDATION,
        false,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('CaptchaSolverException [TEST_ERROR]');
      expect(stringRep).toContain('Category: VALIDATION');
      expect(stringRep).toContain('Recoverable: false');
      expect(stringRep).toContain('Message: Test error message');
      expect(stringRep).not.toContain('Context:');
    });

    it('should return formatted string with empty context object', () => {
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.INTERNAL,
        false,
        {},
      );

      const stringRep = exception.toString();

      // Empty context should not be included in string representation
      expect(stringRep).not.toContain('Context:');
    });
  });

  describe('ErrorCategory enum', () => {
    it('should have all required error categories', () => {
      expect(ErrorCategory.AVAILABILITY).toBe('AVAILABILITY');
      expect(ErrorCategory.VALIDATION).toBe('VALIDATION');
      expect(ErrorCategory.NETWORK).toBe('NETWORK');
      expect(ErrorCategory.PROVIDER).toBe('PROVIDER');
      expect(ErrorCategory.INTERNAL).toBe('INTERNAL');
    });

    it('should allow creating exceptions with different categories', () => {
      const availabilityException = new CaptchaSolverException(
        'Service unavailable',
        'SERVICE_UNAVAILABLE',
        ErrorCategory.AVAILABILITY,
        true,
      );

      const validationException = new CaptchaSolverException(
        'Invalid input',
        'INVALID_INPUT',
        ErrorCategory.VALIDATION,
        false,
      );

      const networkException = new CaptchaSolverException(
        'Network timeout',
        'NETWORK_TIMEOUT',
        ErrorCategory.NETWORK,
        true,
      );

      expect(availabilityException.category).toBe(ErrorCategory.AVAILABILITY);
      expect(validationException.category).toBe(ErrorCategory.VALIDATION);
      expect(networkException.category).toBe(ErrorCategory.NETWORK);
    });
  });

  describe('Error handling scenarios', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new CaptchaSolverException(
          'Test error',
          'TEST_ERROR',
          ErrorCategory.INTERNAL,
        );
      }).toThrow(CaptchaSolverException);

      try {
        throw new CaptchaSolverException(
          'Test error',
          'TEST_ERROR',
          ErrorCategory.INTERNAL,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(CaptchaSolverException);
        expect(error).toBeInstanceOf(Error);
        if (error instanceof CaptchaSolverException) {
          expect(error.message).toBe('Test error');
          expect(error.code).toBe('TEST_ERROR');
        }
      }
    });

    it('should preserve error properties when caught', () => {
      const context = { provider: 'test', attempt: 1 };
      let caughtException: CaptchaSolverException | null = null;

      try {
        throw new CaptchaSolverException(
          'Provider error',
          'PROVIDER_ERROR',
          ErrorCategory.PROVIDER,
          true,
          context,
        );
      } catch (error) {
        if (error instanceof CaptchaSolverException) {
          caughtException = error;
        }
      }

      expect(caughtException).not.toBeNull();
      if (caughtException) {
        expect(caughtException.message).toBe('Provider error');
        expect(caughtException.code).toBe('PROVIDER_ERROR');
        expect(caughtException.category).toBe(ErrorCategory.PROVIDER);
        expect(caughtException.isRecoverable).toBe(true);
        expect(caughtException.context).toEqual(context);
      }
    });
  });

  describe('JSON serialization', () => {
    it('should be JSON serializable', () => {
      const context = { provider: 'test', nested: { value: 123 } };
      const exception = new CaptchaSolverException(
        'Test error',
        'TEST_ERROR',
        ErrorCategory.PROVIDER,
        true,
        context,
      );

      const json = exception.toJSON();
      const serialized = JSON.stringify(json);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.name).toBe('CaptchaSolverException');
      expect(deserialized.message).toBe('Test error');
      expect(deserialized.code).toBe('TEST_ERROR');
      expect(deserialized.category).toBe('PROVIDER');
      expect(deserialized.isRecoverable).toBe(true);
      expect(deserialized.context).toEqual(context);
    });

    it('should handle complex context objects', () => {
      const complexContext = {
        provider: 'test',
        request: {
          url: 'https://example.com',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          retryCount: 3,
        },
      };

      const exception = new CaptchaSolverException(
        'Complex error',
        'COMPLEX_ERROR',
        ErrorCategory.NETWORK,
        true,
        complexContext,
      );

      const json = exception.toJSON();
      expect(json.context).toEqual(complexContext);
      expect(JSON.stringify(json)).toBeTruthy();
    });
  });
});

