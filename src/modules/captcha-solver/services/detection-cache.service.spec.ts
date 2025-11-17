import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DetectionCacheService } from './detection-cache.service';
import { MultiDetectionResult, AntiBotSystemType } from '../interfaces';

describe('DetectionCacheService', () => {
  let service: DetectionCacheService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionCacheService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DetectionCacheService>(DetectionCacheService);
    
    // Wait for onModuleInit to complete
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = '<html><body>Test</body></html>';
      const hash1 = service.generateContentHash(content);
      const hash2 = service.generateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should generate different hashes for different content', () => {
      const content1 = '<html><body>Test 1</body></html>';
      const content2 = '<html><body>Test 2</body></html>';
      const hash1 = service.generateContentHash(content1);
      const hash2 = service.generateContentHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty content', () => {
      const hash = service.generateContentHash('');
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('get and set', () => {
    const url = 'https://example.com';
    const content = '<html><body>Test</body></html>';
    const mockResult: MultiDetectionResult = {
      detections: [],
      primary: null,
      totalDurationMs: 100,
      analyzedAt: new Date(),
    };

    it('should return null for non-existent cache entry', async () => {
      const result = await service.get(url, content);
      expect(result).toBeNull();
    });

    it('should store and retrieve cached result', async () => {
      await service.set(url, content, mockResult);
      const cached = await service.get(url, content);

      expect(cached).toBeDefined();
      expect(cached?.detections).toEqual(mockResult.detections);
      expect(cached?.primary).toEqual(mockResult.primary);
      expect(cached?.totalDurationMs).toBe(mockResult.totalDurationMs);
    });

    it('should return null for different content hash', async () => {
      await service.set(url, content, mockResult);
      const differentContent = '<html><body>Different</body></html>';
      const cached = await service.get(url, differentContent);

      expect(cached).toBeNull();
    });

    it('should return null for different URL', async () => {
      await service.set(url, content, mockResult);
      const differentUrl = 'https://different.com';
      const cached = await service.get(differentUrl, content);

      expect(cached).toBeNull();
    });

    it('should handle cache errors gracefully', async () => {
      // Mock cache.get to throw an error
      const originalGet = service['cache'].get;
      service['cache'].get = jest.fn().mockRejectedValue(new Error('Cache error'));

      const result = await service.get(url, content);
      expect(result).toBeNull();

      // Restore original
      service['cache'].get = originalGet;
    });

    it('should handle cache set errors gracefully', async () => {
      // Mock cache.set to throw an error
      const originalSet = service['cache'].set;
      service['cache'].set = jest.fn().mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(service.set(url, content, mockResult)).resolves.not.toThrow();

      // Restore original
      service['cache'].set = originalSet;
    });
  });

  describe('normalizeUrl', () => {
    it('should remove tracking query parameters', () => {
      const url = 'https://example.com/page?utm_source=test&utm_medium=email&id=123';
      const normalized = service['normalizeUrl'](url);
      
      expect(normalized).not.toContain('utm_source');
      expect(normalized).not.toContain('utm_medium');
      expect(normalized).toContain('id=123'); // Non-tracking params should remain
    });

    it('should handle URLs without query parameters', () => {
      const url = 'https://example.com/page';
      const normalized = service['normalizeUrl'](url);
      
      expect(normalized).toBe(url);
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const normalized = service['normalizeUrl'](invalidUrl);
      
      expect(normalized).toBe(invalidUrl);
    });
  });

  describe('getStats', () => {
    it('should return initial stats with zero values', () => {
      const stats = service.getStats();
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should track cache hits and misses', async () => {
      const url = 'https://example.com';
      const content = '<html><body>Test</body></html>';
      const mockResult: MultiDetectionResult = {
        detections: [],
        primary: null,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      // Miss
      await service.get(url, content);
      
      // Set and hit
      await service.set(url, content, mockResult);
      await service.get(url, content);

      const stats = service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50);
    });

    it('should calculate hit rate correctly', async () => {
      const url = 'https://example.com';
      const content = '<html><body>Test</body></html>';
      const mockResult: MultiDetectionResult = {
        detections: [],
        primary: null,
        totalDurationMs: 100,
        analyzedAt: new Date(),
      };

      // 2 misses, 1 hit
      await service.get(url, content);
      await service.get(url, 'different');
      await service.set(url, content, mockResult);
      await service.get(url, content);

      const stats = service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
    });
  });

  describe('resetStats', () => {
    it('should reset cache statistics', async () => {
      const url = 'https://example.com';
      const content = '<html><body>Test</body></html>';
      
      await service.get(url, content);
      
      let stats = service.getStats();
      expect(stats.misses).toBe(1);

      service.resetStats();
      
      stats = service.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('should handle invalidation request without error', async () => {
      const url = 'https://example.com';
      
      await expect(service.invalidate(url)).resolves.not.toThrow();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize in-memory cache when Redis is not available', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      
      const newService = new DetectionCacheService(mockConfigService);
      await newService.onModuleInit();
      
      expect(newService['cache']).toBeDefined();
    });

    it('should use configured TTL from environment', async () => {
      const customTtl = 600000; // 10 minutes
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'CAPTCHA_CACHE_TTL') {
          return customTtl;
        }
        return undefined;
      });

      const newService = new DetectionCacheService(mockConfigService);
      await newService.onModuleInit();
      
      expect(newService['cacheConfig'].ttl).toBe(customTtl);
    });
  });
});

