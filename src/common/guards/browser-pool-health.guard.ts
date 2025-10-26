import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { BrowserPoolService } from '../../modules/browsers/services/browser-pool.service';

@Injectable()
export class BrowserPoolHealthIndicator extends HealthIndicator {
  constructor(private readonly browserPoolService: BrowserPoolService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const stats = this.browserPoolService.getStats('chromium'); // Check chromium as primary
      const isHealthy = stats.availableCount > 0;
      
      return this.getStatus(key, isHealthy, {
        available: stats.availableCount,
        active: stats.activeCount,
        total: stats.totalCount,
      });
    } catch (error) {
      return this.getStatus(key, false, {
        error: error.message,
      });
    }
  }
}

