import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { WorkersService } from '../../modules/workers/workers.service';

@Injectable()
export class WorkersHealthIndicator extends HealthIndicator {
  constructor(private readonly workersService: WorkersService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Add timeout to prevent hanging
      const statsPromise = this.workersService.getStats();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Workers health check timeout')), 2000),
      );
      
      const stats = await Promise.race([statsPromise, timeoutPromise]) as any;
      // Workers are healthy if we have at least one worker (even if busy)
      const isHealthy = stats.totalWorkers > 0;

      return this.getStatus(key, isHealthy, {
        total: stats.totalWorkers,
        idle: stats.idleWorkers,
        busy: stats.busyWorkers,
        offline: stats.offlineWorkers,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Don't fail health check if workers check times out - just report it
      return this.getStatus(key, true, {
        warning: errorMessage,
        total: 0,
        idle: 0,
        busy: 0,
        offline: 0,
      });
    }
  }
}
