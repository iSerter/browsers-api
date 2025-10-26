import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  getMetrics() {
    return this.metricsService.getMetrics();
  }
}

