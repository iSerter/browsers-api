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
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { Request } from 'express';

@Controller('jobs')
@UseGuards(ThrottlerGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() createJobDto: CreateJobDto, @Req() req: any) {
    // Check URL policy
    const isAllowed = await this.apiKeysService.checkUrlAllowed(
      createJobDto.targetUrl,
    );
    
    if (!isAllowed) {
      throw new ForbiddenException(
        'The requested URL is not allowed by policy configuration',
      );
    }

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
