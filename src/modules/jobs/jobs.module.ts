import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { AutomationJob } from './entities/automation-job.entity';
import { JobArtifact } from './entities/job-artifact.entity';
import { JobLog } from './entities/job-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationJob, JobArtifact, JobLog])],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

