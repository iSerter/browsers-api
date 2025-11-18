import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Page, Browser, BrowserContext } from 'playwright';
import { JobProcessorService } from './job-processor.service';
import { AutomationJob, JobStatus } from '../entities/automation-job.entity';
import { BrowserPoolService } from '../../browsers/services/browser-pool.service';
import { BrowserContextManagerService } from '../../browsers/services/browser-context-manager.service';
import { ActionHandlerFactory } from '../factories/action-handler.factory';
import { JobLogService } from './job-log.service';
import { WorkerManagerService } from './worker-manager.service';
import { JobEventsGateway } from '../gateways/job-events.gateway';
import { SolverOrchestrationService } from '../../captcha-solver/services/solver-orchestration.service';
import { LogLevel } from '../entities/job-log.entity';
import { WorkerStatus } from '../../workers/entities/browser-worker.entity';

describe('JobProcessorService - Browser Storage', () => {
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
    // Create mock page with storage methods
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      goto: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
      isClosed: jest.fn().mockReturnValue(false),
      evaluate: jest.fn().mockResolvedValue(null),
      waitForSelector: jest.fn().mockResolvedValue(null),
      click: jest.fn().mockResolvedValue(null),
      fill: jest.fn().mockResolvedValue(null),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
    } as any;

    // Create mock browser context with cookie methods
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      clearCookies: jest.fn().mockResolvedValue(undefined),
      addCookies: jest.fn().mockResolvedValue(undefined),
      cookies: jest.fn().mockResolvedValue([]),
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
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ id: 1, name: 'chromium' }),
        }),
      },
    };

    // Create mock services
    const mockBrowserPoolService = {
      acquire: jest.fn().mockResolvedValue(mockBrowser),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const mockContextManager = {
      createContext: jest.fn().mockResolvedValue(mockContext),
      closeContext: jest.fn().mockResolvedValue(undefined),
    };

    const mockActionHandler = {
      execute: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockActionHandlerFactory = {
      getHandler: jest.fn().mockReturnValue(mockActionHandler),
    };

    const mockJobLogService = {
      logJobEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockWorkerManagerService = {
      setWorkerStatus: jest.fn().mockResolvedValue(undefined),
      setCurrentJob: jest.fn().mockResolvedValue(undefined),
    };

    const mockJobEventsGateway = {
      emitJobEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockSolverOrchestrationService = {
      detectAndSolve: jest.fn().mockResolvedValue(null),
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

    // Initialize the service (sets up activeJobs Set)
    // We don't call onModuleInit to avoid starting polling, but we need to ensure
    // the service is in a valid state
    Object.defineProperty(jobProcessorService, 'activeJobs', {
      value: new Set(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear activeJobs after each test
    if ((jobProcessorService as any).activeJobs) {
      (jobProcessorService as any).activeJobs.clear();
    }
  });

  describe('Storage is cleared after job completion', () => {
    beforeEach(() => {
      // Ensure activeJobs is initialized before each test
      (jobProcessorService as any).activeJobs = new Set();
    });

    it('should clear all browser storage (cookies, localStorage, sessionStorage) after successful job completion', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'screenshot',
            type: 'png',
          },
        ],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'abc123',
              domain: 'example.com',
              path: '/',
              secure: true,
              httpOnly: true,
            },
          ],
          localStorage: {
            userId: '12345',
            theme: 'dark',
          },
          sessionStorage: {
            tempData: 'value',
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      // Set it directly on the instance
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      // Access the private method via reflection or test the public interface
      // Since executeJob is private, we'll test through processJob
      await (jobProcessorService as any).processJob(job);

      // Assert
      // Verify storage was applied
      expect(mockContext.addCookies).toHaveBeenCalled();
      // localStorage and sessionStorage are set during applyBrowserStorage
      // Additional evaluate calls may happen during actions, so we check for at least 2
      expect(mockPage.evaluate.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Verify storage was cleared in finally block
      expect(mockContext.clearCookies).toHaveBeenCalled();
      
      // Verify localStorage.clear() was called (check all evaluate calls)
      const evaluateCalls = mockPage.evaluate.mock.calls;
      const hasLocalStorageClear = evaluateCalls.some((call) => {
        const fnString = call[0].toString();
        return fnString.includes('localStorage.clear');
      });
      expect(hasLocalStorageClear).toBe(true);

      // Verify sessionStorage.clear() was called
      const hasSessionStorageClear = evaluateCalls.some((call) => {
        const fnString = call[0].toString();
        return fnString.includes('sessionStorage.clear');
      });
      expect(hasSessionStorageClear).toBe(true);

      // Verify page was closed
      expect(mockPage.close).toHaveBeenCalled();
      
      // Verify context was closed
      expect(contextManager.closeContext).toHaveBeenCalledWith(mockContext);
    });
  });

  describe('Multiple jobs do not share storage data', () => {
    beforeEach(() => {
      (jobProcessorService as any).activeJobs = new Set();
    });

    it('should create separate contexts for each job, ensuring no storage leakage', async () => {
      // Arrange
      const job1: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'job1-session',
              domain: 'example.com',
            },
          ],
          localStorage: { jobId: 'job1' },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      const job2: AutomationJob = {
        id: 'test-job-2',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'job2-session',
              domain: 'example.com',
            },
          ],
          localStorage: { jobId: 'job2' },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      jobRepository.save = jest.fn().mockImplementation((job) => Promise.resolve(job));

      // Create separate mock contexts for each job
      const mockContext1 = {
        ...mockContext,
        addCookies: jest.fn().mockResolvedValue(undefined),
        clearCookies: jest.fn().mockResolvedValue(undefined),
      };
      const mockContext2 = {
        ...mockContext,
        addCookies: jest.fn().mockResolvedValue(undefined),
        clearCookies: jest.fn().mockResolvedValue(undefined),
      };

      const mockPage1 = { ...mockPage, evaluate: jest.fn().mockResolvedValue(null) };
      const mockPage2 = { ...mockPage, evaluate: jest.fn().mockResolvedValue(null) };

      mockContext1.newPage = jest.fn().mockResolvedValue(mockPage1);
      mockContext2.newPage = jest.fn().mockResolvedValue(mockPage2);

      contextManager.createContext
        .mockResolvedValueOnce(mockContext1)
        .mockResolvedValueOnce(mockContext2);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      await (jobProcessorService as any).processJob(job1);
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      await (jobProcessorService as any).processJob(job2);

      // Assert
      // Verify each job got its own context
      expect(contextManager.createContext).toHaveBeenCalledTimes(2);

      // Verify job1's cookies were set on context1
      expect(mockContext1.addCookies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'sessionId',
            value: 'job1-session',
          }),
        ]),
      );

      // Verify job2's cookies were set on context2
      expect(mockContext2.addCookies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'sessionId',
            value: 'job2-session',
          }),
        ]),
      );

      // Verify each context was cleared separately
      expect(mockContext1.clearCookies).toHaveBeenCalled();
      expect(mockContext2.clearCookies).toHaveBeenCalled();

      // Verify contexts were closed separately
      expect(contextManager.closeContext).toHaveBeenCalledWith(mockContext1);
      expect(contextManager.closeContext).toHaveBeenCalledWith(mockContext2);
    });
  });

  describe('Cleanup errors do not prevent job completion', () => {
    beforeEach(() => {
      (jobProcessorService as any).activeJobs = new Set();
    });

    it('should complete job successfully even if storage clearing fails', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'abc123',
              domain: 'example.com',
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      // Make clearCookies throw an error
      mockContext.clearCookies = jest
        .fn()
        .mockRejectedValue(new Error('Failed to clear cookies'));

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      // Should not throw
      await expect((jobProcessorService as any).processJob(job)).resolves.not.toThrow();

      // Assert
      // Verify job was still completed
      expect(jobRepository.save).toHaveBeenCalled();
      expect(job.status).toBe(JobStatus.COMPLETED);

      // Verify cleanup was attempted
      expect(mockContext.clearCookies).toHaveBeenCalled();

      // Verify page and context were still closed despite cleanup error
      expect(mockPage.close).toHaveBeenCalled();
      expect(contextManager.closeContext).toHaveBeenCalled();
    });

    it('should complete job successfully even if localStorage clearing fails', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          localStorage: { key: 'value' },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      // Make localStorage.clear() throw an error
      let callCount = 0;
      mockPage.evaluate = jest.fn().mockImplementation((fn) => {
        callCount++;
        const fnString = fn.toString();
        if (fnString.includes('localStorage.clear')) {
          throw new Error('Failed to clear localStorage');
        }
        return Promise.resolve(null);
      });

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      // Should not throw
      await expect((jobProcessorService as any).processJob(job)).resolves.not.toThrow();

      // Assert
      // Verify job was still completed
      expect(jobRepository.save).toHaveBeenCalled();
      expect(job.status).toBe(JobStatus.COMPLETED);

      // Verify page and context were still closed
      expect(mockPage.close).toHaveBeenCalled();
      expect(contextManager.closeContext).toHaveBeenCalled();
    });
  });

  describe('Storage clearing works even if job fails', () => {
    beforeEach(() => {
      (jobProcessorService as any).activeJobs = new Set();
    });

    it('should clear storage in finally block even when job execution fails', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'abc123',
              domain: 'example.com',
            },
          ],
          localStorage: { key: 'value' },
          sessionStorage: { temp: 'data' },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      // Make action handler throw an error
      const mockActionHandler = {
        execute: jest.fn().mockRejectedValue(new Error('Action failed')),
      };
      actionHandlerFactory.getHandler = jest
        .fn()
        .mockReturnValue(mockActionHandler);

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      await (jobProcessorService as any).processJob(job);

      // Assert
      // Verify job failed
      expect(job.status).toBe(JobStatus.FAILED);

      // Verify storage was still cleared in finally block
      expect(mockContext.clearCookies).toHaveBeenCalled();

      // Verify localStorage and sessionStorage were cleared
      const evaluateCalls = mockPage.evaluate.mock.calls;
      const hasLocalStorageClear = evaluateCalls.some((call) => {
        const fnString = call[0].toString();
        return fnString.includes('localStorage.clear');
      });
      const hasSessionStorageClear = evaluateCalls.some((call) => {
        const fnString = call[0].toString();
        return fnString.includes('sessionStorage.clear');
      });
      expect(hasLocalStorageClear || hasSessionStorageClear).toBe(true);

      // Verify page was closed even after error
      expect(mockPage.close).toHaveBeenCalled();
      
      // Verify context was closed even after error
      expect(contextManager.closeContext).toHaveBeenCalled();
    });

    it('should clear storage even when page navigation fails', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'abc123',
              domain: 'example.com',
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      // Make page.goto throw an error
      mockPage.goto = jest
        .fn()
        .mockRejectedValue(new Error('Navigation failed'));

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      await (jobProcessorService as any).processJob(job);

      // Assert
      // Verify job failed
      expect(job.status).toBe(JobStatus.FAILED);

      // Verify storage clearing was attempted in finally block
      // Note: Since navigation failed, storage might not have been applied,
      // but cleanup should still be attempted
      expect(mockContext.clearCookies).toHaveBeenCalled();

      // Verify page was closed even after navigation error
      expect(mockPage.close).toHaveBeenCalled();
      
      // Verify context was closed even after navigation error
      expect(contextManager.closeContext).toHaveBeenCalled();
    });

    it('should handle storage clearing when page is already closed', async () => {
      // Arrange
      const job: AutomationJob = {
        id: 'test-job-1',
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [{ action: 'screenshot', type: 'png' }],
        status: JobStatus.PENDING,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        timeoutMs: 30000,
        waitUntil: 'networkidle' as any,
        browserStorage: {
          cookies: [
            {
              name: 'sessionId',
              value: 'abc123',
              domain: 'example.com',
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AutomationJob;

      // Make page.isClosed() return true
      mockPage.isClosed = jest.fn().mockReturnValue(true);

      jobRepository.save = jest.fn().mockResolvedValue(job);

      // Act
      // Ensure activeJobs is set before calling processJob
      Object.assign(jobProcessorService, { activeJobs: new Set() });
      // Should not throw
      await expect((jobProcessorService as any).processJob(job)).resolves.not.toThrow();

      // Assert
      // Verify isClosed was checked
      expect(mockPage.isClosed).toHaveBeenCalled();

      // Verify clearBrowserStorage was not called on closed page
      // (The method checks isClosed before attempting to clear)
      // Since page is closed, evaluate should not be called for clearing
      const clearCalls = mockPage.evaluate.mock.calls.filter((call) => {
        const fnString = call[0].toString();
        return (
          fnString.includes('localStorage.clear') ||
          fnString.includes('sessionStorage.clear')
        );
      });
      // Should not attempt to clear on closed page
      expect(clearCalls.length).toBe(0);

      // Verify context was still closed
      expect(contextManager.closeContext).toHaveBeenCalled();
    });
  });
});

