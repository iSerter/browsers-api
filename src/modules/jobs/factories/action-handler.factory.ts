import { Injectable } from '@nestjs/common';
import {
  IActionHandler,
  ActionConfig,
} from '../interfaces/action-handler.interface';
import { ScreenshotActionHandler } from '../handlers/screenshot-action.handler';

@Injectable()
export class ActionHandlerFactory {
  private readonly handlers: Map<string, IActionHandler> = new Map();

  constructor(private readonly screenshotHandler: ScreenshotActionHandler) {
    // Register all action handlers
    this.handlers.set('screenshot', this.screenshotHandler);
    // Future handlers will be registered here:
    // this.handlers.set('formFill', this.formFillHandler);
    // this.handlers.set('pdf', this.pdfHandler);
    // this.handlers.set('extract', this.extractHandler);
  }

  getHandler(actionType: string): IActionHandler {
    const handler = this.handlers.get(actionType);

    if (!handler) {
      throw new Error(`No handler found for action type: ${actionType}`);
    }

    return handler;
  }

  hasHandler(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  getAllSupportedActions(): string[] {
    return Array.from(this.handlers.keys());
  }
}
