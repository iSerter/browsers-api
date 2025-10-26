import { Injectable } from '@nestjs/common';
import {
  IActionHandler,
  ActionConfig,
} from '../interfaces/action-handler.interface';
import { ScreenshotActionHandler } from '../handlers/screenshot-action.handler';
import { FillActionHandler } from '../handlers/fill-action.handler';
import { ClickActionHandler } from '../handlers/click-action.handler';

@Injectable()
export class ActionHandlerFactory {
  private readonly handlers: Map<string, IActionHandler> = new Map();

  constructor(
    private readonly screenshotHandler: ScreenshotActionHandler,
    private readonly fillHandler: FillActionHandler,
    private readonly clickHandler: ClickActionHandler,
  ) {
    // Register all action handlers
    this.handlers.set('screenshot', this.screenshotHandler);
    this.handlers.set('fill', this.fillHandler);
    this.handlers.set('click', this.clickHandler);
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
