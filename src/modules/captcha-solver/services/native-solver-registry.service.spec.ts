import { Test, TestingModule } from '@nestjs/testing';
import { NativeSolverRegistryService } from './native-solver-registry.service';
import { SolverRegistry } from '../factories/solver-registry.service';
import { CaptchaSolverException } from '../exceptions/captcha-solver.exception';

describe('NativeSolverRegistryService', () => {
  let service: NativeSolverRegistryService;
  let solverRegistry: jest.Mocked<SolverRegistry>;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    const mockSolverRegistry = {
      register: jest.fn(),
      get: jest.fn(),
      getSolversByPriority: jest.fn(),
      getSolversForChallengeType: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NativeSolverRegistryService,
        {
          provide: SolverRegistry,
          useValue: mockSolverRegistry,
        },
      ],
    }).compile();

    service = module.get<NativeSolverRegistryService>(
      NativeSolverRegistryService,
    );
    solverRegistry = module.get(SolverRegistry);

    // Spy on logger methods
    loggerErrorSpy = jest.spyOn(service['logger'], 'error');
    loggerLogSpy = jest.spyOn(service['logger'], 'log');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize and register all native solvers', async () => {
      await service.onModuleInit();

      // Should register 5 native solvers: turnstile, recaptcha, hcaptcha, datadome, akamai
      expect(solverRegistry.register).toHaveBeenCalledTimes(5);
    });

    it('should register TurnstileSolver with correct capabilities', async () => {
      await service.onModuleInit();

      const turnstileCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'turnstile-native',
      );

      expect(turnstileCall).toBeDefined();
      expect(turnstileCall![1]).toBeDefined(); // Constructor
      expect(turnstileCall![2]).toMatchObject({
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.7,
        isEnabled: true,
        priority: 100,
        metadata: {
          solverType: 'native',
          name: 'Turnstile Native Solver',
        },
      });
    });

    it('should register NativeRecaptchaSolver with correct capabilities', async () => {
      await service.onModuleInit();

      const recaptchaCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'recaptcha-native',
      );

      expect(recaptchaCall).toBeDefined();
      expect(recaptchaCall![2]).toMatchObject({
        supportedChallengeTypes: ['recaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 15000,
        successRate: 0.6,
        isEnabled: true,
        priority: 100,
        metadata: {
          solverType: 'native',
          name: 'Native reCAPTCHA Solver',
        },
      });
    });

    it('should register NativeHcaptchaSolver with correct capabilities', async () => {
      await service.onModuleInit();

      const hcaptchaCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'hcaptcha-native',
      );

      expect(hcaptchaCall).toBeDefined();
      expect(hcaptchaCall![2]).toMatchObject({
        supportedChallengeTypes: ['hcaptcha'],
        maxConcurrency: 10,
        averageResponseTime: 15000,
        successRate: 0.6,
        isEnabled: true,
        priority: 100,
        metadata: {
          solverType: 'native',
          name: 'Native hCAPTCHA Solver',
        },
      });
    });

    it('should register NativeDataDomeSolver with correct capabilities', async () => {
      await service.onModuleInit();

      const datadomeCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'datadome-native',
      );

      expect(datadomeCall).toBeDefined();
      expect(datadomeCall![2]).toMatchObject({
        supportedChallengeTypes: ['datadome'],
        maxConcurrency: 10,
        averageResponseTime: 20000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
        metadata: {
          solverType: 'native',
          name: 'Native DataDome Solver',
        },
      });
    });

    it('should register NativeAkamaiSolver with correct capabilities', async () => {
      await service.onModuleInit();

      const akamaiCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'akamai-native',
      );

      expect(akamaiCall).toBeDefined();
      expect(akamaiCall![2]).toMatchObject({
        supportedChallengeTypes: ['akamai'],
        maxConcurrency: 10,
        averageResponseTime: 5000,
        successRate: 0.5,
        isEnabled: true,
        priority: 100,
        metadata: {
          solverType: 'native',
          name: 'Native Akamai Bot Manager Solver',
        },
      });
    });

    it('should set high priority (100) for all native solvers', async () => {
      await service.onModuleInit();

      const allCalls = solverRegistry.register.mock.calls;
      allCalls.forEach((call) => {
        expect(call[2].priority).toBe(100);
      });
    });

    it('should enable all native solvers by default', async () => {
      await service.onModuleInit();

      const allCalls = solverRegistry.register.mock.calls;
      allCalls.forEach((call) => {
        expect(call[2].isEnabled).toBe(true);
      });
    });
  });

  describe('Solver metadata', () => {
    it('should include correct metadata for TurnstileSolver', async () => {
      await service.onModuleInit();

      const turnstileCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'turnstile-native',
      );

      const metadata = turnstileCall![2].metadata;
      expect(metadata.description).toContain('Cloudflare Turnstile');
      expect(metadata.supportsWidgetModes).toContain('managed');
      expect(metadata.supportsWidgetModes).toContain('non-interactive');
    });

    it('should include correct metadata for NativeRecaptchaSolver', async () => {
      await service.onModuleInit();

      const recaptchaCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'recaptcha-native',
      );

      const metadata = recaptchaCall![2].metadata;
      expect(metadata.description).toContain('reCAPTCHA');
      expect(metadata.supportsVersions).toContain('v2');
      expect(metadata.supportsVersions).toContain('v3');
    });

    it('should include correct metadata for NativeHcaptchaSolver', async () => {
      await service.onModuleInit();

      const hcaptchaCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'hcaptcha-native',
      );

      const metadata = hcaptchaCall![2].metadata;
      expect(metadata.description).toContain('hCAPTCHA');
      expect(metadata.supportsChallengeTypes).toContain('checkbox');
    });

    it('should include correct metadata for NativeDataDomeSolver', async () => {
      await service.onModuleInit();

      const datadomeCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'datadome-native',
      );

      const metadata = datadomeCall![2].metadata;
      expect(metadata.description).toContain('DataDome');
      expect(metadata.supportsChallengeTypes).toContain('sensor_validation');
    });

    it('should include correct metadata for NativeAkamaiSolver', async () => {
      await service.onModuleInit();

      const akamaiCall = solverRegistry.register.mock.calls.find(
        (call) => call[0] === 'akamai-native',
      );

      const metadata = akamaiCall![2].metadata;
      expect(metadata.description).toContain('Akamai Bot Manager');
      expect(metadata.supportsChallengeLevels).toContain('level_1');
    });
  });

  describe('Error handling', () => {
    it('should handle registration errors gracefully', async () => {
      solverRegistry.register.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      // Should not throw, but log error
      await expect(service.onModuleInit()).resolves.not.toThrow();

      // Verify error was logged for each failed registration
      expect(loggerErrorSpy).toHaveBeenCalledTimes(5);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        expect.any(String),
      );
    });

    it('should handle CaptchaSolverException during registration', async () => {
      const captchaError = new CaptchaSolverException(
        'Solver registration failed',
        'REGISTRATION_ERROR',
      );
      solverRegistry.register.mockImplementation(() => {
        throw captchaError;
      });

      await expect(service.onModuleInit()).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledTimes(5);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        expect.any(String),
      );
    });

    it('should handle non-Error exceptions during registration', async () => {
      solverRegistry.register.mockImplementation(() => {
        throw 'String error';
      });

      await expect(service.onModuleInit()).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledTimes(5);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        undefined,
      );
    });

    it('should continue registering other solvers when one fails', async () => {
      let callCount = 0;
      solverRegistry.register.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second registration failed');
        }
      });

      await expect(service.onModuleInit()).resolves.not.toThrow();

      // Should attempt to register all 5 solvers
      expect(solverRegistry.register).toHaveBeenCalledTimes(5);
      // Should log error for the failed one
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register NativeRecaptchaSolver'),
        expect.any(String),
      );
      // Should log success for others
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Registered'),
      );
    });

    it('should handle errors with stack traces correctly', async () => {
      const errorWithStack = new Error('Error with stack');
      errorWithStack.stack = 'Error: Error with stack\n    at test.js:1:1';

      solverRegistry.register.mockImplementation(() => {
        throw errorWithStack;
      });

      await expect(service.onModuleInit()).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        'Error: Error with stack\n    at test.js:1:1',
      );
    });
  });
});

