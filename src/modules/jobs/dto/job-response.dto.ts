import { JobStatus } from '../entities/automation-job.entity';

export class JobResponseDto {
  id: string;
  status: JobStatus;
  browserTypeId: number;
  targetUrl: string;
  actions: any[];
  priority: number;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  result?: any;
}

export class CreateJobResponseDto {
  jobId: string;
  status: JobStatus;
  createdAt: Date;
}

export class PaginatedJobsResponseDto {
  items: JobResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

