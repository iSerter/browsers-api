import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationJob, JobStatus } from '../entities/automation-job.entity';
import { BrowserPoolService } from '../../browsers/services/browser-pool.service';
import { BrowserContextManagerService } from '../../browsers/services/browser-context-manager.service';
import { ActionHandlerFactory } from '../factories/action-handler.factory';
import { JobLogService } from './job-log.service';
import { WorkerManagerService } from './worker-manager.service';
import { LogLevel } from '../entities/job-log.entity';
import { WorkerStatus } from '../../workers/entities/browser-worker.entity';
import { Browser, Page } from 'playwright';
import { JobEventsGateway } from '../gateways/job-events.gateway';

@Injectable()
export class JobProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobProcessorService.name);
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private activeJobs: Set<string> = new Set();
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(AutomationJob)
    private readonly jobRepository: Repository<AutomationJob>,
    private readonly browserPoolService: BrowserPoolService,
    private readonly contextManager: BrowserContextManagerService,
    private readonly actionHandlerFactory: ActionHandlerFactory,
    private readonly jobLogService: JobLogService,
    private readonly workerManagerService: WorkerManagerService,
    private readonly jobEventsGateway: JobEventsGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('JobProcessorService initialized');
    await this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Job processor is already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting job processor...');

    // Start polling for jobs
    this.startPolling();

    this.logger.log('Job processor started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.log('Stopping job processor...');
    this.isRunning = false;

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Wait for active jobs to complete (max 60s)
    await this.waitForActiveJobs(60000);

    this.logger.log('Job processor stopped');
  }

  private startPolling(): void {
    const pollInterval = 1000; // 1 second

    this.pollingInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      // Only process if we have capacity
      if (this.activeJobs.size >= 5) {
        return;
      }

      try {
        await this.pollAndProcessJob();
      } catch (error) {
        this.logger.error(`Error during job polling: ${error.message}`);
      }
    }, pollInterval);
  }

  private async pollAndProcessJob(): Promise<void> {
    const queryRunner =
      this.jobRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Query for pending jobs with FOR UPDATE SKIP LOCKED to avoid race conditions
      const job = await queryRunner.manager
        .createQueryBuilder(AutomationJob, 'job')
        .where('job.status = :status', { status: JobStatus.PENDING })
        .orderBy('job.priority', 'DESC')
        .addOrderBy('job.createdAt', 'ASC')
        .setLock('pessimistic_write_or_fail')
        .getOne();

      if (!job) {
        await queryRunner.release();
        return;
      }

      // Immediately update status to processing to prevent other workers from picking it up
      job.status = JobStatus.PROCESSING;
      job.startedAt = new Date();

      await queryRunner.manager.save(job);
      await queryRunner.commitTransaction();
      await queryRunner.release();

      this.logger.log(`Picked up job ${job.id} for processing`);

      // Emit job started event
      this.jobEventsGateway.emitJobEvent({
        type: 'job.started',
        jobId: job.id,
        status: JobStatus.PROCESSING,
        timestamp: job.startedAt,
        data: {
          startedAt: job.startedAt,
        },
      });

      this.jobLogService.logJobEvent(
        job.id,
        LogLevel.INFO,
        'Job picked up by worker for processing',
      );

      // Process the job asynchronously
      this.processJob(job).catch((error) => {
        this.logger.error(`Error processing job ${job.id}: ${error.message}`);
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.logger.debug(`No pending jobs available: ${error.message}`);
    }
  }

  private async processJob(job: AutomationJob): Promise<void> {
    this.activeJobs.add(job.id);

    try {
      await this.workerManagerService.setWorkerStatus(WorkerStatus.BUSY);
      await this.workerManagerService.setCurrentJob(job.id);

      await this.jobLogService.logJobEvent(
        job.id,
        LogLevel.INFO,
        'Job processing started',
        { targetUrl: job.targetUrl },
      );

      // Get browser type name for pool
      const browser = await this.acquireBrowser(job.browserTypeId);

      try {
        // Process the job
        await this.executeJob(browser, job);

        // Mark job as completed
        job.status = JobStatus.COMPLETED;
        job.completedAt = new Date();

        // Emit job completed event
        this.jobEventsGateway.emitJobEvent({
          type: 'job.completed',
          jobId: job.id,
          status: JobStatus.COMPLETED,
          timestamp: job.completedAt,
          data: {
            completedAt: job.completedAt,
            artifacts: job.artifacts || [],
            result: job.result,
          },
        });

        await this.jobLogService.logJobEvent(
          job.id,
          LogLevel.INFO,
          'Job processing completed successfully',
        );
      } finally {
        // Release browser back to pool
        await this.releaseBrowser(browser, job.browserTypeId);
      }
    } catch (error) {
      await this.handleJobError(job, error);
    } finally {
      // Save job status
      await this.jobRepository.save(job);
      this.activeJobs.delete(job.id);

      await this.workerManagerService.setWorkerStatus(WorkerStatus.IDLE);
      await this.workerManagerService.setCurrentJob(null);
    }
  }

  private async executeJob(
    browser: Browser,
    job: AutomationJob,
  ): Promise<void> {
    // Create browser context
    const context = await this.contextManager.createContext(browser, {
      viewport: {
        width: 1920,
        height: 1080,
      },
    });

    // Create a single page for all actions to share
    const page = await context.newPage();

    try {
      // Navigate to target URL once at the start
      await page.goto(job.targetUrl, {
        waitUntil: job.waitUntil as any,
        timeout: job.timeoutMs,
      });

      await this.jobLogService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Navigated to target URL: ${job.targetUrl}`,
      );

      const results: any[] = [];

      // Execute each action in sequence on the same page
      for (let i = 0; i < job.actions.length; i++) {
        const actionConfig = job.actions[i];
        await this.jobLogService.logJobEvent(
          job.id,
          LogLevel.DEBUG,
          `Executing action: ${actionConfig.action}`,
        );

        // Emit progress event
        this.jobEventsGateway.emitJobEvent({
          type: 'job.progress',
          jobId: job.id,
          status: JobStatus.PROCESSING,
          timestamp: new Date(),
          data: {
            progress: Math.round(((i + 1) / job.actions.length) * 100),
            message: `Executing action ${i + 1} of ${job.actions.length}: ${actionConfig.action}`,
            step: actionConfig.action,
          },
        });

        const handler = this.actionHandlerFactory.getHandler(
          actionConfig.action,
        );

        const result = await handler.execute(page, actionConfig, job.id);

        results.push(result as any);

        if (!result.success) {
          throw new Error(
            `Action ${actionConfig.action} failed: ${result.error?.message}`,
          );
        }

        await this.jobLogService.logJobEvent(
          job.id,
          LogLevel.DEBUG,
          `Action completed: ${actionConfig.action}`,
          result.data,
        );
      }

      // Store results
      job.result = results;

      await this.jobLogService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `All actions completed successfully`,
        { actionCount: job.actions.length },
      );
    } catch (error) {
      this.logger.error(`Error executing job ${job.id}: ${error.message}`);
      await page.close();
      throw error;
    } finally {
      await page.close();
      await this.contextManager.closeContext(context);
    }
  }

  private async acquireBrowser(browserTypeId: number): Promise<Browser> {
    // Get browser type name from database
    const browserTypeRepo =
      this.jobRepository.manager.getRepository('BrowserType');
    const browserType = await browserTypeRepo.findOne({
      where: { id: browserTypeId },
    });

    if (!browserType) {
      throw new Error(`Browser type ${browserTypeId} not found`);
    }

    const browserName = browserType.name.toLowerCase(); // e.g., 'chromium'
    return this.browserPoolService.acquire(browserName);
  }

  private async releaseBrowser(
    browser: Browser,
    browserTypeId: number,
  ): Promise<void> {
    const browserTypeRepo =
      this.jobRepository.manager.getRepository('BrowserType');
    const browserType = await browserTypeRepo.findOne({
      where: { id: browserTypeId },
    });

    if (!browserType) {
      this.logger.warn(`Browser type ${browserTypeId} not found for release`);
      return;
    }

    const browserName = browserType.name.toLowerCase();
    return this.browserPoolService.release(browser, browserName);
  }

  private async handleJobError(
    job: AutomationJob,
    error: Error,
  ): Promise<void> {
    await this.jobLogService.logJobEvent(
      job.id,
      LogLevel.ERROR,
      error.message,
      {
        errorName: error.name,
        stack: error.stack,
      },
    );

    // Categorize error
    const errorCategory = this.categorizeError(error);
    const isRetryable = this.isRetryableError(error);

    // Determine retry strategy
    if (isRetryable && job.retryCount < job.maxRetries) {
      // Don't emit job.failed yet, it will be retried
      job.retryCount++;
      job.status = JobStatus.PENDING;
      job.startedAt = undefined as any;

      // Exponential backoff delay
      const backoffSeconds = Math.pow(job.retryCount, 2);
      const backoffMs = backoffSeconds * 1000;

      this.logger.log(
        `Job ${job.id} will be retried (attempt ${job.retryCount + 1}/${job.maxRetries}) after ${backoffSeconds}s`,
      );

      await this.jobLogService.logJobEvent(
        job.id,
        LogLevel.WARN,
        `Job scheduled for retry after ${backoffSeconds}s`,
        { retryCount: job.retryCount, maxRetries: job.maxRetries },
      );

      // Update job to be retried
      await this.jobRepository.save(job);
    } else {
      // Max retries exceeded or non-retryable error
      job.status = JobStatus.FAILED;
      job.completedAt = new Date();
      job.errorMessage = error.message;

      // Emit job failed event
      this.jobEventsGateway.emitJobEvent({
        type: 'job.failed',
        jobId: job.id,
        status: JobStatus.FAILED,
        timestamp: job.completedAt,
        data: {
          error: errorCategory,
          errorMessage: error.message,
          completedAt: job.completedAt,
        },
      });

      this.logger.error(`Job ${job.id} failed permanently: ${error.message}`);

      await this.jobLogService.logJobEvent(
        job.id,
        LogLevel.ERROR,
        `Job failed permanently after ${job.retryCount} retries`,
        { errorCategory },
      );
    }
  }

  private categorizeError(error: Error): string {
    if (error.name === 'TimeoutError') {
      return 'TimeoutError';
    }
    if (error.message.includes('net::ERR')) {
      return 'NetworkError';
    }
    if (error.message.includes('Invalid URL')) {
      return 'InvalidURLError';
    }
    if (error.message.includes('Authentication')) {
      return 'AuthenticationError';
    }
    if (error.name === 'BrowserError') {
      return 'BrowserError';
    }
    return 'UnknownError';
  }

  private isRetryableError(error: Error): boolean {
    const errorCategory = this.categorizeError(error);
    const retryableErrors = ['TimeoutError', 'NetworkError', 'BrowserError'];
    const nonRetryableErrors = ['InvalidURLError', 'AuthenticationError'];

    if (retryableErrors.includes(errorCategory)) {
      return true;
    }
    if (nonRetryableErrors.includes(errorCategory)) {
      return false;
    }

    // Unknown errors default to non-retryable
    return false;
  }

  private async waitForActiveJobs(timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (this.activeJobs.size > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        this.logger.warn(
          `Timeout waiting for active jobs to complete. Active jobs: ${Array.from(
            this.activeJobs,
          ).join(', ')}`,
        );
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
