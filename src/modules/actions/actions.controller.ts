import { Controller, Post, Body } from '@nestjs/common';
import { ActionsService } from './actions.service';

@Controller('actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post('screenshot')
  async screenshot(@Body() payload: any) {
    return this.actionsService.createScreenshotJob(payload);
  }

  @Post('visit')
  async visit(@Body() payload: any) {
    return this.actionsService.createVisitJob(payload);
  }

  @Post('form-fill')
  async formFill(@Body() payload: any) {
    return this.actionsService.createFormFillJob(payload);
  }

  @Post('extract')
  async extract(@Body() payload: any) {
    return this.actionsService.createExtractJob(payload);
  }

  @Post('pdf')
  async pdf(@Body() payload: any) {
    return this.actionsService.createPdfJob(payload);
  }
}
