import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { WorkersService } from '../workers/workers.service';
import { BrowserPoolService } from '../browsers/services/browser-pool.service';

@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly workersService: WorkersService,
    private readonly browserPoolService: BrowserPoolService,
  ) {}

  @Get('stats')
  async getStats() {
    const workersStats = await this.workersService.getStats();
    const browserStats = this.browserPoolService.getStats('chromium');

    return {
      workers: workersStats,
      browserPool: browserStats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('workers')
  async getWorkers() {
    return this.workersService.findAll();
  }

  @Get('queue')
  async getQueue() {
    // This would typically check the queue depth
    // For now, return browser pool stats
    const chromiumStats = this.browserPoolService.getStats('chromium');
    const firefoxStats = this.browserPoolService.getStats('firefox');
    const webkitStats = this.browserPoolService.getStats('webkit');

    return {
      chromium: chromiumStats,
      firefox: firefoxStats,
      webkit: webkitStats,
      metrics: {
        totalAvailable:
          chromiumStats.availableCount +
          firefoxStats.availableCount +
          webkitStats.availableCount,
        totalActive:
          chromiumStats.activeCount + firefoxStats.activeCount + webkitStats.activeCount,
      },
    };
  }
}

