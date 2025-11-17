import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import { SolverOrchestrationService, OrchestrationConfig } from './solver-orchestration.service';
import { DetectionService } from './detection.service';
import { SolverFactory } from '../factories/solver-factory.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { CostTrackingService } from './cost-tracking.service';
import { ProviderRegistryService } from './provider-registry.service';
import { CaptchaLoggingService } from './captcha-logging.service';
import { CaptchaSolverConfigService } from '../config';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  MultiDetectionResult,
} from '../interfaces/detection.interface';

describe('SolverOrchestrationService', () => {
  let service: SolverOrchestrationService;
  let detectionService: jest.Mocked<DetectionService>;
  let solverFactory: jest.Mocked<SolverFactory>;
  let performanceTracker: jest.Mocked<SolverPerformanceTracker>;
  let costTracking: jest.Mocked<CostTrackingService>;
  let providerRegistry: jest.Mocked<ProviderRegistryService>;
  let configService: jest.Mocked<ConfigService>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(async () => {
    // Create mocks
    const mockDetectionService = {
      detectAll: jest.fn(),
    };

    const mockSolverFactory = {
      getAvailableSolvers: jest.fn().mockReturnValue([]),
      createSolver: jest.fn(),
    };

    const mockPerformanceTracker = {
      recordAttempt: jest.fn(),
    };

    const mockCostTracking = {
      recordSuccess: jest.fn(),
    };

    const mockProviderRegistry = {
      getAvailableProviders: jest.fn(),
      getProvider: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockCaptchaLogging = {
      logSolveAttempt: jest.fn(),
      logSolveSuccess: jest.fn(),
      logSolveFailure: jest.fn(),
      logSolving: jest.fn(),
    };

    const mockCaptchaConfig = {
      getRetryConfig: jest.fn().mockReturnValue({
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
      }),
      getTimeoutConfig: jest.fn().mockReturnValue({
        solveTimeout: 30000,
        detectionTimeout: 5000,
        widgetInteractionTimeout: 5000,
        audioTranscriptionTimeout: 30000,
      }),
      getSolverTimeoutConfig: jest.fn().mockReturnValue({
        recaptchaV2Checkbox: 30000,
        hcaptchaCheckbox: 30000,
        datadomeCaptcha: 60000,
      }),
      getDetectionConfig: jest.fn().mockReturnValue({
        minConfidenceThreshold: 0.5,
        minStrongConfidence: 0.7,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolverOrchestrationService,
        {
          provide: DetectionService,
          useValue: mockDetectionService,
        },
        {
          provide: SolverFactory,
          useValue: mockSolverFactory,
        },
        {
          provide: SolverPerformanceTracker,
          useValue: mockPerformanceTracker,
        },
        {
          provide: CostTrackingService,
          useValue: mockCostTracking,
        },
        {
          provide: ProviderRegistryService,
          useValue: mockProviderRegistry,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CaptchaLoggingService,
          useValue: mockCaptchaLogging,
        },
        {
          provide: CaptchaSolverConfigService,
          useValue: mockCaptchaConfig,
        },
      ],
    }).compile();

    service = module.get<SolverOrchestrationService>(SolverOrchestrationService);
    detectionService = module.get(DetectionService);
    solverFactory = module.get(SolverFactory);
    performanceTracker = module.get(SolverPerformanceTracker);
    costTracking = module.get(CostTrackingService);
    providerRegistry = module.get(ProviderRegistryService);
    configService = module.get(ConfigService);

    // Setup default config service mocks
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        CAPTCHA_MIN_CONFIDENCE: 0.5,
        CAPTCHA_ENABLE_THIRD_PARTY_FALLBACK: true,
        CAPTCHA_SOLVER_PRIORITY: ['native', '2captcha', 'anticaptcha'],
        CAPTCHA_MAX_RETRIES: '',
        CAPTCHA_TIMEOUTS: '',
      };
      return config[key] ?? defaultValue;
    });

    // Setup mock page
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers(); // Ensure we're using real timers after each test
  });

  describe('detectAndSolve', () => {
    it('should return solved=true when no anti-bot system is detected', async () => {
      const multiResult: MultiDetectionResult = {
        detections: [],
        primary: null,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(true);
      expect(result.attempts).toBe(0);
      expect(result.detection).toBeUndefined();
    });

    it('should detect and solve reCAPTCHA challenge with native solver', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(true);
      expect(result.solution).toEqual(solution);
      expect(result.solverType).toBe('native-solver');
      expect(result.usedThirdParty).toBe(false);
      expect(performanceTracker.recordAttempt).toHaveBeenCalledWith(
        'native-solver',
        'recaptcha',
        expect.any(Number),
        true,
      );
    });

    it('should fallback to 3rd party provider when native solver fails', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: '2captcha-123',
      };

      const mockThirdPartyProvider = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('2captcha'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const mockNativeSolver: ICaptchaSolver = {
        solve: jest.fn().mockRejectedValue(new Error('Native solver failed')),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockNativeSolver);
      providerRegistry.getAvailableProviders.mockResolvedValue([
        mockThirdPartyProvider,
      ]);
      // getProvider is called with the provider name from solverPriority
      providerRegistry.getProvider.mockImplementation((name: string) => {
        if (name === '2captcha') {
          return mockThirdPartyProvider;
        }
        return null;
      });

      const config: OrchestrationConfig = {
        maxRetries: { recaptcha: 1 }, // Reduce retries to speed up test
        enableThirdPartyFallback: true, // Explicitly enable fallback
        solverPriority: ['native', '2captcha', 'anticaptcha'], // Ensure 2captcha is in priority
      };

      const result = await service.detectAndSolve(mockPage, config);

      expect(result.solved).toBe(true);
      expect(result.solution).toEqual(solution);
      expect(result.solverType).toBe('2captcha');
      expect(result.usedThirdParty).toBe(true);
      expect(mockThirdPartyProvider.solve).toHaveBeenCalled();
      expect(costTracking.recordSuccess).toHaveBeenCalledWith(
        '2captcha',
        'recaptcha',
      );
    }, 15000);

    it('should return solved=false when all solvers fail', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const mockNativeSolver: ICaptchaSolver = {
        solve: jest.fn().mockRejectedValue(new Error('Native solver failed')),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const mockThirdPartyProvider = {
        solve: jest.fn().mockRejectedValue(new Error('3rd party failed')),
        getName: jest.fn().mockReturnValue('2captcha'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockNativeSolver);
      providerRegistry.getAvailableProviders.mockResolvedValue([
        mockThirdPartyProvider,
      ]);
      providerRegistry.getProvider.mockReturnValue(mockThirdPartyProvider);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(false);
      expect(result.error).toContain('All solving attempts failed');
      expect(result.attempts).toBeGreaterThan(0);
    });

    it('should handle timeout errors', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const timeoutIds: NodeJS.Timeout[] = [];
      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              // Use a longer timeout that will be cancelled by the service's timeout
              const id = setTimeout(() => {
                resolve({ token: 'too-late', solvedAt: new Date(), solverId: 'test' });
              }, 200);
              timeoutIds.push(id);
            }),
        ),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const config: OrchestrationConfig = {
        timeouts: { recaptcha: 50 }, // Very short timeout
        maxRetries: { recaptcha: 1 }, // Only one attempt to speed up
      };

      const result = await service.detectAndSolve(mockPage, config);

      // Clean up any hanging timeouts
      timeoutIds.forEach((id) => clearTimeout(id));

      expect(result.solved).toBe(false);
      // Timeout errors get caught and retried, so final error may be "All solving attempts failed"
      // but we can verify timeout occurred by checking the error or that it failed
      expect(result.error).toBeDefined();
      expect(result.attempts).toBeGreaterThan(0);
      // Verify that the solver was called (and should have timed out)
      expect(mockSolver.solve).toHaveBeenCalled();
    }, 15000);

    it('should respect retry configuration', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockRejectedValue(new Error('Solver failed')),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const config: OrchestrationConfig = {
        maxRetries: { recaptcha: 2 },
        enableThirdPartyFallback: false, // Disable fallback to speed up
      };

      await service.detectAndSolve(mockPage, config);

      // Should attempt 2 times
      expect(mockSolver.solve).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should skip 3rd party fallback when disabled', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const mockNativeSolver: ICaptchaSolver = {
        solve: jest.fn().mockRejectedValue(new Error('Native solver failed')),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockNativeSolver);

      const config: OrchestrationConfig = {
        enableThirdPartyFallback: false,
        maxRetries: { recaptcha: 1 }, // Reduce retries to speed up test
      };

      const result = await service.detectAndSolve(mockPage, config);

      expect(result.solved).toBe(false);
      expect(providerRegistry.getAvailableProviders).not.toHaveBeenCalled();
    }, 15000);

    it('should map Cloudflare detection to recaptcha challenge type', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.CLOUDFLARE,
        confidence: 0.9,
        details: {
          signals: [],
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(true);
      expect(mockSolver.solve).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recaptcha',
        }),
      );
    });

    it('should handle unsupported anti-bot system types', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.IMPERVA, // Maps to null in service
        confidence: 0.9,
        details: {
          signals: [],
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(false);
      expect(result.error).toContain('Unsupported anti-bot system');
    });

    it('should handle errors during detection phase', async () => {
      detectionService.detectAll.mockRejectedValue(
        new Error('Detection failed'),
      );

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(false);
      expect(result.error).toContain('Detection failed');
    });

    it('should track performance metrics for all attempts', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'test-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      await service.detectAndSolve(mockPage);

      expect(performanceTracker.recordAttempt).toHaveBeenCalledWith(
        'native-solver',
        'recaptcha',
        expect.any(Number),
        true,
      );
    });

    it('should extract sitekey from detection details', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'extracted-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      await service.detectAndSolve(mockPage);

      expect(mockSolver.solve).toHaveBeenCalledWith(
        expect.objectContaining({
          sitekey: 'extracted-sitekey',
        }),
      );
    });

    it('should handle hCAPTCHA challenges', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.HCAPTCHA,
        confidence: 0.9,
        details: {
          signals: [],
          metadata: { sitekey: 'hcaptcha-sitekey' },
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(true);
      expect(mockSolver.solve).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hcaptcha',
        }),
      );
    });

    it('should handle DataDome challenges', async () => {
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.DATADOME,
        confidence: 0.9,
        details: {
          signals: [],
        },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const multiResult: MultiDetectionResult = {
        detections: [detectionResult],
        primary: detectionResult,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      const solution: CaptchaSolution = {
        token: 'test-token',
        solvedAt: new Date(),
        solverId: 'native-solver',
      };

      const mockSolver: ICaptchaSolver = {
        solve: jest.fn().mockResolvedValue(solution),
        getName: jest.fn().mockReturnValue('native-solver'),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      detectionService.detectAll.mockResolvedValue(multiResult);
      solverFactory.getAvailableSolvers.mockReturnValue(['native-solver']);
      solverFactory.createSolver.mockReturnValue(mockSolver);

      const result = await service.detectAndSolve(mockPage);

      expect(result.solved).toBe(true);
      expect(mockSolver.solve).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'datadome',
        }),
      );
    });
  });
});

