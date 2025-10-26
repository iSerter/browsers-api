import { Test, TestingModule } from '@nestjs/testing';
import { MoveCursorActionHandler } from './move-cursor-action.handler';
import { Page } from 'playwright';
import { moveMouseHuman } from '../utils/human-mouse';

// Mock the human-mouse module
jest.mock('../utils/human-mouse');

describe('MoveCursorActionHandler', () => {
  let handler: MoveCursorActionHandler;
  let mockPage: jest.Mocked<Page>;
  let mockLocator: any;
  let mockElement: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MoveCursorActionHandler],
    }).compile();

    handler = module.get<MoveCursorActionHandler>(MoveCursorActionHandler);

    // Mock element handle
    mockElement = {
      boundingBox: jest.fn().mockResolvedValue({
        x: 100,
        y: 100,
        width: 50,
        height: 50,
      }),
    };

    // Mock locator
    mockLocator = {
      waitFor: jest.fn().mockResolvedValue(undefined),
      elementHandle: jest.fn().mockResolvedValue(mockElement),
    };

    // Mock page
    mockPage = {
      getByLabel: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByPlaceholder: jest.fn().mockReturnValue(mockLocator),
      locator: jest.fn().mockReturnValue(mockLocator),
      mouse: {
        move: jest.fn().mockResolvedValue(undefined),
      },
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock the human-mouse function
    (moveMouseHuman as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should move cursor to element using getByLabel', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Submit Button',
        getTargetBy: 'getByLabel',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByLabel).toHaveBeenCalledWith('Submit Button');
      expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'visible' });
      expect(mockLocator.elementHandle).toHaveBeenCalled();
      expect(moveMouseHuman).toHaveBeenCalled();
    });

    it('should move cursor to element using getByText', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Click me',
        getTargetBy: 'getByText',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('Click me');
      expect(moveMouseHuman).toHaveBeenCalled();
    });

    it('should pass custom options to moveMouseHuman', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Button',
        getTargetBy: 'getByText',
        speed: 800,
        jitter: 0.4,
        overshoot: 0.05,
        minPauseMs: 10,
        maxPauseMs: 50,
        stepsMin: 20,
        stepsMax: 40,
        padding: 8,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(moveMouseHuman).toHaveBeenCalledWith(
        mockPage,
        { el: mockElement, padding: 8 },
        {
          speed: 800,
          jitter: 0.4,
          overshoot: 0.05,
          minPauseMs: 10,
          maxPauseMs: 50,
          stepsMin: 20,
          stepsMax: 40,
        },
      );
    });

    it('should return error when target is missing', async () => {
      const config = {
        action: 'moveCursor',
        getTargetBy: 'getByText',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'requires target and getTargetBy',
      );
    });

    it('should return error when getTargetBy is missing', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Submit',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'requires target and getTargetBy',
      );
    });

    it('should return error when element not found', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Nonexistent',
        getTargetBy: 'getByText',
      };

      mockLocator.elementHandle.mockResolvedValue(null);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Element handle not found');
    });

    it('should return error when element is not visible', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Button',
        getTargetBy: 'getByText',
      };

      mockLocator.waitFor.mockRejectedValue(
        new Error('Element not visible'),
      );

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when unknown getTargetBy method is used', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Submit',
        getTargetBy: 'unknownMethod',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown getTargetBy method');
    });

    it('should handle timeout errors gracefully', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Button',
        getTargetBy: 'getByText',
      };

      mockLocator.waitFor.mockRejectedValue(
        Object.assign(new Error('Timeout'), { name: 'TimeoutError' }),
      );

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.retryable).toBe(true);
    });

    it('should return data with action details on success', async () => {
      const config = {
        action: 'moveCursor',
        target: 'Submit Button',
        getTargetBy: 'getByLabel',
        speed: 1000,
        jitter: 0.5,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        target: 'Submit Button',
        getTargetBy: 'getByLabel',
        options: {
          speed: 1000,
          jitter: 0.5,
          overshoot: undefined,
          minPauseMs: undefined,
          maxPauseMs: undefined,
          stepsMin: undefined,
          stepsMax: undefined,
          padding: undefined,
        },
      });
    });
  });
});

