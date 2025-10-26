import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { BrowserPoolService } from '../../modules/browsers/services/browser-pool.service';

@Injectable()
export class BrowserPoolHealthIndicator extends HealthIndicator {
  constructor(private readonly browserPoolService: BrowserPoolService) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    try {
      const stats = this.browserPoolService.getStats('chromium'); // Check chromium as primary
      const isHealthy = stats.availableCount > 0;
      
      return this.getStatus(key, isHealthy, {
        available: stats.availableCount,
        active: stats.activeCount,
        total: stats.totalCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.getStatus(key, false, {
        error: errorMessage,
      });
    }
  }
}
