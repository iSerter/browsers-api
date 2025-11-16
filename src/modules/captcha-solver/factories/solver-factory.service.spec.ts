import { Test, TestingModule } from '@nestjs/testing';
import { SolverFactory } from './solver-factory.service';
import { SolverRegistry } from './solver-registry.service';
import { SolverPerformanceTracker } from './solver-performance-tracker.service';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { ICaptchaSolver, CaptchaParams, CaptchaSolution } from '../interfaces/captcha-solver.interface';

describe('SolverFactory', () => {
  let factory: SolverFactory;
  let solverRegistry: jest.Mocked<SolverRegistry>;
  let performanceTracker: jest.Mocked<SolverPerformanceTracker>;
  let widgetInteraction: jest.Mocked<CaptchaWidgetInteractionService>;

  // Mock solver class
  class MockSolver implements ICaptchaSolver {
    constructor(public name: string) {}

    async solve(params: CaptchaParams): Promise<CaptchaSolution> {
      return {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: this.name,
      };
    }

    getName(): string {
      return this.name;
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }
  }

  beforeEach(async () => {
    const mockSolverRegistry = {
      get: jest.fn(),
      getSolversByPriority: jest.fn(),
      getSolversForChallengeType: jest.fn(),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };

    const mockPerformanceTracker = {
      recordAttempt: jest.fn(),
      getStats: jest.fn(),
    };

    const mockWidgetInteraction = {
      interactWithWidget: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolverFactory,
        {
          provide: SolverRegistry,
          useValue: mockSolverRegistry,
        },
        {
          provide: SolverPerformanceTracker,
          useValue: mockPerformanceTracker,
        },
        {
          provide: CaptchaWidgetInteractionService,
          useValue: mockWidgetInteraction,
        },
      ],
    }).compile();

    factory = module.get<SolverFactory>(SolverFactory);
    solverRegistry = module.get(SolverRegistry);
    performanceTracker = module.get(SolverPerformanceTracker);
    widgetInteraction = module.get(CaptchaWidgetInteractionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSolver', () => {
    it('should create solver instance for registered type', () => {
      const metadata = {
        solverType: 'test-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.get.mockReturnValue(metadata);

      const solver = factory.createSolver('test-solver', 'test-name');

      expect(solver).toBeInstanceOf(MockSolver);
      expect(solver?.getName()).toBe('test-name');
    });

    it('should return null for unregistered solver type', () => {
      solverRegistry.get.mockReturnValue(undefined);

      const solver = factory.createSolver('unknown-solver');

      expect(solver).toBeNull();
    });

    it('should return null for disabled solver', () => {
      const metadata = {
        solverType: 'disabled-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: false,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.get.mockReturnValue(metadata);

      const solver = factory.createSolver('disabled-solver');

      expect(solver).toBeNull();
    });

    it('should handle constructor errors gracefully', () => {
      class FailingSolver {
        constructor() {
          throw new Error('Constructor failed');
        }
      }

      const metadata = {
        solverType: 'failing-solver',
        constructor: FailingSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.get.mockReturnValue(metadata);

      const solver = factory.createSolver('failing-solver');

      expect(solver).toBeNull();
    });
  });

  describe('selectBestSolver', () => {
    it('should select solver with highest score', () => {
      const metadata1 = {
        solverType: 'solver1',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.5,
          isEnabled: true,
          priority: 50,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      const metadata2 = {
        solverType: 'solver2',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.9,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversByPriority.mockReturnValue([
        metadata1,
        metadata2,
      ]);
      performanceTracker.getStats.mockReturnValue({
        successRate: 0.9,
        totalAttempts: 10,
        lastSuccessfulAttempt: new Date(),
      });

      const selected = factory.selectBestSolver('recaptcha');

      expect(selected).toBe('solver2');
    });

    it('should return null when no solvers available', () => {
      solverRegistry.getSolversByPriority.mockReturnValue([]);

      const selected = factory.selectBestSolver('recaptcha');

      expect(selected).toBeNull();
    });

    it('should consider health status in scoring', () => {
      const healthyMetadata = {
        solverType: 'healthy-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      const unhealthyMetadata = {
        solverType: 'unhealthy-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'unhealthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversByPriority.mockReturnValue([
        healthyMetadata,
        unhealthyMetadata,
      ]);
      performanceTracker.getStats.mockReturnValue(null);

      const selected = factory.selectBestSolver('recaptcha');

      expect(selected).toBe('healthy-solver');
    });
  });

  describe('solveWithFallback', () => {
    it('should solve using first available solver', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-sitekey',
      };

      const metadata = {
        solverType: 'test-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversByPriority.mockReturnValue([metadata]);
      solverRegistry.get.mockReturnValue(metadata);

      const solution = await factory.solveWithFallback(params);

      expect(solution.token).toBe('test-token');
      expect(solution.solverId).toBe('test-solver');
      expect(solverRegistry.recordSuccess).toHaveBeenCalledWith('test-solver');
      expect(performanceTracker.recordAttempt).toHaveBeenCalled();
    });

    it('should fallback to next solver on failure', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-sitekey',
      };

      class FailingSolver implements ICaptchaSolver {
        async solve(): Promise<CaptchaSolution> {
          throw new Error('Solver failed');
        }
        getName() {
          return 'failing-solver';
        }
        async isAvailable() {
          return true;
        }
      }

      const failingMetadata = {
        solverType: 'failing-solver',
        constructor: FailingSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      const workingMetadata = {
        solverType: 'working-solver',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 90,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversByPriority.mockReturnValue([
        failingMetadata,
        workingMetadata,
      ]);
      solverRegistry.get
        .mockReturnValueOnce(failingMetadata)
        .mockReturnValueOnce(workingMetadata);

      const solution = await factory.solveWithFallback(params);

      expect(solution.solverId).toBe('working-solver');
      expect(solverRegistry.recordFailure).toHaveBeenCalledWith(
        'failing-solver',
      );
      expect(solverRegistry.recordSuccess).toHaveBeenCalledWith(
        'working-solver',
      );
    });

    it('should throw error when all solvers fail', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-sitekey',
      };

      class FailingSolver implements ICaptchaSolver {
        async solve(): Promise<CaptchaSolution> {
          throw new Error('Solver failed');
        }
        getName() {
          return 'failing-solver';
        }
        async isAvailable() {
          return true;
        }
      }

      const metadata = {
        solverType: 'failing-solver',
        constructor: FailingSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversByPriority.mockReturnValue([metadata]);
      solverRegistry.get.mockReturnValue(metadata);

      await expect(factory.solveWithFallback(params)).rejects.toThrow(
        'All solvers failed',
      );
    });

    it('should throw error when no solvers available', async () => {
      const params: CaptchaParams = {
        type: 'recaptcha',
        url: 'https://example.com',
        sitekey: 'test-sitekey',
      };

      solverRegistry.getSolversByPriority.mockReturnValue([]);

      await expect(factory.solveWithFallback(params)).rejects.toThrow(
        'No enabled solvers found',
      );
    });
  });

  describe('getAvailableSolvers', () => {
    it('should return available solvers for challenge type', () => {
      const metadata1 = {
        solverType: 'solver1',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 100,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      const metadata2 = {
        solverType: 'solver2',
        constructor: MockSolver,
        capabilities: {
          supportedChallengeTypes: ['recaptcha'],
          maxConcurrency: 10,
          averageResponseTime: 5000,
          successRate: 0.8,
          isEnabled: true,
          priority: 90,
        },
        healthStatus: 'healthy' as const,
        consecutiveFailures: 0,
        totalUses: 0,
        totalFailures: 0,
      };

      solverRegistry.getSolversForChallengeType.mockReturnValue([
        metadata1,
        metadata2,
      ]);

      const available = factory.getAvailableSolvers('recaptcha');

      expect(available).toEqual(['solver1', 'solver2']);
    });

    it('should return empty array when no solvers available', () => {
      solverRegistry.getSolversForChallengeType.mockReturnValue([]);

      const available = factory.getAvailableSolvers('recaptcha');

      expect(available).toEqual([]);
    });
  });
});

