import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() createJobDto: CreateJobDto) {
    return this.jobsService.createJob(createJobDto);
  }

  @Get()
  async listJobs(@Query() query: ListJobsQueryDto) {
    return this.jobsService.listJobs(query);
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelJob(@Param('id') id: string) {
    return this.jobsService.cancelJob(id);
  }

  @Get(':id/artifacts')
  async getJobArtifacts(@Param('id') id: string) {
    return this.jobsService.getJobArtifacts(id);
  }
}
