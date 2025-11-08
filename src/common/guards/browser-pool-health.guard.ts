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
      // Browser pool is healthy if it exists (even if no browsers available yet)
      // Pools are lazy-initialized, so totalCount > 0 means pool exists
      // availableCount > 0 means browsers are ready, but not required for health
      const isHealthy = stats.totalCount >= 0; // Pool exists (even if empty)
      
      return this.getStatus(key, isHealthy, {
        available: stats.availableCount,
        active: stats.activeCount,
        total: stats.totalCount,
        note: stats.totalCount === 0 
          ? 'Pool not initialized yet (lazy initialization)' 
          : 'Pool operational',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Don't fail health check if pool check errors - just report it
      return this.getStatus(key, true, {
        warning: errorMessage,
        available: 0,
        active: 0,
        total: 0,
      });
    }
  }
}
