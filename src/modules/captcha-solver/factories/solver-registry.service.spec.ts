import { Test, TestingModule } from '@nestjs/testing';
import { SolverRegistry } from './solver-registry.service';
import { ICaptchaSolver, CaptchaParams, CaptchaSolution } from '../interfaces/captcha-solver.interface';
import { SolverCapability } from './interfaces/solver-capability.interface';

describe('SolverRegistry', () => {
  let registry: SolverRegistry;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolverRegistry],
    }).compile();

    registry = module.get<SolverRegistry>(SolverRegistry);
  });

  afterEach(() => {
    registry.clear();
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
});

