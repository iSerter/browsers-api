import { JobStatus } from '../entities/automation-job.entity';

export interface JobEvent {
  jobId: string;
  status: JobStatus;
  timestamp: Date;
  data?: any;
}

export interface JobCreatedEvent extends JobEvent {
  type: 'job.created';
  data: {
    createdAt: Date;
  };
}

export interface JobStartedEvent extends JobEvent {
  type: 'job.started';
  data: {
    startedAt: Date;
  };
}

export interface JobProgressEvent extends JobEvent {
  type: 'job.progress';
  data: {
    progress: number;
    message: string;
    step?: string;
  };
}

export interface JobCompletedEvent extends JobEvent {
  type: 'job.completed';
  data: {
    completedAt: Date;
    artifacts?: any[];
    result?: any;
  };
}

export interface JobFailedEvent extends JobEvent {
  type: 'job.failed';
  data: {
    error: string;
    errorMessage: string;
    completedAt: Date;
  };
}

export type JobEventType =
  | JobCreatedEvent
  | JobStartedEvent
  | JobProgressEvent
  | JobCompletedEvent
  | JobFailedEvent;

