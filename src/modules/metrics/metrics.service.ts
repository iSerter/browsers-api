import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = register;

  // Job metrics
  private readonly jobsCreatedTotal = new Counter({
    name: 'jobs_created_total',
    help: 'Total number of automation jobs created',
    labelNames: ['browserType', 'status'],
  });

  private readonly jobsCompletedTotal = new Counter({
    name: 'jobs_completed_total',
    help: 'Total number of automation jobs completed',
    labelNames: ['browserType', 'status'],
  });

  private readonly jobsFailedTotal = new Counter({
    name: 'jobs_failed_total',
    help: 'Total number of automation jobs that failed',
    labelNames: ['browserType', 'errorType'],
  });

  private readonly jobDurationSeconds = new Histogram({
    name: 'job_duration_seconds',
    help: 'Duration of automation jobs in seconds',
    labelNames: ['browserType', 'actionType'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  });

  private readonly activeJobs = new Gauge({
    name: 'active_jobs',
    help: 'Current number of active jobs being processed',
  });

  // Browser pool metrics
  private readonly browserPoolSize = new Gauge({
    name: 'browser_pool_size',
    help: 'Current size of the browser pool',
    labelNames: ['browserType', 'state'],
  });

  // Worker metrics
  private readonly workerCount = new Gauge({
    name: 'worker_count',
    help: 'Current number of workers',
    labelNames: ['status'],
  });

  // API metrics
  private readonly apiRequestsTotal = new Counter({
    name: 'api_requests_total',
    help: 'Total number of API requests',
    labelNames: ['endpoint', 'method', 'statusCode'],
  });

  private readonly apiRequestDurationSeconds = new Histogram({
    name: 'api_request_duration_seconds',
    help: 'Duration of API requests in seconds',
    labelNames: ['endpoint', 'method'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  // Job metrics methods
  incrementJobsCreated(browserType: string, status: string): void {
    this.jobsCreatedTotal.inc({ browserType, status });
  }

  incrementJobsCompleted(browserType: string, status: string): void {
    this.jobsCompletedTotal.inc({ browserType, status });
  }

  incrementJobsFailed(browserType: string, errorType: string): void {
    this.jobsFailedTotal.inc({ browserType, errorType });
  }

  recordJobDuration(
    browserType: string,
    actionType: string,
    durationSeconds: number,
  ): void {
    this.jobDurationSeconds.observe({ browserType, actionType }, durationSeconds);
  }

  setActiveJobs(count: number): void {
    this.activeJobs.set(count);
  }

  // Browser pool metrics methods
  setBrowserPoolSize(browserType: string, state: string, count: number): void {
    this.browserPoolSize.set({ browserType, state }, count);
  }

  // Worker metrics methods
  setWorkerCount(status: string, count: number): void {
    this.workerCount.set({ status }, count);
  }

  // API metrics methods
  incrementApiRequest(endpoint: string, method: string, statusCode: number): void {
    this.apiRequestsTotal.inc({ endpoint, method, statusCode: String(statusCode) });
  }

  recordApiRequestDuration(
    endpoint: string,
    method: string,
    durationSeconds: number,
  ): void {
    this.apiRequestDurationSeconds.observe(
      { endpoint, method },
      durationSeconds,
    );
  }

  // Get all metrics in Prometheus format
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Reset all metrics (useful for testing)
  resetMetrics(): void {
    this.registry.resetMetrics();
  }
}

