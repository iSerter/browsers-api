import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { AutomationJob } from './entities/automation-job.entity';
import { JobArtifact } from './entities/job-artifact.entity';
import { JobLog } from './entities/job-log.entity';
import { BrowsersModule } from '../browsers/browsers.module';
import { WorkersModule } from '../workers/workers.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ArtifactStorageService } from './services/artifact-storage.service';
import { JobLogService } from './services/job-log.service';
import { JobProcessorService } from './services/job-processor.service';
import { WorkerManagerService } from './services/worker-manager.service';
import { WorkerHeartbeatService } from './services/worker-heartbeat.service';
import { ActionHandlerFactory } from './factories/action-handler.factory';
import { ScreenshotActionHandler } from './handlers/screenshot-action.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationJob, JobArtifact, JobLog]),
    BrowsersModule,
    WorkersModule,
    ApiKeysModule,
    ConfigModule,
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    ArtifactStorageService,
    JobLogService,
    JobProcessorService,
    WorkerManagerService,
    WorkerHeartbeatService,
    ScreenshotActionHandler,
    ActionHandlerFactory,
  ],
  exports: [
    JobsService,
    ArtifactStorageService,
    JobLogService,
    ActionHandlerFactory,
  ],
})
export class JobsModule {}
