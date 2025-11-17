import { Test, TestingModule } from '@nestjs/testing';
import { ActionHandlerFactory } from './action-handler.factory';
import { ScreenshotActionHandler } from '../handlers/screenshot-action.handler';
import { FillActionHandler } from '../handlers/fill-action.handler';
import { ClickActionHandler } from '../handlers/click-action.handler';
import { MoveCursorActionHandler } from '../handlers/move-cursor-action.handler';
import { ScrollActionHandler } from '../handlers/scroll-action.handler';
import { SnapshotActionHandler } from '../handlers/snapshot-action.handler';
import { IActionHandler } from '../interfaces/action-handler.interface';

describe('ActionHandlerFactory', () => {
  let factory: ActionHandlerFactory;
  let screenshotHandler: jest.Mocked<ScreenshotActionHandler>;
  let fillHandler: jest.Mocked<FillActionHandler>;
  let clickHandler: jest.Mocked<ClickActionHandler>;
  let moveCursorHandler: jest.Mocked<MoveCursorActionHandler>;
  let scrollHandler: jest.Mocked<ScrollActionHandler>;
  let snapshotHandler: jest.Mocked<SnapshotActionHandler>;

  beforeEach(async () => {
    // Create mock handlers
    const mockScreenshotHandler = {
      execute: jest.fn(),
    } as any;

    const mockFillHandler = {
      execute: jest.fn(),
    } as any;

    const mockClickHandler = {
      execute: jest.fn(),
    } as any;

    const mockMoveCursorHandler = {
      execute: jest.fn(),
    } as any;

    const mockScrollHandler = {
      execute: jest.fn(),
    } as any;

    const mockSnapshotHandler = {
      execute: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionHandlerFactory,
        {
          provide: ScreenshotActionHandler,
          useValue: mockScreenshotHandler,
        },
        {
          provide: FillActionHandler,
          useValue: mockFillHandler,
        },
        {
          provide: ClickActionHandler,
          useValue: mockClickHandler,
        },
        {
          provide: MoveCursorActionHandler,
          useValue: mockMoveCursorHandler,
        },
        {
          provide: ScrollActionHandler,
          useValue: mockScrollHandler,
        },
        {
          provide: SnapshotActionHandler,
          useValue: mockSnapshotHandler,
        },
      ],
    }).compile();

    factory = module.get<ActionHandlerFactory>(ActionHandlerFactory);
    screenshotHandler = module.get(ScreenshotActionHandler);
    fillHandler = module.get(FillActionHandler);
    clickHandler = module.get(ClickActionHandler);
    moveCursorHandler = module.get(MoveCursorActionHandler);
    scrollHandler = module.get(ScrollActionHandler);
    snapshotHandler = module.get(SnapshotActionHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(factory).toBeDefined();
    });

    it('should inject SnapshotActionHandler as a dependency', () => {
      expect(snapshotHandler).toBeDefined();
      expect(snapshotHandler.execute).toBeDefined();
    });
  });

  describe('getHandler', () => {
    it('should return SnapshotActionHandler for "snapshot" action type', () => {
      const handler = factory.getHandler('snapshot');
      expect(handler).toBe(snapshotHandler);
      expect(handler).toBeInstanceOf(Object);
      expect(handler.execute).toBeDefined();
    });

    it('should return ScreenshotActionHandler for "screenshot" action type', () => {
      const handler = factory.getHandler('screenshot');
      expect(handler).toBe(screenshotHandler);
    });

    it('should return FillActionHandler for "fill" action type', () => {
      const handler = factory.getHandler('fill');
      expect(handler).toBe(fillHandler);
    });

    it('should return ClickActionHandler for "click" action type', () => {
      const handler = factory.getHandler('click');
      expect(handler).toBe(clickHandler);
    });

    it('should return MoveCursorActionHandler for "moveCursor" action type', () => {
      const handler = factory.getHandler('moveCursor');
      expect(handler).toBe(moveCursorHandler);
    });

    it('should return ScrollActionHandler for "scroll" action type', () => {
      const handler = factory.getHandler('scroll');
      expect(handler).toBe(scrollHandler);
    });

    it('should throw error for unknown action type', () => {
      expect(() => factory.getHandler('unknown')).toThrow(
        'No handler found for action type: unknown',
      );
    });
  });

  describe('hasHandler', () => {
    it('should return true for "snapshot" action type', () => {
      expect(factory.hasHandler('snapshot')).toBe(true);
    });

    it('should return true for existing action types', () => {
      expect(factory.hasHandler('screenshot')).toBe(true);
      expect(factory.hasHandler('fill')).toBe(true);
      expect(factory.hasHandler('click')).toBe(true);
      expect(factory.hasHandler('moveCursor')).toBe(true);
      expect(factory.hasHandler('scroll')).toBe(true);
    });

    it('should return false for unknown action type', () => {
      expect(factory.hasHandler('unknown')).toBe(false);
    });
  });

  describe('getAllSupportedActions', () => {
    it('should include "snapshot" in supported actions', () => {
      const actions = factory.getAllSupportedActions();
      expect(actions).toContain('snapshot');
    });

    it('should include all existing action types', () => {
      const actions = factory.getAllSupportedActions();
      expect(actions).toContain('screenshot');
      expect(actions).toContain('fill');
      expect(actions).toContain('click');
      expect(actions).toContain('moveCursor');
      expect(actions).toContain('scroll');
      expect(actions).toContain('snapshot');
    });

    it('should return array with correct length', () => {
      const actions = factory.getAllSupportedActions();
      expect(actions.length).toBe(6);
    });
  });

  describe('backward compatibility', () => {
    it('should maintain existing handler registrations', () => {
      // Verify all existing handlers still work
      expect(factory.getHandler('screenshot')).toBe(screenshotHandler);
      expect(factory.getHandler('fill')).toBe(fillHandler);
      expect(factory.getHandler('click')).toBe(clickHandler);
      expect(factory.getHandler('moveCursor')).toBe(moveCursorHandler);
      expect(factory.getHandler('scroll')).toBe(scrollHandler);
    });

    it('should not affect existing handler functionality', () => {
      const screenshot = factory.getHandler('screenshot');
      const fill = factory.getHandler('fill');
      const click = factory.getHandler('click');

      expect(screenshot.execute).toBeDefined();
      expect(fill.execute).toBeDefined();
      expect(click.execute).toBeDefined();
    });
  });

  describe('handler registration', () => {
    it('should register snapshot handler with correct key', () => {
      const handler = factory.getHandler('snapshot');
      expect(handler).toBe(snapshotHandler);
    });

    it('should return handler that implements IActionHandler interface', () => {
      const handler = factory.getHandler('snapshot');
      expect(handler).toHaveProperty('execute');
      expect(typeof handler.execute).toBe('function');
    });
  });
});

