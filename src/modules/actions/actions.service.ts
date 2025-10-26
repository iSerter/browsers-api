import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class ActionsService {
  constructor(private readonly jobsService: JobsService) {}

  async createScreenshotJob(payload: any) {
    // Transform action-specific payload to job format
    return this.jobsService.createJob({
      browserTypeId: payload.browserTypeId || 1,
      targetUrl: payload.url,
      actions: [
        {
          action: 'screenshot',
          fullPage: payload.fullPage,
          format: payload.format,
          quality: payload.quality,
        },
      ],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }

  async createVisitJob(payload: any) {
    return this.jobsService.createJob({
      browserTypeId: payload.browserTypeId || 1,
      targetUrl: payload.url,
      actions: [
        {
          action: 'visit',
        },
      ],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }

  async createFormFillJob(payload: any) {
    return this.jobsService.createJob({
      browserTypeId: payload.browserTypeId || 1,
      targetUrl: payload.url,
      actions: payload.actions || [],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }

  async createExtractJob(payload: any) {
    return this.jobsService.createJob({
      browserTypeId: payload.browserTypeId || 1,
      targetUrl: payload.url,
      actions: [
        {
          action: 'extract',
          extractors: payload.extractors,
        },
      ],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }

  async createPdfJob(payload: any) {
    return this.jobsService.createJob({
      browserTypeId: payload.browserTypeId || 1,
      targetUrl: payload.url,
      actions: [
        {
          action: 'pdf',
          format: payload.format,
          printBackground: payload.printBackground,
          margin: payload.margin,
        },
      ],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }
}
