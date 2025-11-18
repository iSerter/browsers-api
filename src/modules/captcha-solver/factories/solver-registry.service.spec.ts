import { Test, TestingModule } from '@nestjs/testing';
import { SolverRegistry } from './solver-registry.service';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { SolverCapability } from './interfaces/solver-capability.interface';
import {
  SolverCircuitBreakerService,
  CircuitState,
} from '../services/solver-circuit-breaker.service';

describe('SolverRegistry', () => {
  let registry: SolverRegistry;
  let mockCircuitBreaker: jest.Mocked<SolverCircuitBreakerService>;

  class MockSolver implements ICaptchaSolver {
    constructor(public name: string) {}

    async solve(params: CaptchaParams): Promise<CaptchaSolution> {
      return {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'test-id',
      };
    }

    getName(): string {
      return this.name;
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }
  }

  const mockCapabilities: SolverCapability = {
    supportedChallengeTypes: ['recaptcha', 'hcaptcha'],
    maxConcurrency: 10,
    averageResponseTime: 5000,
    successRate: 0.9,
    isEnabled: true,
    priority: 1,
  };

  beforeEach(async () => {
    // Create comprehensive mock for SolverCircuitBreakerService
    mockCircuitBreaker = {
      isAvailable: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn().mockReturnValue(null),
      getStateDetails: jest.fn().mockReturnValue(null),
      reset: jest.fn(),
      getAllStates: jest.fn().mockReturnValue(new Map()),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolverRegistry,
        {
          provide: SolverCircuitBreakerService,
          useValue: mockCircuitBreaker,
        },
      ],
    }).compile();

    registry = module.get<SolverRegistry>(SolverRegistry);
  });

  afterEach(() => {
    if (registry) {
      registry.clear();
    }
    // Clear mock call history but keep implementations
    if (mockCircuitBreaker) {
      mockCircuitBreaker.isAvailable.mockClear();
      mockCircuitBreaker.getState.mockClear();
      mockCircuitBreaker.getStateDetails.mockClear();
      mockCircuitBreaker.recordSuccess.mockClear();
      mockCircuitBreaker.recordFailure.mockClear();
      mockCircuitBreaker.reset.mockClear();
      mockCircuitBreaker.getAllStates.mockClear();
      // Ensure default return values are set
      mockCircuitBreaker.isAvailable.mockReturnValue(true);
      mockCircuitBreaker.getState.mockReturnValue(null);
      mockCircuitBreaker.getStateDetails.mockReturnValue(null);
      mockCircuitBreaker.getAllStates.mockReturnValue(new Map());
    }
  });

  describe('register', () => {
    it('should register a solver', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);

      expect(registry.has('test-solver')).toBe(true);
      expect(registry.get('test-solver')).toBeDefined();
    });

    it('should overwrite existing solver registration', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);
      const newCapabilities = { ...mockCapabilities, priority: 2 };
      registry.register('test-solver', MockSolver, newCapabilities);

      const metadata = registry.get('test-solver');
      expect(metadata?.capabilities.priority).toBe(2);
    });
  });

  describe('get', () => {
    it('should return solver metadata', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);
      const metadata = registry.get('test-solver');

      expect(metadata).toBeDefined();
      expect(metadata?.solverType).toBe('test-solver');
      expect(metadata?.capabilities).toEqual(mockCapabilities);
    });

    it('should return undefined for non-existent solver', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getSolversForChallengeType', () => {
    it('should return solvers that support the challenge type', () => {
      registry.register('solver1', MockSolver, {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
      });
      registry.register('solver2', MockSolver, {
        ...mockCapabilities,
        supportedChallengeTypes: ['hcaptcha'],
      });

      const solvers = registry.getSolversForChallengeType('recaptcha');
      expect(solvers).toHaveLength(1);
      expect(solvers[0].solverType).toBe('solver1');
    });

    it('should only return enabled solvers', () => {
      registry.register('solver1', MockSolver, {
        ...mockCapabilities,
        isEnabled: true,
      });
      registry.register('solver2', MockSolver, {
        ...mockCapabilities,
        isEnabled: false,
      });

      const solvers = registry.getSolversForChallengeType('recaptcha');
      expect(solvers).toHaveLength(1);
      expect(solvers[0].solverType).toBe('solver1');
    });
  });

  describe('getSolversByPriority', () => {
    it('should sort solvers by priority', () => {
      registry.register('solver1', MockSolver, {
        ...mockCapabilities,
        priority: 1,
        healthStatus: 'healthy',
      });
      registry.register('solver2', MockSolver, {
        ...mockCapabilities,
        priority: 2,
        healthStatus: 'healthy',
      });

      const solvers = registry.getSolversByPriority('recaptcha');
      expect(solvers[0].solverType).toBe('solver2'); // Higher priority first
      expect(solvers[1].solverType).toBe('solver1');
    });

    it('should prioritize healthy solvers', () => {
      registry.register('solver1', MockSolver, {
        ...mockCapabilities,
        priority: 2,
      });
      registry.register('solver2', MockSolver, {
        ...mockCapabilities,
        priority: 1,
      });

      // Set health status manually
      registry.updateHealthStatus('solver1', 'unhealthy');
      registry.updateHealthStatus('solver2', 'healthy');

      const solvers = registry.getSolversByPriority('recaptcha');
      expect(solvers[0].solverType).toBe('solver2'); // Healthy first
    });
  });

  describe('recordSuccess', () => {
    it('should update solver metadata on success', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);
      registry.recordSuccess('test-solver');

      const metadata = registry.get('test-solver');
      expect(metadata?.lastSuccessfulUse).toBeDefined();
      expect(metadata?.consecutiveFailures).toBe(0);
      expect(metadata?.totalUses).toBe(1);
      expect(metadata?.healthStatus).toBe('healthy');
    });
  });

  describe('recordFailure', () => {
    it('should update solver metadata on failure', () => {
      registry.register('test-solver', MockSolver, {
        ...mockCapabilities,
        healthStatus: 'healthy',
      });
      registry.recordFailure('test-solver');

      const metadata = registry.get('test-solver');
      expect(metadata?.lastFailure).toBeDefined();
      expect(metadata?.consecutiveFailures).toBe(1);
      expect(metadata?.totalUses).toBe(1);
      expect(metadata?.totalFailures).toBe(1);
    });

    it('should mark solver as unhealthy after 3 consecutive failures', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);

      registry.recordFailure('test-solver');
      registry.recordFailure('test-solver');
      registry.recordFailure('test-solver');

      const metadata = registry.get('test-solver');
      expect(metadata?.healthStatus).toBe('unhealthy');
    });
  });

  describe('enable/disable', () => {
    it('should enable a solver', () => {
      registry.register('test-solver', MockSolver, {
        ...mockCapabilities,
        isEnabled: false,
      });
      registry.enable('test-solver');

      const metadata = registry.get('test-solver');
      expect(metadata?.capabilities.isEnabled).toBe(true);
    });

    it('should disable a solver', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);
      registry.disable('test-solver');

      const metadata = registry.get('test-solver');
      expect(metadata?.capabilities.isEnabled).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove a solver from registry', () => {
      registry.register('test-solver', MockSolver, mockCapabilities);
      registry.unregister('test-solver');

      expect(registry.has('test-solver')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registered solvers', () => {
      registry.register('solver1', MockSolver, mockCapabilities);
      registry.register('solver2', MockSolver, mockCapabilities);
      registry.clear();

      expect(registry.getCount()).toBe(0);
    });
  });

  describe('circuit breaker integration', () => {
    beforeEach(() => {
      // Clear registry to ensure clean state
      registry.clear();
      // Clear previous mock calls and ensure default return values
      mockCircuitBreaker.isAvailable.mockClear().mockReturnValue(true);
      mockCircuitBreaker.getState.mockClear().mockReturnValue(null);
      mockCircuitBreaker.getStateDetails.mockClear().mockReturnValue(null);
    });

    it('should return all solvers when circuit breaker allows all', () => {
      const capabilities1 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        isEnabled: true,
      };
      const capabilities2 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        isEnabled: true,
      };

      registry.register('solver1', MockSolver, capabilities1);
      registry.register('solver2', MockSolver, capabilities2);

      // Verify solvers are registered
      expect(registry.has('solver1')).toBe(true);
      expect(registry.has('solver2')).toBe(true);

      // Verify solver metadata
      const solver1Meta = registry.get('solver1');
      const solver2Meta = registry.get('solver2');
      expect(solver1Meta?.capabilities.isEnabled).toBe(true);
      expect(solver2Meta?.capabilities.isEnabled).toBe(true);
      expect(solver1Meta?.capabilities.supportedChallengeTypes).toContain(
        'recaptcha',
      );
      expect(solver2Meta?.capabilities.supportedChallengeTypes).toContain(
        'recaptcha',
      );

      // Verify solvers can be retrieved for challenge type
      const allSolvers = registry.getSolversForChallengeType('recaptcha');
      expect(allSolvers).toHaveLength(2);

      // Mock circuit breaker: all solvers available
      mockCircuitBreaker.isAvailable.mockReturnValue(true);

      const availableSolvers = registry.getAvailableSolvers('recaptcha');
      expect(availableSolvers).toHaveLength(2);
      expect(mockCircuitBreaker.isAvailable).toHaveBeenCalledWith('solver1');
      expect(mockCircuitBreaker.isAvailable).toHaveBeenCalledWith('solver2');
    });

    it('should filter solvers by circuit breaker availability in getAvailableSolvers', () => {
      const capabilities1 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        isEnabled: true,
      };
      const capabilities2 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        isEnabled: true,
      };

      registry.register('solver1', MockSolver, capabilities1);
      registry.register('solver2', MockSolver, capabilities2);

      // Mock circuit breaker: solver1 available, solver2 unavailable
      mockCircuitBreaker.isAvailable.mockImplementation(
        (solverType: string) => {
          return solverType === 'solver1';
        },
      );

      const availableSolvers = registry.getAvailableSolvers('recaptcha');
      expect(availableSolvers).toHaveLength(1);
      expect(availableSolvers[0].solverType).toBe('solver1');
      expect(mockCircuitBreaker.isAvailable).toHaveBeenCalledWith('solver1');
      expect(mockCircuitBreaker.isAvailable).toHaveBeenCalledWith('solver2');
    });

    it('should return empty array when all solvers are circuit-broken', () => {
      registry.register('solver1', MockSolver, {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
      });
      registry.register('solver2', MockSolver, {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
      });

      // Mock circuit breaker: all solvers unavailable
      mockCircuitBreaker.isAvailable.mockReturnValue(false);

      const availableSolvers = registry.getAvailableSolvers('recaptcha');
      expect(availableSolvers).toHaveLength(0);
    });

    it('should skip unavailable solvers in getSolversByPriority', () => {
      const capabilities1 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        priority: 1,
        isEnabled: true,
      };
      const capabilities2 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        priority: 2,
        isEnabled: true,
      };

      registry.register('solver1', MockSolver, capabilities1);
      registry.register('solver2', MockSolver, capabilities2);

      // Set health status manually
      registry.updateHealthStatus('solver1', 'healthy');
      registry.updateHealthStatus('solver2', 'healthy');

      // Mock circuit breaker: solver1 available, solver2 unavailable
      mockCircuitBreaker.isAvailable.mockImplementation(
        (solverType: string) => {
          return solverType === 'solver1';
        },
      );

      const solvers = registry.getSolversByPriority('recaptcha');
      expect(solvers).toHaveLength(1);
      expect(solvers[0].solverType).toBe('solver1');
    });

    it('should include circuit breaker state in getAllSolversForChallengeType', () => {
      const capabilities1 = {
        ...mockCapabilities,
        supportedChallengeTypes: ['recaptcha'],
        isEnabled: true,
      };

      registry.register('solver1', MockSolver, capabilities1);

      mockCircuitBreaker.isAvailable.mockReturnValue(true);
      mockCircuitBreaker.getState.mockReturnValue(CircuitState.CLOSED);

      const allSolvers = registry.getAllSolversForChallengeType('recaptcha');
      expect(allSolvers).toHaveLength(1);
      expect(allSolvers[0].circuitBreakerState).toBe(CircuitState.CLOSED);
      expect(allSolvers[0].isCircuitBreakerAvailable).toBe(true);
      expect(mockCircuitBreaker.getState).toHaveBeenCalledWith('solver1');
      expect(mockCircuitBreaker.isAvailable).toHaveBeenCalledWith('solver1');
    });

    it('should return circuit breaker states in getCircuitBreakerStates', () => {
      registry.register('solver1', MockSolver, mockCapabilities);

      mockCircuitBreaker.getState.mockReturnValue(CircuitState.CLOSED);
      mockCircuitBreaker.isAvailable.mockReturnValue(true);
      mockCircuitBreaker.getStateDetails.mockReturnValue({
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });

      const states = registry.getCircuitBreakerStates();
      expect(states).toHaveProperty('solver1');
      expect(states.solver1.state).toBe(CircuitState.CLOSED);
      expect(states.solver1.isAvailable).toBe(true);
      expect(states.solver1.details).toBeDefined();
      expect(mockCircuitBreaker.getState).toHaveBeenCalledWith('solver1');
      expect(mockCircuitBreaker.getStateDetails).toHaveBeenCalledWith(
        'solver1',
      );
    });
  });
});
