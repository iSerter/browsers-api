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
import { CaptchaSolverModule } from '../captcha-solver/captcha-solver.module';
import { ArtifactStorageService } from './services/artifact-storage.service';
import { JobLogService } from './services/job-log.service';
import { JobProcessorService } from './services/job-processor.service';
import { WorkerManagerService } from './services/worker-manager.service';
import { WorkerHeartbeatService } from './services/worker-heartbeat.service';
import { ActionHandlerFactory } from './factories/action-handler.factory';
import { ScreenshotActionHandler } from './handlers/screenshot-action.handler';
import { FillActionHandler } from './handlers/fill-action.handler';
import { ClickActionHandler } from './handlers/click-action.handler';
import { MoveCursorActionHandler } from './handlers/move-cursor-action.handler';
import { ScrollActionHandler } from './handlers/scroll-action.handler';
import { SnapshotActionHandler } from './handlers/snapshot-action.handler';
import { JobEventsGateway } from './gateways/job-events.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationJob, JobArtifact, JobLog]),
    BrowsersModule,
    WorkersModule,
    ApiKeysModule,
    CaptchaSolverModule,
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
    FillActionHandler,
    ClickActionHandler,
    MoveCursorActionHandler,
    ScrollActionHandler,
    SnapshotActionHandler,
    ActionHandlerFactory,
    JobEventsGateway,
  ],
  exports: [
    JobsService,
    ArtifactStorageService,
    JobLogService,
    ActionHandlerFactory,
  ],
})
export class JobsModule {}
