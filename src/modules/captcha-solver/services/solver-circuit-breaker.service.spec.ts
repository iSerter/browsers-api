import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SolverCircuitBreakerService, CircuitState } from './solver-circuit-breaker.service';
import { CaptchaSolverConfigService } from '../config';

describe('SolverCircuitBreakerService', () => {
  let service: SolverCircuitBreakerService;
  let configService: jest.Mocked<CaptchaSolverConfigService>;

  const mockConfigService = {
    getCircuitBreakerConfig: jest.fn().mockReturnValue({
      failureThreshold: 3,
      timeoutPeriod: 60000, // 1 minute
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolverCircuitBreakerService,
        {
          provide: CaptchaSolverConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SolverCircuitBreakerService>(
      SolverCircuitBreakerService,
    );
    configService = module.get(CaptchaSolverConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordSuccess', () => {
    it('should reset failure count and close circuit', () => {
      const solverType = 'test-solver';

      // Record some failures first
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType); // Opens circuit

      // Record success
      service.recordSuccess(solverType);

      const state = service.getStateDetails(solverType);
      expect(state).toBeDefined();
      expect(state?.state).toBe(CircuitState.CLOSED);
      expect(state?.consecutiveFailures).toBe(0);
      expect(state?.lastFailureTime).toBe(0);
    });

    it('should transition from OPEN to CLOSED on success', () => {
      const solverType = 'test-solver';

      // Open the circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.OPEN);

      // Record success
      service.recordSuccess(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN to CLOSED on success', () => {
      const solverType = 'test-solver';

      // Open the circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Wait for timeout (simulate by manually setting nextAttemptTime)
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000; // Past time
      }

      // Check availability (transitions to HALF_OPEN)
      service.isAvailable(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      // Record success
      service.recordSuccess(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.CLOSED);
    });

    it('should reset all failure tracking on success', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);

      const beforeState = service.getStateDetails(solverType);
      expect(beforeState?.consecutiveFailures).toBe(2);

      service.recordSuccess(solverType);

      const afterState = service.getStateDetails(solverType);
      expect(afterState?.consecutiveFailures).toBe(0);
      expect(afterState?.lastFailureTime).toBe(0);
      expect(afterState?.nextAttemptTime).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);

      const state = service.getStateDetails(solverType);
      expect(state?.consecutiveFailures).toBe(2);
    });

    it('should open circuit when threshold is reached', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.CLOSED);

      service.recordFailure(solverType); // Third failure

      expect(service.getState(solverType)).toBe(CircuitState.OPEN);
    });

    it('should set nextAttemptTime when opening circuit', () => {
      const solverType = 'test-solver';
      const beforeTime = Date.now();

      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      const afterTime = Date.now();
      const state = service.getStateDetails(solverType);

      expect(state?.nextAttemptTime).toBeGreaterThanOrEqual(
        beforeTime + 60000,
      );
      expect(state?.nextAttemptTime).toBeLessThanOrEqual(afterTime + 60000);
    });

    it('should immediately open circuit from HALF_OPEN on failure', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Transition to half-open
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }
      service.isAvailable(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      // Record failure in half-open state
      service.recordFailure(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.OPEN);
    });

    it('should update lastFailureTime on each failure', () => {
      const solverType = 'test-solver';
      const beforeTime = Date.now();

      service.recordFailure(solverType);

      const afterTime = Date.now();
      const state = service.getStateDetails(solverType);

      expect(state?.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
      expect(state?.lastFailureTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('isAvailable', () => {
    it('should return true for solver with no state (new solver)', () => {
      const solverType = 'new-solver';

      expect(service.isAvailable(solverType)).toBe(true);
    });

    it('should return true when circuit is CLOSED', () => {
      const solverType = 'test-solver';

      // Circuit is closed by default
      expect(service.isAvailable(solverType)).toBe(true);
    });

    it('should return false when circuit is OPEN and timeout not elapsed', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      expect(service.isAvailable(solverType)).toBe(false);
    });

    it('should return true and transition to HALF_OPEN when timeout elapsed', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Manually set nextAttemptTime to past
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }

      const isAvailable = service.isAvailable(solverType);

      expect(isAvailable).toBe(true);
      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);
    });

    it('should return true when circuit is HALF_OPEN', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Transition to half-open
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }
      service.isAvailable(solverType);

      expect(service.isAvailable(solverType)).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker state to CLOSED', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.OPEN);

      // Reset
      service.reset(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.CLOSED);
    });

    it('should reset all failure tracking', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      service.reset(solverType);

      const state = service.getStateDetails(solverType);
      expect(state?.consecutiveFailures).toBe(0);
      expect(state?.lastFailureTime).toBe(0);
      expect(state?.nextAttemptTime).toBe(0);
    });

    it('should handle reset for non-existent solver gracefully', () => {
      const solverType = 'non-existent-solver';

      // Should not throw
      expect(() => service.reset(solverType)).not.toThrow();
    });
  });

  describe('getState', () => {
    it('should return null for solver with no state', () => {
      const solverType = 'new-solver';

      expect(service.getState(solverType)).toBeNull();
    });

    it('should return current state for solver', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      expect(service.getState(solverType)).toBe(CircuitState.OPEN);
    });
  });

  describe('getStateDetails', () => {
    it('should return null for solver with no state', () => {
      const solverType = 'new-solver';

      expect(service.getStateDetails(solverType)).toBeNull();
    });

    it('should return detailed state information', () => {
      const solverType = 'test-solver';

      service.recordFailure(solverType);
      service.recordFailure(solverType);

      const details = service.getStateDetails(solverType);

      expect(details).toBeDefined();
      expect(details?.state).toBe(CircuitState.CLOSED);
      expect(details?.consecutiveFailures).toBe(2);
      expect(details?.lastFailureTime).toBeGreaterThan(0);
    });
  });

  describe('getAllStates', () => {
    it('should return all solver states', () => {
      const solver1 = 'solver-1';
      const solver2 = 'solver-2';

      service.recordFailure(solver1);
      service.recordFailure(solver1);
      service.recordFailure(solver1); // Opens circuit

      service.recordFailure(solver2);

      const allStates = service.getAllStates();

      expect(allStates.size).toBe(2);
      expect(allStates.has(solver1)).toBe(true);
      expect(allStates.has(solver2)).toBe(true);
      expect(allStates.get(solver1)?.state).toBe(CircuitState.OPEN);
      expect(allStates.get(solver2)?.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent failure recordings', () => {
      const solverType = 'test-solver';

      // Simulate concurrent failures
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(service.recordFailure(solverType)),
      );

      return Promise.all(promises).then(() => {
        const state = service.getStateDetails(solverType);
        expect(state?.consecutiveFailures).toBe(10);
        expect(state?.state).toBe(CircuitState.OPEN);
      });
    });

    it('should handle concurrent availability checks', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Set timeout to past
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }

      // Concurrent availability checks
      const results = Array.from({ length: 5 }, () =>
        service.isAvailable(solverType),
      );

      // All should return true (half-open allows one attempt)
      expect(results.every((r) => r === true)).toBe(true);
      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('configuration integration', () => {
    it('should use configuration from CaptchaSolverConfigService', () => {
      expect(configService.getCircuitBreakerConfig).toHaveBeenCalled();
    });

    it('should use custom failure threshold from config', () => {
      const customConfig = {
        failureThreshold: 5,
        timeoutPeriod: 120000,
      };

      mockConfigService.getCircuitBreakerConfig.mockReturnValueOnce(
        customConfig,
      );

      // Create new service instance with custom config
      const customService = new SolverCircuitBreakerService(configService);

      const solverType = 'test-solver';

      // Record 4 failures (should still be closed)
      customService.recordFailure(solverType);
      customService.recordFailure(solverType);
      customService.recordFailure(solverType);
      customService.recordFailure(solverType);

      expect(customService.getState(solverType)).toBe(CircuitState.CLOSED);

      // Fifth failure should open circuit
      customService.recordFailure(solverType);

      expect(customService.getState(solverType)).toBe(CircuitState.OPEN);
    });

    it('should use custom timeout period from config', () => {
      const customConfig = {
        failureThreshold: 3,
        timeoutPeriod: 30000, // 30 seconds
      };

      mockConfigService.getCircuitBreakerConfig.mockReturnValueOnce(
        customConfig,
      );

      const customService = new SolverCircuitBreakerService(configService);

      const solverType = 'test-solver';

      // Open circuit
      customService.recordFailure(solverType);
      customService.recordFailure(solverType);
      customService.recordFailure(solverType);

      const state = customService.getStateDetails(solverType);
      const expectedTimeout = state?.lastFailureTime
        ? state.lastFailureTime + 30000
        : 0;

      expect(state?.nextAttemptTime).toBeGreaterThanOrEqual(expectedTimeout);
    });
  });

  describe('state transitions', () => {
    it('should follow correct state transition: CLOSED -> OPEN -> HALF_OPEN -> CLOSED', () => {
      const solverType = 'test-solver';

      // Start: CLOSED
      expect(service.getState(solverType)).toBeNull(); // No state yet, treated as CLOSED

      // CLOSED -> OPEN
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.OPEN);

      // OPEN -> HALF_OPEN (after timeout)
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }
      service.isAvailable(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      // HALF_OPEN -> CLOSED (on success)
      service.recordSuccess(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.CLOSED);
    });

    it('should transition HALF_OPEN -> OPEN on failure', () => {
      const solverType = 'test-solver';

      // Open circuit
      service.recordFailure(solverType);
      service.recordFailure(solverType);
      service.recordFailure(solverType);

      // Transition to half-open
      const state = service['solverStates'].get(solverType);
      if (state) {
        state.nextAttemptTime = Date.now() - 1000;
      }
      service.isAvailable(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.HALF_OPEN);

      // Failure in half-open should open circuit
      service.recordFailure(solverType);
      expect(service.getState(solverType)).toBe(CircuitState.OPEN);
    });
  });
});

