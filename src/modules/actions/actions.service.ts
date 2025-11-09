import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { ActionType } from '../jobs/dto/action-config.dto';

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
          action: ActionType.SCREENSHOT,
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
          action: ActionType.VISIT,
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
          action: ActionType.EXTRACT,
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
          action: ActionType.PDF,
          pdfFormat: payload.format,
          printBackground: payload.printBackground,
          margin: payload.margin,
        },
      ],
      waitUntil: payload.waitUntil,
      timeoutMs: payload.timeout,
    });
  }
}
