import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SnapshotActionHandler } from './snapshot-action.handler';
import { ArtifactStorageService } from '../services/artifact-storage.service';
import { ArtifactType } from '../entities/job-artifact.entity';
import { SnapshotConfigDto } from '../dto/action-config.dto';
import { Page, BrowserContext } from 'playwright';

describe('SnapshotActionHandler', () => {
  let handler: SnapshotActionHandler;
  let artifactService: jest.Mocked<ArtifactStorageService>;
  let mockPage: jest.Mocked<Page>;
  let mockContext: jest.Mocked<BrowserContext>;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const artifactServiceMock = {
      saveArtifact: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotActionHandler,
        {
          provide: ArtifactStorageService,
          useValue: artifactServiceMock,
        },
      ],
    }).compile();

    handler = module.get<SnapshotActionHandler>(SnapshotActionHandler);
    artifactService = module.get(ArtifactStorageService);

    // Mock BrowserContext
    mockContext = {
      cookies: jest.fn().mockResolvedValue([
        { name: 'session', value: 'abc123', domain: 'example.com' },
        { name: 'token', value: 'xyz789', domain: 'example.com' },
      ]),
    } as any;

    // Mock Page with all required methods
    mockPage = {
      content: jest.fn().mockResolvedValue('<html><body>Test Content</body></html>'),
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page Title'),
      viewportSize: jest.fn().mockReturnValue({ width: 1920, height: 1080 }),
      evaluate: jest.fn(),
      context: jest.fn().mockReturnValue(mockContext),
    } as any;

    // Setup default mocks
    artifactService.saveArtifact.mockResolvedValue('artifacts/test-job-id/1234567890-snapshot.json');

    // Mock logger methods
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    // Setup default evaluate mocks for metadata
    mockPage.evaluate.mockImplementation((fn: any) => {
      if (fn.toString().includes('navigator.userAgent')) {
        return Promise.resolve('Mozilla/5.0 Test User Agent');
      }
      if (fn.toString().includes('navigator.language')) {
        return Promise.resolve('en-US');
      }
      if (fn.toString().includes('navigator.platform')) {
        return Promise.resolve('MacIntel');
      }
      if (fn.toString().includes('Intl.DateTimeFormat')) {
        return Promise.resolve('America/New_York');
      }
      if (fn.toString().includes('localStorage')) {
        return Promise.resolve({ key1: 'value1', key2: 'value2' });
      }
      if (fn.toString().includes('sessionStorage')) {
        return Promise.resolve({ sessionKey1: 'sessionValue1' });
      }
      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
      expect(handler.execute).toBeDefined();
    });

    it('should be callable', async () => {
      const config = {
        action: 'snapshot' as any,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    describe('Basic functionality', () => {
      it('should capture HTML content using page.content()', async () => {
        const config = {
          action: 'snapshot' as any,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.content).toHaveBeenCalledTimes(1);
      });

      it('should capture URL using page.url()', async () => {
        const config = {
          action: 'snapshot' as any,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.url).toHaveBeenCalledTimes(1);
      });

      it('should capture page title using page.title()', async () => {
        const config = {
          action: 'snapshot' as any,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.title).toHaveBeenCalledTimes(1);
      });

      it('should capture viewport dimensions', async () => {
        const config = {
          action: 'snapshot' as any,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.viewportSize).toHaveBeenCalledTimes(1);
      });
    });

    describe('Configuration combinations', () => {
      it('should capture cookies when cookies option is enabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.context).toHaveBeenCalled();
        expect(mockContext.cookies).toHaveBeenCalledTimes(1);
      });

      it('should not capture cookies when cookies option is disabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: false,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).not.toHaveBeenCalled();
      });

      it('should capture localStorage when localStorage option is enabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            localStorage: true,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.evaluate).toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        expect(hasLocalStorageCall).toBe(true);
      });

      it('should not capture localStorage when localStorage option is disabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            localStorage: false,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        expect(hasLocalStorageCall).toBe(false);
      });

      it('should capture sessionStorage when sessionStorage option is enabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasSessionStorageCall).toBe(true);
      });

      it('should not capture sessionStorage when sessionStorage option is disabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            sessionStorage: false,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasSessionStorageCall).toBe(false);
      });

      it('should capture all options when all are enabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
            localStorage: true,
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasLocalStorageCall).toBe(true);
        expect(hasSessionStorageCall).toBe(true);
      });

      it('should not capture any optional data when all options are disabled', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: false,
            localStorage: false,
            sessionStorage: false,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).not.toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasLocalStorageCall).toBe(false);
        expect(hasSessionStorageCall).toBe(false);
      });

      it('should handle mixed configurations (cookies and localStorage enabled, sessionStorage disabled)', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
            localStorage: true,
            sessionStorage: false,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasLocalStorageCall).toBe(true);
        expect(hasSessionStorageCall).toBe(false);
      });

      it('should use default values (all false) when snapshotConfig is not provided', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).not.toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasLocalStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('localStorage'),
        );
        const hasSessionStorageCall = evaluateCalls.some((call) =>
          call[0].toString().includes('sessionStorage'),
        );
        expect(hasLocalStorageCall).toBe(false);
        expect(hasSessionStorageCall).toBe(false);
      });

      it('should use default values when snapshotConfig is empty object', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {},
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockContext.cookies).not.toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should handle errors when page.content() throws an error', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Failed to get content');
        mockPage.content.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Failed to get content');
      });

      it('should handle errors when page.cookies() throws an error', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
          } as SnapshotConfigDto,
        };

        const error = new Error('Failed to get cookies');
        mockContext.cookies.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        // Should continue execution and set cookies to null
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });

      it('should handle errors when page.evaluate() throws an error for localStorage', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            localStorage: true,
          } as SnapshotConfigDto,
        };

        mockPage.evaluate.mockImplementation((fn: any) => {
          if (fn.toString().includes('localStorage')) {
            return Promise.reject(new Error('Failed to get localStorage'));
          }
          if (fn.toString().includes('navigator.userAgent')) {
            return Promise.resolve('Mozilla/5.0 Test User Agent');
          }
          if (fn.toString().includes('navigator.language')) {
            return Promise.resolve('en-US');
          }
          if (fn.toString().includes('navigator.platform')) {
            return Promise.resolve('MacIntel');
          }
          if (fn.toString().includes('Intl.DateTimeFormat')) {
            return Promise.resolve('America/New_York');
          }
          return Promise.resolve(undefined);
        });

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        // Should continue execution and set localStorage to null
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });

      it('should handle errors when page.evaluate() throws an error for sessionStorage', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        mockPage.evaluate.mockImplementation((fn: any) => {
          if (fn.toString().includes('sessionStorage')) {
            return Promise.reject(new Error('Failed to get sessionStorage'));
          }
          if (fn.toString().includes('navigator.userAgent')) {
            return Promise.resolve('Mozilla/5.0 Test User Agent');
          }
          if (fn.toString().includes('navigator.language')) {
            return Promise.resolve('en-US');
          }
          if (fn.toString().includes('navigator.platform')) {
            return Promise.resolve('MacIntel');
          }
          if (fn.toString().includes('Intl.DateTimeFormat')) {
            return Promise.resolve('America/New_York');
          }
          return Promise.resolve(undefined);
        });

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        // Should continue execution and set sessionStorage to null
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });

      it('should handle errors when JobArtifactService.save() fails', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Failed to save artifact');
        artifactService.saveArtifact.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Failed to save artifact');
      });

      it('should handle timeout errors with correct error code', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Timeout');
        error.name = 'TimeoutError';
        mockPage.content.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('TIMEOUT_ERROR');
        expect(result.error?.retryable).toBe(true);
      });

      it('should handle unknown errors with correct error code', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Unknown error');
        error.name = 'UnknownError';
        mockPage.content.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('UNKNOWN_ERROR');
        expect(result.error?.retryable).toBe(false);
      });

      it('should handle errors when page.title() throws an error', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.title.mockRejectedValue(new Error('Failed to get title'));

        const result = await handler.execute(mockPage, config, 'test-job-id');

        // Should continue execution despite title error
        expect(result.success).toBe(true);
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });

      it('should handle errors when page.evaluate() throws for userAgent', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.evaluate.mockImplementation((fn: any) => {
          if (fn.toString().includes('navigator.userAgent')) {
            return Promise.reject(new Error('Failed to get user agent'));
          }
          if (fn.toString().includes('navigator.language')) {
            return Promise.resolve('en-US');
          }
          if (fn.toString().includes('navigator.platform')) {
            return Promise.resolve('MacIntel');
          }
          if (fn.toString().includes('Intl.DateTimeFormat')) {
            return Promise.resolve('America/New_York');
          }
          return Promise.resolve(undefined);
        });

        const result = await handler.execute(mockPage, config, 'test-job-id');

        // Should continue execution despite userAgent error
        expect(result.success).toBe(true);
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });
    });

    describe('Metadata capture', () => {
      it('should capture timestamp and format it correctly as ISO string', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const beforeTime = new Date().toISOString();
        const result = await handler.execute(mockPage, config, 'test-job-id');
        const afterTime = new Date().toISOString();

        expect(result.success).toBe(true);
        expect(result.data?.timestamp).toBeDefined();
        const timestamp = result.data?.timestamp as string;
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
        expect(timestamp >= beforeTime).toBe(true);
        expect(timestamp <= afterTime).toBe(true);
      });

      it('should capture user agent from page context', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.evaluate).toHaveBeenCalled();
        const evaluateCalls = (mockPage.evaluate as jest.Mock).mock.calls;
        const hasUserAgentCall = evaluateCalls.some((call) =>
          call[0].toString().includes('navigator.userAgent'),
        );
        expect(hasUserAgentCall).toBe(true);
      });

      it('should capture viewport dimensions', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(mockPage.viewportSize).toHaveBeenCalled();
      });

      it('should include all metadata fields in the final artifact', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(artifactService.saveArtifact).toHaveBeenCalled();
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());

        expect(jsonData.metadata).toBeDefined();
        expect(jsonData.metadata.viewport).toBeDefined();
        expect(jsonData.metadata.userAgent).toBeDefined();
        expect(jsonData.metadata.language).toBeDefined();
        expect(jsonData.metadata.platform).toBeDefined();
        expect(jsonData.metadata.timezone).toBeDefined();
      });

      it('should handle null viewport gracefully', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.viewportSize.mockReturnValue(null);

        await handler.execute(mockPage, config, 'test-job-id');

        expect(artifactService.saveArtifact).toHaveBeenCalled();
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());

        expect(jsonData.metadata.viewport).toBeNull();
      });
    });

    describe('Artifact creation', () => {
      it('should call JobArtifactService.save() with correct parameters', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(artifactService.saveArtifact).toHaveBeenCalledTimes(1);
        const callArgs = artifactService.saveArtifact.mock.calls[0];

        expect(callArgs[0]).toBeInstanceOf(Buffer);
        expect(callArgs[1]).toBe('test-job-id');
        expect(callArgs[2]).toMatch(/^\d+-snapshot\.json$/);
        expect(callArgs[3]).toBe(ArtifactType.SNAPSHOT);
        expect(callArgs[4]).toBe('application/json');
      });

      it('should set artifact type to ArtifactType.SNAPSHOT', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(artifactService.saveArtifact).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.any(String),
          expect.any(String),
          ArtifactType.SNAPSHOT,
          expect.any(String),
        );
      });

      it('should format artifact data as JSON', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonString = buffer.toString('utf-8');

        expect(() => JSON.parse(jsonString)).not.toThrow();
        const jsonData = JSON.parse(jsonString);
        expect(jsonData).toHaveProperty('html');
        expect(jsonData).toHaveProperty('url');
        expect(jsonData).toHaveProperty('timestamp');
        expect(jsonData).toHaveProperty('metadata');
      });

      it('should include all captured data in the artifact', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
            localStorage: true,
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());

        expect(jsonData.html).toBeDefined();
        expect(jsonData.url).toBeDefined();
        expect(jsonData.title).toBeDefined();
        expect(jsonData.timestamp).toBeDefined();
        expect(jsonData.metadata).toBeDefined();
        expect(jsonData.cookies).toBeDefined();
        expect(jsonData.localStorage).toBeDefined();
        expect(jsonData.sessionStorage).toBeDefined();
      });

      it('should generate filename following expected naming convention', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const filename = callArgs[2] as string;

        expect(filename).toMatch(/^\d+-snapshot\.json$/);
      });

      it('should include correct mime type in artifact save call', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(artifactService.saveArtifact).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'application/json',
        );
      });
    });

    describe('Integration-style tests', () => {
      it('should execute complete flow from start to finish', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
            localStorage: true,
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        expect(result.artifactId).toBeDefined();
        expect(result.data).toBeDefined();
        expect(mockPage.content).toHaveBeenCalled();
        expect(mockPage.url).toHaveBeenCalled();
        expect(mockPage.title).toHaveBeenCalled();
        expect(artifactService.saveArtifact).toHaveBeenCalled();
      });

      it('should return expected result structure on success', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('artifactId');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('filePath');
        expect(result.data).toHaveProperty('size');
        expect(result.data).toHaveProperty('mimeType');
        expect(result.data).toHaveProperty('url');
        expect(result.data).toHaveProperty('title');
        expect(result.data).toHaveProperty('timestamp');
      });

      it('should return expected result structure on failure', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Test error');
        mockPage.content.mockRejectedValue(error);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('message');
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('retryable');
      });
    });

    describe('Edge cases and boundary conditions', () => {
      it('should handle empty HTML content', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.content.mockResolvedValue('');

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        expect(artifactService.saveArtifact).toHaveBeenCalled();
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.html).toBe('');
      });

      it('should handle empty URL', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.url.mockReturnValue('');

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.url).toBe('');
      });

      it('should handle undefined title gracefully', async () => {
        const config: any = {
          action: 'snapshot',
        };

        mockPage.title.mockResolvedValue(undefined as any);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.title).toBeUndefined();
      });

      it('should handle empty cookies array', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            cookies: true,
          } as SnapshotConfigDto,
        };

        mockContext.cookies.mockResolvedValue([]);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.cookies).toEqual([]);
      });

      it('should handle empty localStorage object', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            localStorage: true,
          } as SnapshotConfigDto,
        };

        mockPage.evaluate.mockImplementation((fn: any) => {
          if (fn.toString().includes('localStorage')) {
            return Promise.resolve({});
          }
          if (fn.toString().includes('navigator.userAgent')) {
            return Promise.resolve('Mozilla/5.0 Test User Agent');
          }
          if (fn.toString().includes('navigator.language')) {
            return Promise.resolve('en-US');
          }
          if (fn.toString().includes('navigator.platform')) {
            return Promise.resolve('MacIntel');
          }
          if (fn.toString().includes('Intl.DateTimeFormat')) {
            return Promise.resolve('America/New_York');
          }
          return Promise.resolve(undefined);
        });

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.localStorage).toEqual({});
      });

      it('should handle empty sessionStorage object', async () => {
        const config: any = {
          action: 'snapshot',
          snapshotConfig: {
            sessionStorage: true,
          } as SnapshotConfigDto,
        };

        mockPage.evaluate.mockImplementation((fn: any) => {
          if (fn.toString().includes('sessionStorage')) {
            return Promise.resolve({});
          }
          if (fn.toString().includes('navigator.userAgent')) {
            return Promise.resolve('Mozilla/5.0 Test User Agent');
          }
          if (fn.toString().includes('navigator.language')) {
            return Promise.resolve('en-US');
          }
          if (fn.toString().includes('navigator.platform')) {
            return Promise.resolve('MacIntel');
          }
          if (fn.toString().includes('Intl.DateTimeFormat')) {
            return Promise.resolve('America/New_York');
          }
          return Promise.resolve(undefined);
        });

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.sessionStorage).toEqual({});
      });

      it('should handle very long HTML content', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const longContent = '<html><body>' + 'x'.repeat(100000) + '</body></html>';
        mockPage.content.mockResolvedValue(longContent);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        expect(artifactService.saveArtifact).toHaveBeenCalled();
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.html).toBe(longContent);
      });

      it('should handle special characters in HTML content', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const specialContent = '<html><body>Test & "quotes" & <tags></body></html>';
        mockPage.content.mockResolvedValue(specialContent);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.html).toBe(specialContent);
      });

      it('should handle unicode characters in content', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const unicodeContent = '<html><body>测试 🚀 émojis</body></html>';
        mockPage.content.mockResolvedValue(unicodeContent);

        const result = await handler.execute(mockPage, config, 'test-job-id');

        expect(result.success).toBe(true);
        const callArgs = artifactService.saveArtifact.mock.calls[0];
        const buffer = callArgs[0] as Buffer;
        const jsonData = JSON.parse(buffer.toString());
        expect(jsonData.html).toBe(unicodeContent);
      });
    });

    describe('Logging', () => {
      it('should log start of snapshot action', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Starting snapshot action for job test-job-id'),
        );
      });

      it('should log successful completion', async () => {
        const config: any = {
          action: 'snapshot',
        };

        await handler.execute(mockPage, config, 'test-job-id');

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Snapshot saved successfully'),
        );
      });

      it('should log errors when execution fails', async () => {
        const config: any = {
          action: 'snapshot',
        };

        const error = new Error('Test error');
        mockPage.content.mockRejectedValue(error);

        const errorSpy = jest.spyOn(Logger.prototype, 'error');

        await handler.execute(mockPage, config, 'test-job-id');

        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Snapshot action failed for job test-job-id'),
        );
      });
    });
  });
});

