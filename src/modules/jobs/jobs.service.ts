import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationJob, JobStatus } from './entities/automation-job.entity';
import { JobArtifact } from './entities/job-artifact.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { BrowsersService } from '../browsers/browsers.service';
import { JobEventsGateway } from './gateways/job-events.gateway';
import { ArtifactStorageService } from './services/artifact-storage.service';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(AutomationJob)
    private readonly jobRepository: Repository<AutomationJob>,
    @InjectRepository(JobArtifact)
    private readonly artifactRepository: Repository<JobArtifact>,
    private readonly browsersService: BrowsersService,
    private readonly jobEventsGateway: JobEventsGateway,
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  async createJob(createJobDto: CreateJobDto) {
    // Validate browser type exists
    try {
      await this.browsersService.findOne(createJobDto.browserTypeId);
    } catch (error) {
      throw new BadRequestException(
        `Browser type with ID ${createJobDto.browserTypeId} not found`,
      );
    }

    const job = this.jobRepository.create({
      browserTypeId: createJobDto.browserTypeId,
      targetUrl: createJobDto.targetUrl,
      actions: createJobDto.actions,
      waitUntil: createJobDto.waitUntil,
      priority: createJobDto.priority || 0,
      timeoutMs: createJobDto.timeoutMs || 30000,
      maxRetries: createJobDto.maxRetries || 3,
      status: JobStatus.PENDING,
      ...(createJobDto.proxy && {
        proxyServer: createJobDto.proxy.server,
        proxyUsername: createJobDto.proxy.username,
        proxyPassword: createJobDto.proxy.password,
      }),
      ...(createJobDto.captcha && {
        captchaConfig: createJobDto.captcha,
      }),
    });

    const savedJob = await this.jobRepository.save(job);

    // Emit job created event
    this.jobEventsGateway.emitJobEvent({
      type: 'job.created',
      jobId: savedJob.id,
      status: JobStatus.PENDING,
      timestamp: savedJob.createdAt,
      data: {
        createdAt: savedJob.createdAt,
      },
    });

    return {
      jobId: savedJob.id,
      status: savedJob.status,
      createdAt: savedJob.createdAt,
    };
  }

  async getJobById(id: string) {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['browserType', 'artifacts'],
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return job;
  }

  async listJobs(query: ListJobsQueryDto) {
    const {
      status,
      browserTypeId,
      page = 1,
      limit = 20,
      createdAfter,
      createdBefore,
    } = query;

    const queryBuilder = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.browserType', 'browserType');

    // Apply filters
    if (status) {
      queryBuilder.andWhere('job.status = :status', { status });
    }

    if (browserTypeId) {
      queryBuilder.andWhere('job.browserTypeId = :browserTypeId', {
        browserTypeId,
      });
    }

    if (createdAfter) {
      queryBuilder.andWhere('job.createdAt >= :createdAfter', { createdAfter });
    }

    if (createdBefore) {
      queryBuilder.andWhere('job.createdAt <= :createdBefore', {
        createdBefore,
      });
    }

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by created date descending
    queryBuilder.orderBy('job.createdAt', 'DESC');

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async cancelJob(id: string) {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Can only cancel pending or processing jobs
    if (
      job.status !== JobStatus.PENDING &&
      job.status !== JobStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Cannot cancel job with status: ${job.status}`,
      );
    }

    job.status = JobStatus.CANCELLED;
    await this.jobRepository.save(job);
  }

  async getJobArtifacts(jobId: string) {
    // Verify job exists
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const artifacts = await this.artifactRepository.find({
      where: { jobId },
      order: { createdAt: 'DESC' },
    });

    return artifacts;
  }

  async getArtifactFile(jobId: string, artifactId: string) {
    // Verify job exists
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    // Get artifact
    const artifact = await this.artifactRepository.findOne({
      where: { id: artifactId, jobId },
    });

    if (!artifact) {
      throw new NotFoundException(
        `Artifact with ID ${artifactId} not found for job ${jobId}`,
      );
    }

    // Read file from storage
    const fileBuffer = await this.artifactStorageService.readArtifactFile(
      artifact,
    );

    return {
      buffer: fileBuffer,
      mimeType: artifact.mimeType || 'application/octet-stream',
      filename: artifact.filePath
        ? artifact.filePath.split('/').pop() || `artifact-${artifactId}`
        : `artifact-${artifactId}`,
    };
  }
}
