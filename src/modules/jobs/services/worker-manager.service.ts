import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BrowserWorker,
  WorkerStatus,
} from '../../workers/entities/browser-worker.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerManagerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerManagerService.name);
  private workerId: string | null = null;
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private readonly heartbeatIntervalMs = 10000; // 10 seconds
  private readonly heartbeatTimeoutMs = 30000; // 30 seconds

  constructor(
    @InjectRepository(BrowserWorker)
    private readonly workerRepository: Repository<BrowserWorker>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Initialize worker registration
    await this.registerWorker();

    // Start heartbeat update
    this.startHeartbeatUpdates();

    this.logger.log('WorkerManagerService initialized');
  }

  async registerWorker(): Promise<void> {
    try {
      const browserTypeId =
        this.configService.get<number>('DEFAULT_BROWSER_TYPE_ID') || 1;

      const worker = this.workerRepository.create({
        browserTypeId,
        status: WorkerStatus.IDLE,
        lastHeartbeat: new Date(),
        metadata: {
          processId: process.pid,
          hostname: require('os').hostname(),
          startedAt: new Date(),
        },
      });

      const savedWorker = await this.workerRepository.save(worker);
      this.workerId = savedWorker.id;

      this.logger.log(`Worker registered with ID: ${this.workerId}`);
    } catch (error) {
      this.logger.error(`Failed to register worker: ${error.message}`);
      throw error;
    }
  }

  async unregisterWorker(): Promise<void> {
    if (!this.workerId) {
      return;
    }

    try {
      await this.workerRepository.update(
        { id: this.workerId },
        { status: WorkerStatus.OFFLINE },
      );

      this.logger.log(`Worker ${this.workerId} unregistered`);
    } catch (error) {
      this.logger.error(`Failed to unregister worker: ${error.message}`);
    }
  }

  async updateHeartbeat(): Promise<void> {
    if (!this.workerId) {
      return;
    }

    try {
      await this.workerRepository.update(
        { id: this.workerId },
        { lastHeartbeat: new Date() },
      );
    } catch (error) {
      this.logger.error(`Failed to update heartbeat: ${error.message}`);
    }
  }

  async setWorkerStatus(status: WorkerStatus): Promise<void> {
    if (!this.workerId) {
      return;
    }

    try {
      await this.workerRepository.update({ id: this.workerId }, { status });
      this.logger.debug(`Worker status updated to: ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update worker status: ${error.message}`);
    }
  }

  async setCurrentJob(jobId: string | null): Promise<void> {
    if (!this.workerId) {
      return;
    }

    try {
      // TypeORM doesn't support null in update directly for relations, so we need a workaround
      if (jobId) {
        await this.workerRepository
          .createQueryBuilder()
          .update(BrowserWorker)
          .set({ currentJobId: jobId })
          .where('id = :workerId', { workerId: this.workerId })
          .execute();
      } else {
        await this.workerRepository
          .createQueryBuilder()
          .update(BrowserWorker)
          .set({ currentJobId: () => 'NULL' })
          .where('id = :workerId', { workerId: this.workerId })
          .execute();
      }
    } catch (error) {
      this.logger.error(`Failed to set current job: ${error.message}`);
    }
  }

  async detectDeadWorkers(): Promise<void> {
    try {
      const now = new Date();
      const timeoutThreshold = new Date(
        now.getTime() - this.heartbeatTimeoutMs,
      );

      const deadWorkers = await this.workerRepository.find({
        where: [
          {
            status: WorkerStatus.BUSY,
          },
        ],
      });

      const deadWorkersFiltered = deadWorkers.filter(
        (worker) => worker.lastHeartbeat < timeoutThreshold,
      );

      for (const worker of deadWorkersFiltered) {
        this.logger.warn(
          `Detected dead worker: ${worker.id} (last heartbeat: ${worker.lastHeartbeat})`,
        );

        // Mark worker as offline and clear current job
        await this.workerRepository.update(
          { id: worker.id },
          {
            status: WorkerStatus.OFFLINE,
            currentJobId: undefined as any,
          },
        );
      }

      if (deadWorkersFiltered.length > 0) {
        this.logger.log(
          `Marked ${deadWorkersFiltered.length} dead worker(s) as offline`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to detect dead workers: ${error.message}`);
    }
  }

  async reassignJobsFromDeadWorkers(): Promise<void> {
    // Find jobs that were processing on offline workers
    const query = `
      UPDATE automation_jobs
      SET status = 'pending', started_at = NULL
      WHERE status = 'processing'
        AND id IN (
          SELECT aj.id
          FROM automation_jobs aj
          JOIN browser_workers bw ON aj.id = bw.current_job_id
          WHERE bw.status = 'offline'
        )
    `;

    try {
      await this.workerRepository.query(query);
      this.logger.log('Reassigned jobs from dead workers back to pending');
    } catch (error) {
      this.logger.error(
        `Failed to reassign jobs from dead workers: ${error.message}`,
      );
    }
  }

  async getWorkerId(): Promise<string | null> {
    return this.workerId;
  }

  private startHeartbeatUpdates(): void {
    this.heartbeatCheckInterval = setInterval(async () => {
      await this.updateHeartbeat();
      await this.detectDeadWorkers();
      await this.reassignJobsFromDeadWorkers();
    }, this.heartbeatIntervalMs);
  }

  onModuleDestroy() {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
    }
    this.unregisterWorker();
  }
}
