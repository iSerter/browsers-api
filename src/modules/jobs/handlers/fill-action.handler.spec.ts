import { Test, TestingModule } from '@nestjs/testing';
import { FillActionHandler } from './fill-action.handler';
import { Page } from 'playwright';

describe('FillActionHandler', () => {
  let handler: FillActionHandler;
  let mockPage: jest.Mocked<Page>;
  let mockLocator: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FillActionHandler],
    }).compile();

    handler = module.get<FillActionHandler>(FillActionHandler);

    // Mock locator
    mockLocator = {
      fill: jest.fn().mockResolvedValue(undefined),
    };

    // Mock page
    mockPage = {
      getByLabel: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByPlaceholder: jest.fn().mockReturnValue(mockLocator),
      locator: jest.fn().mockReturnValue(mockLocator),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should fill field using getByLabel', async () => {
      const config = {
        action: 'fill',
        target: 'Email',
        getTargetBy: 'getByLabel',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByLabel).toHaveBeenCalledWith('Email');
      expect(mockLocator.fill).toHaveBeenCalledWith('test@example.com');
    });

    it('should fill field using getByText', async () => {
      const config = {
        action: 'fill',
        target: 'Username',
        getTargetBy: 'getByText',
        value: 'myuser',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByText).toHaveBeenCalledWith('Username');
      expect(mockLocator.fill).toHaveBeenCalledWith('myuser');
    });

    it('should fill field using getByRole', async () => {
      const config = {
        action: 'fill',
        target: 'textbox',
        getTargetBy: 'getByRole',
        value: 'value',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.getByRole).toHaveBeenCalledWith('textbox');
      expect(mockLocator.fill).toHaveBeenCalledWith('value');
    });

    it('should fill field using getByPlaceholder', async () => {
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
      expect(mockLocator.fill).toHaveBeenCalledWith('test@example.com');
    });

    it('should fill field using getBySelector (locator)', async () => {
      const config = {
        action: 'fill',
        target: '#email',
        getTargetBy: 'getBySelector',
        value: 'test@example.com',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith('#email');
      expect(mockLocator.fill).toHaveBeenCalledWith('test@example.com');
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
        fill: jest.fn().mockRejectedValue(new Error('Element not found')),
      } as any);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ELEMENT_NOT_FOUND_ERROR');
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

