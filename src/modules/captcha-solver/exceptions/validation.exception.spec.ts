import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';
import { ValidationException } from './validation.exception';

describe('ValidationException', () => {
  describe('Constructor', () => {
    it('should create an exception with validation errors array', () => {
      const validationErrors = [
        { field: 'url', message: 'URL is required', code: 'REQUIRED' },
        { field: 'captchaType', message: 'Invalid captcha type', code: 'INVALID' },
      ];

      const exception = new ValidationException(
        'Validation failed',
        validationErrors,
      );

      expect(exception.message).toBe('Validation failed');
      expect(exception.validationErrors).toEqual(validationErrors);
      expect(exception.code).toBe('VALIDATION_ERROR');
      expect(exception.category).toBe(ErrorCategory.VALIDATION);
      expect(exception.isRecoverable).toBe(false);
    });

    it('should include validation errors in context', () => {
      const validationErrors = [
        { message: 'Invalid input' },
      ];

      const exception = new ValidationException(
        'Validation failed',
        validationErrors,
      );

      expect(exception.context?.validationErrors).toEqual(validationErrors);
    });

    it('should merge additional context', () => {
      const validationErrors = [
        { field: 'apiKey', message: 'API key is invalid' },
      ];

      const exception = new ValidationException(
        'Validation failed',
        validationErrors,
        { requestId: '123', timestamp: '2024-01-01' },
      );

      expect(exception.context?.validationErrors).toEqual(validationErrors);
      expect(exception.context?.requestId).toBe('123');
      expect(exception.context?.timestamp).toBe('2024-01-01');
    });

    it('should handle empty validation errors array', () => {
      const exception = new ValidationException(
        'Validation failed',
        [],
      );

      expect(exception.validationErrors).toEqual([]);
      expect(exception.context?.validationErrors).toEqual([]);
    });
  });

  describe('fromSingleError static method', () => {
    it('should create exception from single error with field', () => {
      const exception = ValidationException.fromSingleError(
        'URL is required',
        'url',
        'REQUIRED',
      );

      expect(exception.message).toBe('URL is required');
      expect(exception.validationErrors).toHaveLength(1);
      expect(exception.validationErrors[0]).toEqual({
        field: 'url',
        message: 'URL is required',
        code: 'REQUIRED',
      });
      expect(exception.isRecoverable).toBe(false);
    });

    it('should create exception from single error without field', () => {
      const exception = ValidationException.fromSingleError(
        'Invalid input',
      );

      expect(exception.validationErrors).toHaveLength(1);
      expect(exception.validationErrors[0]).toEqual({
        message: 'Invalid input',
      });
    });

    it('should include additional context when provided', () => {
      const exception = ValidationException.fromSingleError(
        'Invalid API key',
        'apiKey',
        'INVALID',
        { requestId: '123' },
      );

      expect(exception.context?.validationErrors).toBeDefined();
      expect(exception.context?.requestId).toBe('123');
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new ValidationException(
        'Test',
        [{ message: 'Error' }],
      );

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new ValidationException(
        'Test',
        [{ message: 'Error' }],
      );

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should be an instance of ValidationException', () => {
      const exception = new ValidationException(
        'Test',
        [{ message: 'Error' }],
      );

      expect(exception instanceof ValidationException).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with all properties', () => {
      const validationErrors = [
        { field: 'url', message: 'URL is required' },
      ];

      const exception = new ValidationException(
        'Validation failed',
        validationErrors,
        { requestId: '123' },
      );

      const json = exception.toJSON();

      expect(json.name).toBe('ValidationException');
      expect(json.message).toBe('Validation failed');
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.category).toBe(ErrorCategory.VALIDATION);
      expect(json.isRecoverable).toBe(false);
      expect(json.context?.validationErrors).toEqual(validationErrors);
      expect(json.context?.requestId).toBe('123');
    });

    it('should return formatted string representation', () => {
      const validationErrors = [
        { field: 'captchaType', message: 'Invalid type' },
      ];

      const exception = new ValidationException(
        'Validation failed',
        validationErrors,
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('ValidationException [VALIDATION_ERROR]');
      expect(stringRep).toContain('Category: VALIDATION');
      expect(stringRep).toContain('Recoverable: false');
      expect(stringRep).toContain('Message: Validation failed');
      expect(stringRep).toContain('validationErrors');
    });
  });

  describe('Error handling', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new ValidationException('Test', [{ message: 'Error' }]);
      }).toThrow(ValidationException);

      try {
        throw new ValidationException('Test', [{ message: 'Error' }]);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationException);
        expect(error).toBeInstanceOf(CaptchaSolverException);
        if (error instanceof ValidationException) {
          expect(error.validationErrors).toHaveLength(1);
          expect(error.isRecoverable).toBe(false);
        }
      }
    });
  });
});

