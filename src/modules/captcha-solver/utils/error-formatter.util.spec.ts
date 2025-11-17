import {
  formatError,
  formatErrorForLogging,
  extractErrorMessage,
  extractErrorCode,
  isRecoverableError,
  createErrorSummary,
} from './error-formatter.util';
import { CaptchaSolverException, ErrorCategory } from '../exceptions/captcha-solver.exception';

describe('formatError', () => {
  it('should format CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test error',
      'TEST_ERROR',
      ErrorCategory.INTERNAL,
      false,
    );

    const formatted = formatError(error);
    expect(formatted).toContain('Test error');
    expect(formatted).toContain('TEST_ERROR');
  });

  it('should format standard Error', () => {
    const error = new Error('Standard error');
    const formatted = formatError(error);
    expect(formatted).toBe('Error: Standard error');
  });

  it('should format string error', () => {
    const formatted = formatError('String error');
    expect(formatted).toBe('String error');
  });

  it('should format object error with message', () => {
    const error = { message: 'Object error' };
    const formatted = formatError(error);
    expect(formatted).toBe('Object error');
  });

  it('should format unknown error type', () => {
    const error = { someProperty: 'value' };
    const formatted = formatError(error);
    expect(formatted).toBeTruthy();
  });
});

describe('formatErrorForLogging', () => {
  it('should format CaptchaSolverException for logging', () => {
    const error = new CaptchaSolverException(
      'Test error',
      'TEST_ERROR',
      ErrorCategory.INTERNAL,
      true,
      { key: 'value' },
    );

    const formatted = formatErrorForLogging(error, { operation: 'test' });

    expect(formatted.error).toBeDefined();
    expect(formatted.error.name).toBe('CaptchaSolverException');
    expect(formatted.error.message).toBe('Test error');
    expect(formatted.error.code).toBe('TEST_ERROR');
    expect(formatted.operation).toBe('test');
    expect(formatted.timestamp).toBeDefined();
  });

  it('should format standard Error for logging', () => {
    const error = new Error('Standard error');
    const formatted = formatErrorForLogging(error, { context: 'test' });

    expect(formatted.error).toBeDefined();
    expect(formatted.error.name).toBe('Error');
    expect(formatted.error.message).toBe('Standard error');
    expect(formatted.context).toBe('test');
  });

  it('should include additional context', () => {
    const error = new Error('Test');
    const formatted = formatErrorForLogging(error, {
      operation: 'solve',
      attempt: 2,
    });

    expect(formatted.operation).toBe('solve');
    expect(formatted.attempt).toBe(2);
  });
});

describe('extractErrorMessage', () => {
  it('should extract message from CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test message',
      'TEST',
      ErrorCategory.INTERNAL,
    );
    expect(extractErrorMessage(error)).toBe('Test message');
  });

  it('should extract message from Error', () => {
    const error = new Error('Error message');
    expect(extractErrorMessage(error)).toBe('Error message');
  });

  it('should extract message from string', () => {
    expect(extractErrorMessage('String message')).toBe('String message');
  });

  it('should extract message from object', () => {
    const error = { message: 'Object message' };
    expect(extractErrorMessage(error)).toBe('Object message');
  });

  it('should return default for unknown error', () => {
    expect(extractErrorMessage(null)).toBe('Unknown error');
  });
});

describe('extractErrorCode', () => {
  it('should extract code from CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test',
      'TEST_CODE',
      ErrorCategory.INTERNAL,
    );
    expect(extractErrorCode(error)).toBe('TEST_CODE');
  });

  it('should extract code from object', () => {
    const error = { code: 'OBJECT_CODE' };
    expect(extractErrorCode(error)).toBe('OBJECT_CODE');
  });

  it('should return undefined for error without code', () => {
    const error = new Error('No code');
    expect(extractErrorCode(error)).toBeUndefined();
  });
});

describe('isRecoverableError', () => {
  it('should return true for recoverable CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test',
      'TEST',
      ErrorCategory.INTERNAL,
      true, // isRecoverable
    );
    expect(isRecoverableError(error)).toBe(true);
  });

  it('should return false for non-recoverable CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test',
      'TEST',
      ErrorCategory.INTERNAL,
      false, // isRecoverable
    );
    expect(isRecoverableError(error)).toBe(false);
  });

  it('should return false for unknown error types', () => {
    const error = new Error('Unknown error');
    expect(isRecoverableError(error)).toBe(false);
  });
});

describe('createErrorSummary', () => {
  it('should create summary from CaptchaSolverException', () => {
    const error = new CaptchaSolverException(
      'Test error',
      'TEST_CODE',
      ErrorCategory.INTERNAL,
      true,
      { key: 'value' },
    );

    const summary = createErrorSummary(error, { operation: 'test' });

    expect(summary.message).toBe('Test error');
    expect(summary.code).toBe('TEST_CODE');
    expect(summary.recoverable).toBe(true);
    expect(summary.operation).toBe('test');
  });

  it('should create summary from standard Error', () => {
    const error = new Error('Standard error');
    const summary = createErrorSummary(error, { attempt: 1 });

    expect(summary.message).toBe('Standard error');
    expect(summary.code).toBeUndefined();
    expect(summary.recoverable).toBe(false);
    expect(summary.attempt).toBe(1);
  });

  it('should include all additional context', () => {
    const error = new Error('Test');
    const summary = createErrorSummary(error, {
      operation: 'solve',
      provider: 'test-provider',
      attempt: 2,
    });

    expect(summary.operation).toBe('solve');
    expect(summary.provider).toBe('test-provider');
    expect(summary.attempt).toBe(2);
  });
});

