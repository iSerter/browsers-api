import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ActionType } from './dto/action-config.dto';
import { JobStatus } from './entities/automation-job.entity';

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: jest.Mocked<JobsService>;
  let apiKeysService: jest.Mocked<ApiKeysService>;

  const mockJobsService = {
    createJob: jest.fn(),
    getJobById: jest.fn(),
    listJobs: jest.fn(),
    cancelJob: jest.fn(),
    getJobArtifacts: jest.fn(),
  };

  const mockApiKeysService = {
    checkUrlAllowed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    jobsService = module.get(JobsService);
    apiKeysService = module.get(ApiKeysService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    const mockCreateJobDto: CreateJobDto = {
      browserTypeId: 1,
      targetUrl: 'https://iserter.com',
      actions: [
        {
          action: ActionType.CLICK,
          target: 'Contact',
          getTargetBy: 'getByText' as any,
          waitForNavigation: true,
        },
        {
          action: ActionType.FILL,
          target: 'Full Name',
          getTargetBy: 'getByLabel' as any,
          value: 'Ilyas Test',
        },
        {
          action: ActionType.FILL,
          target: 'Email Address',
          getTargetBy: 'getByLabel' as any,
          value: 'ilyas.serter+test@gmail.com',
        },
        {
          action: ActionType.FILL,
          target: 'Subject',
          getTargetBy: 'getByLabel' as any,
          value: 'lorem ipsum',
        },
        {
          action: ActionType.MOVE_CURSOR,
          target: 'Send message',
          getTargetBy: 'getByText' as any,
        },
        {
          action: ActionType.SCREENSHOT,
          fullPage: true,
          type: 'png' as any,
        },
      ],
      timeoutMs: 30000,
    };

    const mockJobResponse = {
      jobId: 'test-job-id',
      status: JobStatus.PENDING,
      createdAt: new Date(),
    };

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should create a job when URL is allowed', async () => {
      apiKeysService.checkUrlAllowed.mockResolvedValue(true);
      jobsService.createJob.mockResolvedValue(mockJobResponse);

      const result = await controller.createJob(mockCreateJobDto, {} as any);

      expect(apiKeysService.checkUrlAllowed).toHaveBeenCalledWith(
        'https://iserter.com',
      );
      expect(jobsService.createJob).toHaveBeenCalledWith(mockCreateJobDto);
      expect(result).toEqual(mockJobResponse);
    });

    it('should throw ForbiddenException when URL is not allowed', async () => {
      apiKeysService.checkUrlAllowed.mockResolvedValue(false);

      await expect(
        controller.createJob(mockCreateJobDto, {} as any),
      ).rejects.toThrow(ForbiddenException);

      expect(apiKeysService.checkUrlAllowed).toHaveBeenCalledWith(
        'https://iserter.com',
      );
      expect(jobsService.createJob).not.toHaveBeenCalled();
    });

    it('should handle different action types', async () => {
      const dtoWithVariousActions: CreateJobDto = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: ActionType.CLICK,
            target: 'Button',
            getTargetBy: 'getByText' as any,
          },
          {
            action: ActionType.SCROLL,
            targetY: 500,
          },
          {
            action: ActionType.SCREENSHOT,
            fullPage: false,
            type: 'jpeg' as any,
          },
        ],
      };

      apiKeysService.checkUrlAllowed.mockResolvedValue(true);
      jobsService.createJob.mockResolvedValue(mockJobResponse);

      await controller.createJob(dtoWithVariousActions, {} as any);

      expect(jobsService.createJob).toHaveBeenCalledWith(dtoWithVariousActions);
    });
  });
});

