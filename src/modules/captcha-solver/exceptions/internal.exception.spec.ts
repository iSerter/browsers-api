import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';
import { InternalException } from './internal.exception';

describe('InternalException', () => {
  describe('Constructor', () => {
    it('should create an exception without original error', () => {
      const exception = new InternalException('Internal error occurred');

      expect(exception.message).toBe('Internal error occurred');
      expect(exception.originalError).toBeUndefined();
      expect(exception.code).toBe('INTERNAL_ERROR');
      expect(exception.category).toBe(ErrorCategory.INTERNAL);
      expect(exception.isRecoverable).toBe(false);
    });

    it('should create an exception with original error', () => {
      const originalError = new Error('Unexpected null reference');
      const exception = new InternalException(
        'Internal error occurred',
        originalError,
      );

      expect(exception.originalError).toBe(originalError);
      expect(exception.context?.originalError).toBeDefined();
      expect(exception.context?.originalError?.name).toBe('Error');
      expect(exception.context?.originalError?.message).toBe('Unexpected null reference');
    });

    it('should include original error details in context', () => {
      const originalError = new TypeError('Cannot read property of undefined');
      originalError.name = 'TypeError';
      const exception = new InternalException(
        'Internal processing error',
        originalError,
      );

      expect(exception.context?.originalError?.name).toBe('TypeError');
      expect(exception.context?.originalError?.message).toBe('Cannot read property of undefined');
      expect(exception.context?.originalError?.stack).toBeDefined();
    });

    it('should merge additional context', () => {
      const originalError = new Error('Internal error');
      const exception = new InternalException(
        'Unexpected error',
        originalError,
        { component: 'solver-factory', operation: 'createSolver' },
      );

      expect(exception.context?.originalError).toBeDefined();
      expect(exception.context?.component).toBe('solver-factory');
      expect(exception.context?.operation).toBe('createSolver');
    });

    it('should handle undefined original error in context', () => {
      const exception = new InternalException('Internal error');

      expect(exception.context?.originalError).toBeUndefined();
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new InternalException('Test');

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new InternalException('Test');

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should be an instance of InternalException', () => {
      const exception = new InternalException('Test');

      expect(exception instanceof InternalException).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with all properties', () => {
      const originalError = new Error('Unexpected error');
      const exception = new InternalException(
        'Internal processing error',
        originalError,
        { component: 'detection-service' },
      );

      const json = exception.toJSON();

      expect(json.name).toBe('InternalException');
      expect(json.message).toBe('Internal processing error');
      expect(json.code).toBe('INTERNAL_ERROR');
      expect(json.category).toBe(ErrorCategory.INTERNAL);
      expect(json.isRecoverable).toBe(false);
      expect(json.context?.originalError?.name).toBe('Error');
      expect(json.context?.originalError?.message).toBe('Unexpected error');
      expect(json.context?.component).toBe('detection-service');
    });

    it('should return formatted string representation', () => {
      const originalError = new Error('Null reference');
      const exception = new InternalException(
        'Internal error',
        originalError,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('InternalException [INTERNAL_ERROR]');
      expect(stringRep).toContain('Category: INTERNAL');
      expect(stringRep).toContain('Recoverable: false');
      expect(stringRep).toContain('Message: Internal error');
    });
  });

  describe('Error handling', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new InternalException('Test');
      }).toThrow(InternalException);

      try {
        throw new InternalException('Test', new Error('Original'));
      } catch (error) {
        expect(error).toBeInstanceOf(InternalException);
        expect(error).toBeInstanceOf(CaptchaSolverException);
        if (error instanceof InternalException) {
          expect(error.isRecoverable).toBe(false);
          expect(error.originalError).toBeInstanceOf(Error);
        }
      }
    });
  });
});

