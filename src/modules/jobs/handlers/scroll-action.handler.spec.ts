import { Test, TestingModule } from '@nestjs/testing';
import { ScrollActionHandler } from './scroll-action.handler';
import { Page } from 'playwright';
import { humanScroll } from '../utils/human-scroll';

// Mock the human-scroll module
jest.mock('../utils/human-scroll');

describe('ScrollActionHandler', () => {
  let handler: ScrollActionHandler;
  let mockPage: jest.Mocked<Page>;
  let mockLocator: any;
  let mockElement: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScrollActionHandler],
    }).compile();

    handler = module.get<ScrollActionHandler>(ScrollActionHandler);

    // Mock element handle
    mockElement = {
      boundingBox: jest.fn().mockResolvedValue({
        x: 100,
        y: 1000,
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
      viewportSize: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      evaluate: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock the human-scroll function
    (humanScroll as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should scroll to specific Y position', async () => {
      const config = {
        action: 'scroll',
        targetY: 1000,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(humanScroll).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          targetY: 1000,
        }),
      );
    });

    it('should scroll to element using getByText', async () => {
      const config = {
        action: 'scroll',
        target: 'Footer',
        getTargetBy: 'getByText',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('Footer');
      expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'visible' });
      expect(mockLocator.elementHandle).toHaveBeenCalled();
      expect(humanScroll).toHaveBeenCalled();
    });

    it('should scroll to element using getBySelector', async () => {
      const config = {
        action: 'scroll',
        target: '#footer',
        getTargetBy: 'getBySelector',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith('#footer');
      expect(humanScroll).toHaveBeenCalled();
    });

    it('should pass custom options to humanScroll', async () => {
      const config = {
        action: 'scroll',
        targetY: 2000,
        speed: 2000,
        variance: 0.4,
        stepMin: 50,
        stepMax: 200,
        pauseChance: 0.2,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(humanScroll).toHaveBeenCalledWith(
        mockPage,
        {
          targetY: 2000,
          speed: 2000,
          variance: 0.4,
          stepMin: 50,
          stepMax: 200,
          pauseChance: 0.2,
        },
      );
    });

    it('should calculate target Y from element position', async () => {
      const config = {
        action: 'scroll',
        target: '#footer',
        getTargetBy: 'getBySelector',
      };

      mockElement.boundingBox.mockResolvedValue({
        x: 100,
        y: 5000,
        width: 100,
        height: 100,
      });

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(humanScroll).toHaveBeenCalled();
      const callArgs = (humanScroll as jest.Mock).mock.calls[0];
      expect(callArgs[1].targetY).toBeGreaterThan(0);
    });

    it('should scroll to bottom when no target specified', async () => {
      const config = {
        action: 'scroll',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(humanScroll).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          targetY: undefined,
        }),
      );
    });

    it('should return error when element not found', async () => {
      const config = {
        action: 'scroll',
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
        action: 'scroll',
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

    it('should return error when element has no bounding box', async () => {
      const config = {
        action: 'scroll',
        target: '#footer',
        getTargetBy: 'getBySelector',
      };

      mockElement.boundingBox.mockResolvedValue(null);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Element not visible for scroll target');
    });

    it('should return error when unknown getTargetBy method is used', async () => {
      const config = {
        action: 'scroll',
        target: 'Submit',
        getTargetBy: 'unknownMethod',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown getTargetBy method');
    });

    it('should handle timeout errors gracefully', async () => {
      const config = {
        action: 'scroll',
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
        action: 'scroll',
        targetY: 1500,
        speed: 2000,
        variance: 0.3,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        target: undefined,
        getTargetBy: undefined,
        targetY: 1500,
        options: {
          speed: 2000,
          variance: 0.3,
          stepMin: undefined,
          stepMax: undefined,
          pauseChance: undefined,
        },
      });
    });
  });
});

