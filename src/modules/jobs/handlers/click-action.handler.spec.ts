import { Test, TestingModule } from '@nestjs/testing';
import { ClickActionHandler } from './click-action.handler';
import { Page } from 'playwright';

describe('ClickActionHandler', () => {
  let handler: ClickActionHandler;
  let mockPage: jest.Mocked<Page>;
  let mockLocator: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClickActionHandler],
    }).compile();

    handler = module.get<ClickActionHandler>(ClickActionHandler);

    // Mock locator
    mockLocator = {
      click: jest.fn().mockResolvedValue(undefined),
      first: jest.fn().mockReturnThis(),
      nth: jest.fn().mockReturnThis(),
    };

    // Mock page
    mockPage = {
      getByLabel: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByPlaceholder: jest.fn().mockReturnValue(mockLocator),
      locator: jest.fn().mockReturnValue(mockLocator),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should click element using getByLabel', async () => {
      const config = {
        action: 'click',
        target: 'Submit',
        getTargetBy: 'getByLabel',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByLabel).toHaveBeenCalledWith('Submit');
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: 'left',
        timeout: 2000,
      });
    });

    it('should click element using getByText', async () => {
      const config = {
        action: 'click',
        target: 'Click me',
        getTargetBy: 'getByText',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('Click me');
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: 'left',
        timeout: 2000,
      });
    });

    it('should click with right button', async () => {
      const config = {
        action: 'click',
        target: 'Menu',
        getTargetBy: 'getByText',
        button: 'right',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: 'right',
        timeout: 2000,
      });
    });

    it('should click multiple times', async () => {
      const config = {
        action: 'click',
        target: 'Button',
        getTargetBy: 'getByText',
        clickCount: 3,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: 'left',
        clickCount: 3,
        timeout: 2000,
      });
    });

    it('should wait for navigation after click', async () => {
      const config = {
        action: 'click',
        target: 'Submit',
        getTargetBy: 'getByText',
        waitForNavigation: true,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('should wait for navigation after click', async () => {
      const config = {
        action: 'click',
        target: 'Submit',
        getTargetBy: 'getByText',
        waitForNavigation: true,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: 'left',
        timeout: 2000,
      });
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('should return error when target is missing', async () => {
      const config = {
        action: 'click',
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
        action: 'click',
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
        action: 'click',
        target: 'Nonexistent',
        getTargetBy: 'getByText',
      };

      const errorLocator = {
        click: jest.fn().mockRejectedValue(new Error('Element not found')),
        first: jest.fn().mockReturnThis(),
        nth: jest.fn().mockReturnThis(),
      };
      mockPage.getByText.mockReturnValue(errorLocator as any);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ELEMENT_NOT_FOUND_ERROR');
    });

    it('should return error when unknown getTargetBy method is used', async () => {
      const config = {
        action: 'click',
        target: 'Submit',
        getTargetBy: 'unknownMethod',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown getTargetBy method');
    });

    it('should handle timeout errors gracefully', async () => {
      const config = {
        action: 'click',
        target: 'Button',
        getTargetBy: 'getByText',
      };

      const error = new Error('Timeout');
      error.name = 'TimeoutError';
      const timeoutLocator = {
        click: jest.fn().mockRejectedValue(error),
        first: jest.fn().mockReturnThis(),
        nth: jest.fn().mockReturnThis(),
      };
      mockPage.getByText.mockReturnValue(timeoutLocator as any);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.retryable).toBe(true);
    });
  });
});
