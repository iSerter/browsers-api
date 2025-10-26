import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobLog, LogLevel } from '../entities/job-log.entity';

@Injectable()
export class JobLogService {
  private readonly logger = new Logger(JobLogService.name);

  constructor(
    @InjectRepository(JobLog)
    private readonly jobLogRepository: Repository<JobLog>,
  ) {}

  async logJobEvent(
    jobId: string,
    level: LogLevel,
    message: string,
    metadata?: any,
  ): Promise<void> {
    try {
      const log = this.jobLogRepository.create({
        jobId,
        level,
        message,
        metadata,
      });

      await this.jobLogRepository.save(log);

      // Also log to console with appropriate level
      this.logToConsole(level, `[Job ${jobId}] ${message}`, metadata);
    } catch (error) {
      this.logger.error(
        `Failed to log job event for job ${jobId}: ${error.message}`,
      );
    }
  }

  async getJobLogs(jobId: string): Promise<JobLog[]> {
    return this.jobLogRepository.find({
      where: { jobId },
      order: { createdAt: 'ASC' },
    });
  }

  private logToConsole(level: LogLevel, message: string, metadata?: any): void {
    const messageWithMeta = metadata
      ? `${message} ${JSON.stringify(metadata)}`
      : message;

    switch (level) {
      case LogLevel.DEBUG:
        this.logger.debug(messageWithMeta);
        break;
      case LogLevel.INFO:
        this.logger.log(messageWithMeta);
        break;
      case LogLevel.WARN:
        this.logger.warn(messageWithMeta);
        break;
      case LogLevel.ERROR:
        this.logger.error(messageWithMeta);
        break;
    }
  }
}
