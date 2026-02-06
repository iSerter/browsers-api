import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { ExecuteScriptActionHandler } from './execute-script-action.handler';
import { Page } from 'playwright';

describe('ExecuteScriptActionHandler', () => {
  let handler: ExecuteScriptActionHandler;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecuteScriptActionHandler,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    handler = module.get<ExecuteScriptActionHandler>(
      ExecuteScriptActionHandler,
    );

    // Mock page
    mockPage = {
      evaluate: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should throw ForbiddenException when ENABLE_EXECUTE_SCRIPT is false', async () => {
      mockConfigService.get.mockReturnValue(false);

      const config = {
        action: 'executeScript',
        script: 'console.log("test")',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SCRIPT_EXECUTION_DISABLED');
      expect(result.error?.message).toContain('executeScript action is disabled');
      expect(result.error?.retryable).toBe(false);
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'ENABLE_EXECUTE_SCRIPT',
        false,
      );
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when ENABLE_EXECUTE_SCRIPT is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const config = {
        action: 'executeScript',
        script: 'console.log("test")',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SCRIPT_EXECUTION_DISABLED');
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should execute script successfully when ENABLE_EXECUTE_SCRIPT is true', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockResolvedValue({ result: 'success' });

      const config = {
        action: 'executeScript',
        script: 'return document.title',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        scriptLength: 21,
        result: { result: 'success' },
      });
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'ENABLE_EXECUTE_SCRIPT',
        false,
      );
      expect(mockPage.evaluate).toHaveBeenCalledWith('(() => { return document.title })()');
    });

    it('should handle script evaluation errors', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockRejectedValue(
        new Error('ReferenceError: foo is not defined'),
      );

      const config = {
        action: 'executeScript',
        script: 'return foo.bar',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('foo is not defined');
      expect(result.error?.code).toBe('SCRIPT_EVALUATION_ERROR');
      expect(result.error?.retryable).toBe(false);
    });

    it('should reject empty script', async () => {
      mockConfigService.get.mockReturnValue(true);

      const config = {
        action: 'executeScript',
        script: '   ',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Script cannot be empty');
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should reject missing script', async () => {
      mockConfigService.get.mockReturnValue(true);

      const config = {
        action: 'executeScript',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'ExecuteScript action requires a valid script string',
      );
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should reject non-string script', async () => {
      mockConfigService.get.mockReturnValue(true);

      const config = {
        action: 'executeScript',
        script: 123 as any,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        'ExecuteScript action requires a valid script string',
      );
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should handle timeout errors as retryable', async () => {
      mockConfigService.get.mockReturnValue(true);
      const timeoutError = new Error('Timeout exceeded');
      timeoutError.name = 'TimeoutError';
      mockPage.evaluate.mockRejectedValue(timeoutError);

      const config = {
        action: 'executeScript',
        script: 'while(true){}',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SCRIPT_TIMEOUT');
      expect(result.error?.retryable).toBe(true);
    });

    it('should handle navigation errors as retryable', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockRejectedValue(
        new Error('Navigation interrupted by script'),
      );

      const config = {
        action: 'executeScript',
        script: 'window.location.reload()',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.retryable).toBe(true);
    });

    it('should execute complex script and return result', async () => {
      mockConfigService.get.mockReturnValue(true);
      const expectedResult = {
        title: 'Test Page',
        links: 5,
        url: 'https://example.com',
      };
      mockPage.evaluate.mockResolvedValue(expectedResult);

      const config = {
        action: 'executeScript',
        script: `
          return {
            title: document.title,
            links: document.querySelectorAll('a').length,
            url: window.location.href
          }
        `,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data?.result).toEqual(expectedResult);
      expect(result.data?.scriptLength).toBeGreaterThan(0);
    });

    it('should execute script that returns primitive values', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockResolvedValue(42);

      const config = {
        action: 'executeScript',
        script: 'return 6 * 7',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(42);
    });

    it('should execute script that returns null', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockResolvedValue(null);

      const config = {
        action: 'executeScript',
        script: 'return null',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data?.result).toBeNull();
    });

    it('should execute script that returns undefined', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockPage.evaluate.mockResolvedValue(undefined);

      const config = {
        action: 'executeScript',
        script: 'console.log("test")',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data?.result).toBeUndefined();
    });
  });
});

