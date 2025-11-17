import {
  CaptchaSolverException,
  ErrorCategory,
} from './captcha-solver.exception';
import { SolverUnavailableException } from './solver-unavailable.exception';

describe('SolverUnavailableException', () => {
  describe('Constructor', () => {
    it('should create an exception with solver type and reason', () => {
      const exception = new SolverUnavailableException(
        'Solver is unavailable',
        'native',
        'circuit_breaker_open',
      );

      expect(exception.message).toBe('Solver is unavailable');
      expect(exception.solverType).toBe('native');
      expect(exception.reason).toBe('circuit_breaker_open');
      expect(exception.code).toBe('SOLVER_UNAVAILABLE');
      expect(exception.category).toBe(ErrorCategory.AVAILABILITY);
      expect(exception.isRecoverable).toBe(true);
    });

    it('should include solver type and reason in context', () => {
      const exception = new SolverUnavailableException(
        'Solver unavailable',
        '2captcha',
        'rate_limited',
      );

      expect(exception.context).toBeDefined();
      expect(exception.context?.solverType).toBe('2captcha');
      expect(exception.context?.reason).toBe('rate_limited');
    });

    it('should merge additional context', () => {
      const exception = new SolverUnavailableException(
        'Solver unavailable',
        'anti-captcha',
        'not_configured',
        { requestId: '123', attempt: 2 },
      );

      expect(exception.context?.solverType).toBe('anti-captcha');
      expect(exception.context?.reason).toBe('not_configured');
      expect(exception.context?.requestId).toBe('123');
      expect(exception.context?.attempt).toBe(2);
    });
  });

  describe('Inheritance', () => {
    it('should be an instance of Error', () => {
      const exception = new SolverUnavailableException(
        'Test',
        'native',
        'circuit_breaker_open',
      );

      expect(exception instanceof Error).toBe(true);
    });

    it('should be an instance of CaptchaSolverException', () => {
      const exception = new SolverUnavailableException(
        'Test',
        'native',
        'circuit_breaker_open',
      );

      expect(exception instanceof CaptchaSolverException).toBe(true);
    });

    it('should be an instance of SolverUnavailableException', () => {
      const exception = new SolverUnavailableException(
        'Test',
        'native',
        'circuit_breaker_open',
      );

      expect(exception instanceof SolverUnavailableException).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with all properties', () => {
      const exception = new SolverUnavailableException(
        'Solver unavailable',
        'native',
        'circuit_breaker_open',
        { requestId: '123' },
      );

      const json = exception.toJSON();

      expect(json.name).toBe('SolverUnavailableException');
      expect(json.message).toBe('Solver unavailable');
      expect(json.code).toBe('SOLVER_UNAVAILABLE');
      expect(json.category).toBe(ErrorCategory.AVAILABILITY);
      expect(json.isRecoverable).toBe(true);
      expect(json.context?.solverType).toBe('native');
      expect(json.context?.reason).toBe('circuit_breaker_open');
      expect(json.context?.requestId).toBe('123');
    });

    it('should return formatted string representation', () => {
      const exception = new SolverUnavailableException(
        'Solver unavailable',
        '2captcha',
        'rate_limited',
      );

      const stringRep = exception.toString();

      expect(stringRep).toContain('SolverUnavailableException [SOLVER_UNAVAILABLE]');
      expect(stringRep).toContain('Category: AVAILABILITY');
      expect(stringRep).toContain('Recoverable: true');
      expect(stringRep).toContain('Message: Solver unavailable');
      expect(stringRep).toContain('"solverType":"2captcha"');
      expect(stringRep).toContain('"reason":"rate_limited"');
    });
  });

  describe('Error handling', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new SolverUnavailableException(
          'Test',
          'native',
          'circuit_breaker_open',
        );
      }).toThrow(SolverUnavailableException);

      try {
        throw new SolverUnavailableException(
          'Test',
          'native',
          'circuit_breaker_open',
        );
      } catch (error) {
        expect(error).toBeInstanceOf(SolverUnavailableException);
        expect(error).toBeInstanceOf(CaptchaSolverException);
        if (error instanceof SolverUnavailableException) {
          expect(error.solverType).toBe('native');
          expect(error.reason).toBe('circuit_breaker_open');
          expect(error.isRecoverable).toBe(true);
        }
      }
    });
  });
});

