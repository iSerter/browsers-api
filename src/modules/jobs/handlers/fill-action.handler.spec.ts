import { Test, TestingModule } from '@nestjs/testing';
import { FillActionHandler } from './fill-action.handler';
import { Page } from 'playwright';
import * as humanMouse from '../utils/human-mouse';

// Mock the human-mouse module
jest.mock('../utils/human-mouse', () => ({
  moveMouseHuman: jest.fn().mockResolvedValue(undefined),
}));

describe('FillActionHandler', () => {
  let handler: FillActionHandler;
  let mockPage: jest.Mocked<Page>;
  let mockLocator: any;
  let mockElementHandle: any;
  let mockMouse: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FillActionHandler],
    }).compile();

    handler = module.get<FillActionHandler>(FillActionHandler);

    // Mock element handle
    mockElementHandle = {
      boundingBox: jest.fn().mockResolvedValue({ x: 10, y: 10, width: 100, height: 30 }),
    };

    // Mock locator
    mockLocator = {
      waitFor: jest.fn().mockResolvedValue(undefined),
      elementHandle: jest.fn().mockResolvedValue(mockElementHandle),
      type: jest.fn().mockResolvedValue(undefined),
      first: jest.fn().mockReturnThis(),
      nth: jest.fn().mockReturnThis(),
    };

    // Mock mouse
    mockMouse = {
      down: jest.fn().mockResolvedValue(undefined),
      up: jest.fn().mockResolvedValue(undefined),
      move: jest.fn().mockResolvedValue(undefined),
    };

    // Mock page
    mockPage = {
      getByLabel: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByPlaceholder: jest.fn().mockReturnValue(mockLocator),
      locator: jest.fn().mockReturnValue(mockLocator),
      mouse: mockMouse,
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should fill field using getByLabel with human-like behavior', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data.humanLike).toBe(true);
      expect(mockPage.getByLabel).toHaveBeenCalledWith('Email');
      expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 2000 });
      expect(mockLocator.elementHandle).toHaveBeenCalled();
      expect(humanMouse.moveMouseHuman).toHaveBeenCalled();
      expect(mockMouse.down).toHaveBeenCalled();
      expect(mockMouse.up).toHaveBeenCalled();
      expect(mockLocator.type).toHaveBeenCalledWith('test@example.com', expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('should fill field using getByText with human-like behavior', async () => {
      const config = {
        action: 'fill',
        target: 'Username',
        getTargetBy: 'getByText',
        value: 'myuser',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('Username');
      expect(mockLocator.type).toHaveBeenCalledWith('myuser', expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('should fill field using getByRole with human-like behavior', async () => {
      const config = {
        action: 'fill',
        target: 'textbox',
        getTargetBy: 'getByRole',
        value: 'value',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByRole).toHaveBeenCalledWith('textbox');
      expect(mockLocator.type).toHaveBeenCalledWith('value', expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('should fill field using getByPlaceholder with human-like behavior', async () => {
      const config = {
        action: 'fill',
        target: 'Enter your email',
        getTargetBy: 'getByPlaceholder',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByPlaceholder).toHaveBeenCalledWith(
        'Enter your email',
      );
      expect(mockLocator.type).toHaveBeenCalledWith('test@example.com', expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('should fill field using getBySelector (locator) with human-like behavior', async () => {
      const config = {
        action: 'fill',
        target: '#email',
        getTargetBy: 'getBySelector',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith('#email');
      expect(mockLocator.type).toHaveBeenCalledWith('test@example.com', expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('should return error when target is missing', async () => {
      const config = {
        action: 'fill',
        getTargetBy: 'getByLabel',
        value: 'test',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('requires target, getTargetBy');
    });

    it('should return error when getTargetBy is missing', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('requires target, getTargetBy');
    });

    it('should return error when value is missing', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('requires target, getTargetBy');
    });

    it('should return error when element not found', async () => {
      const config = {
        action: 'fill',
        target: 'Nonexistent',
        getTargetBy: 'getByLabel',
        value: 'test',
      };

      mockPage.getByLabel.mockReturnValue({
        waitFor: jest.fn().mockRejectedValue(new Error('Element not found')),
        first: jest.fn().mockReturnThis(),
      } as any);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ELEMENT_NOT_FOUND_ERROR');
    });

    it('should return error when element handle is not found', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
        value: 'test@example.com',
      };

      mockLocator.elementHandle.mockResolvedValue(null);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Element handle not found');
    });

    it('should use custom typing delay when provided', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
        value: 'test@example.com',
        typingDelay: 100,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockLocator.type).toHaveBeenCalledWith('test@example.com', { delay: 100 });
    });

    it('should use custom mouse movement options when provided', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
        value: 'test@example.com',
        speed: 800,
        jitter: 0.8,
        padding: 10,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(humanMouse.moveMouseHuman).toHaveBeenCalledWith(
        mockPage,
        { el: mockElementHandle, padding: 10 },
        expect.objectContaining({
          speed: 800,
          jitter: 0.8,
        }),
      );
    });

    it('should return error when unknown getTargetBy method is used', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'unknownMethod',
        value: 'test',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown getTargetBy method');
    });
  });
});
