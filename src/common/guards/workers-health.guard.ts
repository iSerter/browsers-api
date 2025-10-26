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
      const stats = await this.workersService.getStats();
      const isHealthy = stats.totalWorkers > 0 && stats.idleWorkers > 0;
      
      return this.getStatus(key, isHealthy, {
        total: stats.totalWorkers,
        idle: stats.idleWorkers,
        busy: stats.busyWorkers,
        offline: stats.offlineWorkers,
      });
    } catch (error) {
      return this.getStatus(key, false, {
        error: error.message,
      });
    }
  }
}

