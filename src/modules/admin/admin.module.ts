import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { MetricsModule } from '../metrics/metrics.module';
import { WorkersModule } from '../workers/workers.module';
import { BrowsersModule } from '../browsers/browsers.module';

@Module({
  imports: [MetricsModule, WorkersModule, BrowsersModule],
  controllers: [AdminController],
})
export class AdminModule {}
