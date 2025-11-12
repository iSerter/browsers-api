import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { AutomationJob, JobStatus } from './entities/automation-job.entity';
import { JobArtifact } from './entities/job-artifact.entity';
import { BrowsersService } from '../browsers/browsers.service';
import { JobEventsGateway } from './gateways/job-events.gateway';
import { CreateJobDto } from './dto/create-job.dto';
import { ActionType } from './dto/action-config.dto';

describe('JobsService', () => {
  let service: JobsService;
  let jobRepository: jest.Mocked<Repository<AutomationJob>>;
  let artifactRepository: jest.Mocked<Repository<JobArtifact>>;
  let browsersService: jest.Mocked<BrowsersService>;
  let jobEventsGateway: jest.Mocked<JobEventsGateway>;

  const mockJobRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockArtifactRepository = {
    find: jest.fn(),
  };

  const mockBrowsersService = {
    findOne: jest.fn(),
  };

  const mockJobEventsGateway = {
    emitJobEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getRepositoryToken(AutomationJob),
          useValue: mockJobRepository,
        },
        {
          provide: getRepositoryToken(JobArtifact),
          useValue: mockArtifactRepository,
        },
        {
          provide: BrowsersService,
          useValue: mockBrowsersService,
        },
        {
          provide: JobEventsGateway,
          useValue: mockJobEventsGateway,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    jobRepository = module.get(getRepositoryToken(AutomationJob));
    artifactRepository = module.get(getRepositoryToken(JobArtifact));
    browsersService = module.get(BrowsersService);
    jobEventsGateway = module.get(JobEventsGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    const mockCreateJobDto: CreateJobDto = {
      browserTypeId: 1,
      targetUrl: 'https://example.com',
      actions: [
        {
          action: ActionType.CLICK,
          target: 'Submit',
          getTargetBy: 'getByText' as any,
          waitForNavigation: true,
        },
        {
          action: ActionType.FILL,
          target: 'Email',
          getTargetBy: 'getByLabel' as any,
          value: 'test@example.com',
        },
        {
          action: ActionType.SCREENSHOT,
          fullPage: true,
          type: 'png' as any,
        },
      ],
      timeoutMs: 30000,
    };

    const mockSavedJob: AutomationJob = {
      id: 'test-job-id',
      browserTypeId: 1,
      targetUrl: 'https://example.com',
      actions: mockCreateJobDto.actions,
      status: JobStatus.PENDING,
      priority: 0,
      timeoutMs: 30000,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      browserType: null,
      artifacts: [],
    };

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create a job successfully', async () => {
      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockSavedJob as any);
      jobRepository.save.mockResolvedValue(mockSavedJob);

      const result = await service.createJob(mockCreateJobDto);

      expect(browsersService.findOne).toHaveBeenCalledWith(1);
      expect(jobRepository.create).toHaveBeenCalledWith({
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: mockCreateJobDto.actions,
        waitUntil: undefined,
        priority: 0,
        timeoutMs: 30000,
        maxRetries: 3,
        status: JobStatus.PENDING,
      });
      expect(jobRepository.save).toHaveBeenCalled();
      expect(jobEventsGateway.emitJobEvent).toHaveBeenCalledWith({
        type: 'job.created',
        jobId: 'test-job-id',
        status: JobStatus.PENDING,
        timestamp: mockSavedJob.createdAt,
        data: {
          createdAt: mockSavedJob.createdAt,
        },
      });
      expect(result).toEqual({
        jobId: 'test-job-id',
        status: JobStatus.PENDING,
        createdAt: mockSavedJob.createdAt,
      });
    });

    it('should use default values for optional fields', async () => {
      const dtoWithoutOptionalFields: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
        ],
      };

      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockSavedJob as any);
      jobRepository.save.mockResolvedValue(mockSavedJob);

      await service.createJob(dtoWithoutOptionalFields);

      expect(jobRepository.create).toHaveBeenCalledWith({
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: dtoWithoutOptionalFields.actions,
        waitUntil: undefined,
        priority: 0,
        timeoutMs: 30000,
        maxRetries: 3,
        status: JobStatus.PENDING,
      });
    });

    it('should throw BadRequestException when browser type does not exist', async () => {
      browsersService.findOne.mockRejectedValue(
        new BadRequestException('Browser type not found'),
      );

      await expect(service.createJob(mockCreateJobDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(browsersService.findOne).toHaveBeenCalledWith(1);
      expect(jobRepository.create).not.toHaveBeenCalled();
      expect(jobRepository.save).not.toHaveBeenCalled();
    });

    it('should handle all action types correctly', async () => {
      const dtoWithAllActions: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
          {
            action: ActionType.FILL,
            target: 'Input',
            getTargetBy: 'getByLabel' as any,
            value: 'test value',
          },
          {
            action: ActionType.SCROLL,
            targetY: 1000,
            speed: 2000,
          },
          {
            action: ActionType.MOVE_CURSOR,
            target: 'Element',
            getTargetBy: 'getBySelector' as any,
            speed: 1000,
          },
          {
            action: ActionType.SCREENSHOT,
            fullPage: true,
            type: 'png' as any,
          },
        ],
      };

      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockSavedJob as any);
      jobRepository.save.mockResolvedValue(mockSavedJob);

      await service.createJob(dtoWithAllActions);

      expect(jobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: dtoWithAllActions.actions,
        }),
      );
    });

    it('should respect custom priority and timeout values', async () => {
      const dtoWithCustomValues: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
        ],
        priority: 50,
        timeoutMs: 60000,
        maxRetries: 5,
      };

      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockSavedJob as any);
      jobRepository.save.mockResolvedValue(mockSavedJob);

      await service.createJob(dtoWithCustomValues);

      expect(jobRepository.create).toHaveBeenCalledWith({
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: dtoWithCustomValues.actions,
        waitUntil: undefined,
        priority: 50,
        timeoutMs: 60000,
        maxRetries: 5,
        status: JobStatus.PENDING,
      });
    });

    it('should create a job with proxy configuration', async () => {
      const dtoWithProxy: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
        ],
        proxy: {
          server: 'http://proxy.example.com:8080',
          username: 'user',
          password: 'pass',
        },
      };

      const mockJobWithProxy = {
        ...mockSavedJob,
        proxyServer: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass',
      };

      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockJobWithProxy as any);
      jobRepository.save.mockResolvedValue(mockJobWithProxy);

      await service.createJob(dtoWithProxy);

      expect(jobRepository.create).toHaveBeenCalledWith({
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: dtoWithProxy.actions,
        waitUntil: undefined,
        priority: 0,
        timeoutMs: 30000,
        maxRetries: 3,
        status: JobStatus.PENDING,
        proxyServer: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass',
      });
    });

    it('should create a job with proxy server only (no auth)', async () => {
      const dtoWithProxy: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
        ],
        proxy: {
          server: 'http://proxy.example.com:8080',
        },
      };

      const mockJobWithProxy = {
        ...mockSavedJob,
        proxyServer: 'http://proxy.example.com:8080',
        proxyUsername: undefined,
        proxyPassword: undefined,
      };

      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockJobWithProxy as any);
      jobRepository.save.mockResolvedValue(mockJobWithProxy);

      await service.createJob(dtoWithProxy);

      expect(jobRepository.create).toHaveBeenCalledWith({
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: dtoWithProxy.actions,
        waitUntil: undefined,
        priority: 0,
        timeoutMs: 30000,
        maxRetries: 3,
        status: JobStatus.PENDING,
        proxyServer: 'http://proxy.example.com:8080',
        proxyUsername: undefined,
        proxyPassword: undefined,
      });
    });

    it('should create a job without proxy when proxy is not provided', async () => {
      browsersService.findOne.mockResolvedValue({ id: 1 } as any);
      jobRepository.create.mockReturnValue(mockSavedJob as any);
      jobRepository.save.mockResolvedValue(mockSavedJob);

      await service.createJob(mockCreateJobDto);

      expect(jobRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          proxyServer: expect.anything(),
        }),
      );
    });
  });
});

