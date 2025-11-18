import { Injectable } from '@nestjs/common';
import {
  IActionHandler,
  ActionConfig,
} from '../interfaces/action-handler.interface';
import { ScreenshotActionHandler } from '../handlers/screenshot-action.handler';
import { FillActionHandler } from '../handlers/fill-action.handler';
import { ClickActionHandler } from '../handlers/click-action.handler';
import { MoveCursorActionHandler } from '../handlers/move-cursor-action.handler';
import { ScrollActionHandler } from '../handlers/scroll-action.handler';
import { SnapshotActionHandler } from '../handlers/snapshot-action.handler';
import { ExecuteScriptActionHandler } from '../handlers/execute-script-action.handler';

@Injectable()
export class ActionHandlerFactory {
  private readonly handlers: Map<string, IActionHandler> = new Map();

  constructor(
    private readonly screenshotHandler: ScreenshotActionHandler,
    private readonly fillHandler: FillActionHandler,
    private readonly clickHandler: ClickActionHandler,
    private readonly moveCursorHandler: MoveCursorActionHandler,
    private readonly scrollHandler: ScrollActionHandler,
    private readonly snapshotHandler: SnapshotActionHandler,
    private readonly executeScriptHandler: ExecuteScriptActionHandler,
  ) {
    // Register all action handlers
    this.handlers.set('screenshot', this.screenshotHandler);
    this.handlers.set('fill', this.fillHandler);
    this.handlers.set('click', this.clickHandler);
    this.handlers.set('moveCursor', this.moveCursorHandler);
    this.handlers.set('scroll', this.scrollHandler);
    this.handlers.set('snapshot', this.snapshotHandler);
    this.handlers.set('executeScript', this.executeScriptHandler);
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
