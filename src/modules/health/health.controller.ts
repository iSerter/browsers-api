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
  @HealthCheck({
    timeout: 10000, // 10 second timeout for all checks
  })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 5000 }), // 5 second DB timeout
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // 300MB
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
  @HealthCheck({
    timeout: 10000, // 10 second timeout
  })
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 5000 }), // 5 second DB timeout
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.workersHealth.isHealthy('workers'),
    ]);
  }

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024), // 500MB for liveness
    ]);
  }
}
