import { Test, TestingModule } from '@nestjs/testing';
import { ScreenshotActionHandler } from './screenshot-action.handler';
import { ArtifactStorageService } from '../services/artifact-storage.service';
import { Page } from 'playwright';

describe('ScreenshotActionHandler', () => {
  let handler: ScreenshotActionHandler;
  let artifactService: jest.Mocked<ArtifactStorageService>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(async () => {
    const artifactServiceMock = {
      saveArtifact: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScreenshotActionHandler,
        {
          provide: ArtifactStorageService,
          useValue: artifactServiceMock,
        },
      ],
    }).compile();

    handler = module.get<ScreenshotActionHandler>(ScreenshotActionHandler);
    artifactService = module.get(ArtifactStorageService);

    // Mock page
    mockPage = {
      screenshot: jest.fn().mockResolvedValue(Buffer.from('PNG content')),
    } as any;

    // Setup default mocks
    artifactService.saveArtifact.mockResolvedValue('path/to/file.png');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should take screenshot with default options', async () => {
      const config = {
        action: 'screenshot',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: false,
        type: 'png',
        quality: 80,
      });
      expect(artifactService.saveArtifact).toHaveBeenCalled();
    });

    it('should take full page screenshot', async () => {
      const config = {
        action: 'screenshot',
        fullPage: true,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          fullPage: true,
        }),
      );
    });

    it('should take JPEG screenshot', async () => {
      const config = {
        action: 'screenshot',
        type: 'jpeg',
        quality: 90,
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'jpeg',
          quality: 90,
        }),
      );
    });

    it('should save JPEG with correct filename and mime type', async () => {
      const config = {
        action: 'screenshot',
        type: 'jpeg',
      };

      await handler.execute(mockPage, config, 'test-job-id');

      expect(artifactService.saveArtifact).toHaveBeenCalledWith(
        Buffer.from('PNG content'),
        'test-job-id',
        expect.stringMatching(/^\d+-screenshot\.jpg$/),
        'screenshot',
        'image/jpeg',
      );
    });

    it('should save PNG with correct filename and mime type', async () => {
      const config = {
        action: 'screenshot',
        type: 'png',
      };

      await handler.execute(mockPage, config, 'test-job-id');

      expect(artifactService.saveArtifact).toHaveBeenCalledWith(
        Buffer.from('PNG content'),
        'test-job-id',
        expect.stringMatching(/^\d+-screenshot\.png$/),
        'screenshot',
        'image/png',
      );
    });

    it('should return artifact path in result', async () => {
      const config = {
        action: 'screenshot',
      };

      artifactService.saveArtifact.mockResolvedValue(
        'artifacts/123/file.png',
      );

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.artifactId).toBe('artifacts/123/file.png');
    });

    it('should return data with file information', async () => {
      const config = {
        action: 'screenshot',
      };

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe('path/to/file.png');
      expect(result.data.type).toBe('png');
      expect(result.data.size).toBeDefined();
      expect(result.data.mimeType).toBe('image/png');
    });

    it('should handle screenshot errors', async () => {
      const config = {
        action: 'screenshot',
      };

      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Screenshot failed');
    });

    it('should handle timeout errors gracefully', async () => {
      const config = {
        action: 'screenshot',
      };

      const error = new Error('Timeout');
      error.name = 'TimeoutError';
      mockPage.screenshot.mockRejectedValue(error);

      const result = await handler.execute(mockPage, config, 'test-job-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.retryable).toBe(true);
    });
  });
});

