import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { BrowserPoolHealthIndicator } from '../../common/guards/browser-pool-health.guard';
import { WorkersHealthIndicator } from '../../common/guards/workers-health.guard';
import { BrowsersModule } from '../browsers/browsers.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [TerminusModule, HttpModule, BrowsersModule, WorkersModule],
  controllers: [HealthController],
  providers: [BrowserPoolHealthIndicator, WorkersHealthIndicator],
})
export class HealthModule {}
