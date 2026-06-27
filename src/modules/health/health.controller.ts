import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { BrowserPoolHealthIndicator } from '../../common/guards/browser-pool-health.guard';
import { WorkersHealthIndicator } from '../../common/guards/workers-health.guard';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    @Inject(BrowserPoolHealthIndicator)
    private readonly browserPoolHealth: BrowserPoolHealthIndicator,
    @Inject(WorkersHealthIndicator)
    private readonly workersHealth: WorkersHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 5000 }), // 5 second DB timeout
      // This is a Playwright/Chromium service: the Node process RSS routinely sits
      // in the hundreds of MB and the container is provisioned with ~3GB. The old
      // 300MB caps tripped the Docker healthcheck immediately. Leave headroom under
      // the container limit so the check still catches a genuine leak.
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024), // 1GB
      () => this.memory.checkRSS('memory_rss', 2048 * 1024 * 1024), // 2GB
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.9, // 90% threshold
        }),
      () => this.browserPoolHealth.isHealthy('browser_pool'),
      () => this.workersHealth.isHealthy('workers'),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 5000 }), // 5 second DB timeout
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024), // 1GB
      () => this.workersHealth.isHealthy('workers'),
    ]);
  }

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 1536 * 1024 * 1024), // 1.5GB for liveness
    ]);
  }
}
