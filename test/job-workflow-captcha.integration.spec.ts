import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Page, Browser, BrowserContext } from 'playwright';
import { JobProcessorService } from '../src/modules/jobs/services/job-processor.service';
import { AutomationJob, JobStatus } from '../src/modules/jobs/entities/automation-job.entity';
import { BrowserPoolService } from '../src/modules/browsers/services/browser-pool.service';
import { BrowserContextManagerService } from '../src/modules/browsers/services/browser-context-manager.service';
import { ActionHandlerFactory } from '../src/modules/jobs/factories/action-handler.factory';
import { JobLogService } from '../src/modules/jobs/services/job-log.service';
import { WorkerManagerService } from '../src/modules/jobs/services/worker-manager.service';
import { JobEventsGateway } from '../src/modules/jobs/gateways/job-events.gateway';
import { SolverOrchestrationService, OrchestrationResult } from '../src/modules/captcha-solver/services/solver-orchestration.service';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
} from '../src/modules/captcha-solver/interfaces/detection.interface';
import { CaptchaSolution } from '../src/modules/captcha-solver/interfaces/captcha-solver.interface';

describe('Job Workflow with Captcha Solving (Integration)', () => {
  let jobProcessorService: JobProcessorService;
  let jobRepository: jest.Mocked<Repository<AutomationJob>>;
  let browserPoolService: jest.Mocked<BrowserPoolService>;
  let contextManager: jest.Mocked<BrowserContextManagerService>;
  let actionHandlerFactory: jest.Mocked<ActionHandlerFactory>;
  let jobLogService: jest.Mocked<JobLogService>;
  let workerManagerService: jest.Mocked<WorkerManagerService>;
  let jobEventsGateway: jest.Mocked<JobEventsGateway>;
  let solverOrchestrationService: jest.Mocked<SolverOrchestrationService>;

  let mockPage: jest.Mocked<Page>;
  let mockBrowser: jest.Mocked<Browser>;
  let mockContext: jest.Mocked<BrowserContext>;

  beforeEach(async () => {
    // Create mock page
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      goto: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(null),
      waitForSelector: jest.fn().mockResolvedValue(null),
      click: jest.fn().mockResolvedValue(null),
      fill: jest.fn().mockResolvedValue(null),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
    } as any;

    // Create mock browser context
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock browser
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock repositories
    const mockJobRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().returnThis(),
        andWhere: jest.fn().returnThis(),
        orderBy: jest.fn().returnThis(),
        take: jest.fn().returnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    // Create mock services
    const mockBrowserPoolService = {
      acquire: jest.fn().mockResolvedValue(mockBrowser),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const mockContextManager = {
      createContext: jest.fn().mockResolvedValue(mockContext),
      destroyContext: jest.fn().mockResolvedValue(undefined),
    };

    const mockActionHandlerFactory = {
      createHandler: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue({ success: true }),
      }),
    };

    const mockJobLogService = {
      createLog: jest.fn().mockResolvedValue(undefined),
    };

    const mockWorkerManagerService = {
      getAvailableWorkerCount: jest.fn().mockReturnValue(5),
    };

    const mockJobEventsGateway = {
      emitJobEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockSolverOrchestrationService = {
      detectAndSolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobProcessorService,
        {
          provide: getRepositoryToken(AutomationJob),
          useValue: mockJobRepository,
        },
        {
          provide: BrowserPoolService,
          useValue: mockBrowserPoolService,
        },
        {
          provide: BrowserContextManagerService,
          useValue: mockContextManager,
        },
        {
          provide: ActionHandlerFactory,
          useValue: mockActionHandlerFactory,
        },
        {
          provide: JobLogService,
          useValue: mockJobLogService,
        },
        {
          provide: WorkerManagerService,
          useValue: mockWorkerManagerService,
        },
        {
          provide: JobEventsGateway,
          useValue: mockJobEventsGateway,
        },
        {
          provide: SolverOrchestrationService,
          useValue: mockSolverOrchestrationService,
        },
      ],
    }).compile();

    jobProcessorService = module.get<JobProcessorService>(JobProcessorService);
    jobRepository = module.get(getRepositoryToken(AutomationJob));
    browserPoolService = module.get(BrowserPoolService);
    contextManager = module.get(BrowserContextManagerService);
    actionHandlerFactory = module.get(ActionHandlerFactory);
    jobLogService = module.get(JobLogService);
    workerManagerService = module.get(WorkerManagerService);
    jobEventsGateway = module.get(JobEventsGateway);
    solverOrchestrationService = module.get(SolverOrchestrationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Job execution with captcha solving', () => {
    let testJob: AutomationJob;

    beforeEach(() => {
      testJob = {
        id: 'test-job-id',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'navigate',
            url: 'https://example.com',
          },
        ],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        captchaConfig: {
          enabled: true,
          minConfidence: 0.5,
          enableThirdPartyFallback: true,
          solverPriority: ['native', '2captcha'],
          maxRetries: { recaptcha: 3 },
          timeouts: { recaptcha: 30000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;
    });

    it('should successfully execute job with captcha detection and solving', async () => {
      // Arrange
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: { sitekey: 'test-sitekey' },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const solution: CaptchaSolution = {
        token: 'test-token-123',
        success: true,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: true,
        solution,
        solverType: 'native-recaptcha-solver',
        duration: 5000,
        attempts: 1,
        usedThirdParty: false,
        detection: detectionResult,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalled();
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          minConfidence: 0.5,
          enableThirdPartyFallback: true,
          solverPriority: ['native', '2captcha'],
          maxRetries: { recaptcha: 3 },
          timeouts: { recaptcha: 30000 },
        }),
      );
      expect(result).toEqual({
        solved: true,
        solverType: 'native-recaptcha-solver',
        usedThirdParty: false,
        duration: 5000,
        attempts: 1,
        detection: detectionResult,
      });
    });

    it('should handle job execution when no captcha is detected', async () => {
      // Arrange
      const orchestrationResult: OrchestrationResult = {
        solved: true,
        duration: 100,
        attempts: 0,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalled();
      expect(result).toEqual({
        solved: true,
        duration: 100,
        attempts: 0,
      });
    });

    it('should handle captcha solving failure gracefully without failing the job', async () => {
      // Arrange
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: { sitekey: 'test-sitekey' },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: false,
        duration: 30000,
        attempts: 3,
        error: 'All solving attempts failed',
        detection: detectionResult,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalled();
      // Job should still return result even if captcha solving fails
      expect(result).toEqual({
        solved: false,
        error: 'All solving attempts failed',
        duration: 30000,
        attempts: 3,
        detection: detectionResult,
      });
    });

    it('should skip captcha solving when disabled in job config', async () => {
      // Arrange
      const jobWithoutCaptcha: AutomationJob = {
        ...testJob,
        captchaConfig: {
          enabled: false,
        },
      };

      jobRepository.createQueryBuilder().getMany.mockResolvedValue([jobWithoutCaptcha]);
      jobRepository.findOne.mockResolvedValue(jobWithoutCaptcha);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        jobWithoutCaptcha,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).not.toHaveBeenCalled();
    });

    it('should skip captcha solving when captchaConfig is null', async () => {
      // Arrange
      const jobWithoutCaptcha: AutomationJob = {
        ...testJob,
        captchaConfig: null,
      };

      jobRepository.createQueryBuilder().getMany.mockResolvedValue([jobWithoutCaptcha]);
      jobRepository.findOne.mockResolvedValue(jobWithoutCaptcha);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        jobWithoutCaptcha,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).not.toHaveBeenCalled();
    });
  });

  describe('Captcha solving fallback behavior', () => {
    let testJob: AutomationJob;

    beforeEach(() => {
      testJob = {
        id: 'test-job-id',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        captchaConfig: {
          enabled: true,
          enableThirdPartyFallback: true,
          solverPriority: ['native', '2captcha', 'anticaptcha'],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;
    });

    it('should use third-party fallback when native solver fails', async () => {
      // Arrange
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: { sitekey: 'test-sitekey' },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const solution: CaptchaSolution = {
        token: 'test-token-123',
        success: true,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: true,
        solution,
        solverType: '2captcha',
        duration: 15000,
        attempts: 4, // 3 native attempts + 1 third-party attempt
        usedThirdParty: true,
        detection: detectionResult,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          enableThirdPartyFallback: true,
          solverPriority: ['native', '2captcha', 'anticaptcha'],
        }),
      );
    });

    it('should not use third-party fallback when disabled', async () => {
      // Arrange
      const jobWithoutFallback: AutomationJob = {
        ...testJob,
        captchaConfig: {
          ...testJob.captchaConfig,
          enableThirdPartyFallback: false,
        },
      };

      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: { sitekey: 'test-sitekey' },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: false,
        duration: 30000,
        attempts: 3, // Only native attempts
        error: 'All native solver attempts failed',
        detection: detectionResult,
      };

      jobRepository.createQueryBuilder().getMany.mockResolvedValue([jobWithoutFallback]);
      jobRepository.findOne.mockResolvedValue(jobWithoutFallback);
      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        jobWithoutFallback,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          enableThirdPartyFallback: false,
        }),
      );
    });
  });

  describe('Captcha solving retry logic', () => {
    let testJob: AutomationJob;

    beforeEach(() => {
      testJob = {
        id: 'test-job-id',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        captchaConfig: {
          enabled: true,
          maxRetries: {
            recaptcha: 5,
            hcaptcha: 3,
            datadome: 4,
          },
          timeouts: {
            recaptcha: 45000,
            hcaptcha: 30000,
            datadome: 60000,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;
    });

    it('should use custom retry configuration from job config', async () => {
      // Arrange
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.RECAPTCHA,
        confidence: 0.9,
        details: { sitekey: 'test-sitekey' },
        detectedAt: new Date(),
        durationMs: 100,
      };

      const solution: CaptchaSolution = {
        token: 'test-token-123',
        success: true,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: true,
        solution,
        solverType: 'native-recaptcha-solver',
        duration: 10000,
        attempts: 3, // Multiple retries
        usedThirdParty: false,
        detection: detectionResult,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          maxRetries: {
            recaptcha: 5,
            hcaptcha: 3,
            datadome: 4,
          },
          timeouts: {
            recaptcha: 45000,
            hcaptcha: 30000,
            datadome: 60000,
          },
        }),
      );
    });
  });

  describe('Error handling in captcha solving', () => {
    let testJob: AutomationJob;

    beforeEach(() => {
      testJob = {
        id: 'test-job-id',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        captchaConfig: {
          enabled: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;
    });

    it('should handle orchestration service errors gracefully', async () => {
      // Arrange
      const error = new Error('Orchestration service error');
      solverOrchestrationService.detectAndSolve.mockRejectedValue(error);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalled();
      // Should return error result without throwing
      expect(result).toEqual({
        solved: false,
        error: 'Orchestration service error',
        duration: 0,
        attempts: 0,
      });
    });
  });

  describe('Detection to solver selection flow', () => {
    let testJob: AutomationJob;

    beforeEach(() => {
      testJob = {
        id: 'test-job-id',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        captchaConfig: {
          enabled: true,
          minConfidence: 0.7,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;
    });

    it('should pass detection configuration to orchestration service', async () => {
      // Arrange
      const detectionResult: AntiBotDetectionResult = {
        detected: true,
        type: AntiBotSystemType.HCAPTCHA,
        confidence: 0.8,
        details: { sitekey: 'hcaptcha-sitekey' },
        detectedAt: new Date(),
        durationMs: 150,
      };

      const solution: CaptchaSolution = {
        token: 'hcaptcha-token',
        success: true,
      };

      const orchestrationResult: OrchestrationResult = {
        solved: true,
        solution,
        solverType: 'native-hcaptcha-solver',
        duration: 8000,
        attempts: 1,
        usedThirdParty: false,
        detection: detectionResult,
      };

      solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

      // Act - test captcha solving integration directly
      const result = await jobProcessorService['handleCaptchaSolving'](
        mockPage,
        testJob,
      );

      // Assert
      expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          minConfidence: 0.7,
        }),
      );
    });

    it('should handle different captcha types (reCAPTCHA, hCAPTCHA, DataDome)', async () => {
      // Arrange
      const captchaTypes = [
        { type: AntiBotSystemType.RECAPTCHA, solverType: 'native-recaptcha-solver' },
        { type: AntiBotSystemType.HCAPTCHA, solverType: 'native-hcaptcha-solver' },
        { type: AntiBotSystemType.DATADOME, solverType: 'native-datadome-solver' },
      ];

      for (const { type, solverType } of captchaTypes) {
        const detectionResult: AntiBotDetectionResult = {
          detected: true,
          type,
          confidence: 0.9,
          details: { sitekey: `test-${type}` },
          detectedAt: new Date(),
          durationMs: 100,
        };

        const solution: CaptchaSolution = {
          token: `token-${type}`,
          success: true,
        };

        const orchestrationResult: OrchestrationResult = {
          solved: true,
          solution,
          solverType,
          duration: 5000,
          attempts: 1,
          usedThirdParty: false,
          detection: detectionResult,
        };

        solverOrchestrationService.detectAndSolve.mockResolvedValue(orchestrationResult);

        // Act - test captcha solving integration directly
        const result = await jobProcessorService['handleCaptchaSolving'](
          mockPage,
          testJob,
        );

        // Assert
        expect(solverOrchestrationService.detectAndSolve).toHaveBeenCalled();
        expect(result?.solved).toBe(true);
        expect(result?.solverType).toBe(solverType);
        jest.clearAllMocks();
      }
    });
  });
});

