import { Test, TestingModule } from '@nestjs/testing';
import { BrowserContextManagerService } from './browser-context-manager.service';
import { Browser, BrowserContext } from 'playwright';
import { CreateContextOptions } from '../interfaces/browser-pool.interface';

describe('BrowserContextManagerService', () => {
  let service: BrowserContextManagerService;
  let mockBrowser: jest.Mocked<Browser>;
  let mockContext: jest.Mocked<BrowserContext>;

  beforeEach(async () => {
    mockContext = {
      pages: jest.fn().mockReturnValue([]),
      close: jest.fn().mockResolvedValue(undefined),
      browser: jest.fn().mockReturnValue(mockBrowser),
      route: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [BrowserContextManagerService],
    }).compile();

    service = module.get<BrowserContextManagerService>(
      BrowserContextManagerService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createContext', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create context without proxy', async () => {
      const options: CreateContextOptions = {
        viewport: { width: 1920, height: 1080 },
      };

      const context = await service.createContext(mockBrowser, options);

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
          ignoreHTTPSErrors: true,
          timeout: 30000,
        }),
      );
      expect(context).toBe(mockContext);
    });

    it('should create context with proxy server only', async () => {
      const options: CreateContextOptions = {
        viewport: { width: 1920, height: 1080 },
        proxy: {
          server: 'http://proxy.example.com:8080',
        },
      };

      const context = await service.createContext(mockBrowser, options);

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
          proxy: {
            server: 'http://proxy.example.com:8080',
          },
        }),
      );
      expect(context).toBe(mockContext);
    });

    it('should create context with proxy and authentication', async () => {
      const options: CreateContextOptions = {
        viewport: { width: 1920, height: 1080 },
        proxy: {
          server: 'http://proxy.example.com:8080',
          username: 'user',
          password: 'pass',
        },
      };

      const context = await service.createContext(mockBrowser, options);

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
          proxy: {
            server: 'http://proxy.example.com:8080',
            username: 'user',
            password: 'pass',
          },
        }),
      );
      expect(context).toBe(mockContext);
    });

    it('should create context with proxy username only (no password)', async () => {
      const options: CreateContextOptions = {
        viewport: { width: 1920, height: 1080 },
        proxy: {
          server: 'http://proxy.example.com:8080',
          username: 'user',
        },
      };

      const context = await service.createContext(mockBrowser, options);

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: {
            server: 'http://proxy.example.com:8080',
            username: 'user',
          },
        }),
      );
      expect(context).toBe(mockContext);
    });

    it('should handle context creation errors', async () => {
      const error = new Error('Failed to create context');
      mockBrowser.newContext.mockRejectedValue(error);

      const options: CreateContextOptions = {
        viewport: { width: 1920, height: 1080 },
      };

      await expect(service.createContext(mockBrowser, options)).rejects.toThrow(
        'Failed to create context',
      );
    });
  });

  describe('closeContext', () => {
    it('should close context successfully', async () => {
      await service.closeContext(mockContext);

      expect(mockContext.pages).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
    });

    it('should handle errors when closing context', async () => {
      mockContext.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(service.closeContext(mockContext)).resolves.not.toThrow();
    });
  });
});

