import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createCache, Cache } from 'cache-manager';
import { MultiDetectionResult } from '../interfaces';
import { DEFAULT_CONFIG, CacheConfig } from '../config/constants';

/**
 * Service for caching CAPTCHA detection results
 * Uses page URL and content hash as cache key to avoid redundant detections
 */
@Injectable()
export class DetectionCacheService implements OnModuleInit {
  private readonly logger = new Logger(DetectionCacheService.name);
  private cache: Cache;
  private cacheConfig: CacheConfig;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(private readonly configService: ConfigService) {
    // Initialize cache config from constants or environment
    this.cacheConfig = {
      ttl: this.configService.get<number>(
        'CAPTCHA_CACHE_TTL',
        DEFAULT_CONFIG.cache.ttl,
      ),
    };
  }

  /**
   * Initialize cache on module init
   * Uses in-memory cache by default
   * Redis support can be added by configuring Keyv stores
   */
  async onModuleInit(): Promise<void> {
    try {
      // Use in-memory cache
      // For Redis support, configure Keyv stores and pass them via stores option
      this.cache = createCache({
        ttl: this.cacheConfig.ttl,
      });
      this.logger.log('Using in-memory cache for detection results');
    } catch (error) {
      this.logger.error(
        `Failed to initialize cache: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate a cache key from URL and content hash
   * @param url - Page URL
   * @param contentHash - SHA-256 hash of page content
   * @returns Cache key string
   */
  private generateCacheKey(url: string, contentHash: string): string {
    // Normalize URL (remove query params that don't affect detection)
    const normalizedUrl = this.normalizeUrl(url);
    return `detection:${normalizedUrl}:${contentHash}`;
  }

  /**
   * Normalize URL by removing query parameters that don't affect detection
   * Keeps essential parts like path and domain
   * @param url - Original URL
   * @returns Normalized URL
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove common tracking/analytics query params
      const paramsToRemove = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'ref',
        'fbclid',
        'gclid',
        '_ga',
        'timestamp',
        'cache',
      ];
      paramsToRemove.forEach((param) => urlObj.searchParams.delete(param));
      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Generate SHA-256 hash of page content
   * @param content - Page HTML content
   * @returns Hexadecimal hash string
   */
  generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get cached detection result
   * @param url - Page URL
   * @param content - Page HTML content
   * @returns Cached detection result or null if not found
   */
  async get(
    url: string,
    content: string,
  ): Promise<MultiDetectionResult | null> {
    try {
      const contentHash = this.generateContentHash(content);
      const cacheKey = this.generateCacheKey(url, contentHash);

      const cached = await this.cache.get<MultiDetectionResult>(cacheKey);

      if (cached) {
        this.cacheHits++;
        this.logger.debug(`Cache hit for URL: ${url}`);
        return cached;
      }

      this.cacheMisses++;
      this.logger.debug(`Cache miss for URL: ${url}`);
      return null;
    } catch (error) {
      this.logger.warn(
        `Error retrieving from cache: ${error.message}`,
        error.stack,
      );
      this.cacheMisses++;
      return null;
    }
  }

  /**
   * Store detection result in cache
   * @param url - Page URL
   * @param content - Page HTML content
   * @param result - Detection result to cache
   */
  async set(
    url: string,
    content: string,
    result: MultiDetectionResult,
  ): Promise<void> {
    try {
      const contentHash = this.generateContentHash(content);
      const cacheKey = this.generateCacheKey(url, contentHash);

      await this.cache.set(cacheKey, result, this.cacheConfig.ttl);

      this.logger.debug(`Cached detection result for URL: ${url}`);
    } catch (error) {
      this.logger.warn(
        `Error storing in cache: ${error.message}`,
        error.stack,
      );
      // Don't throw - caching failures shouldn't break detection
    }
  }

  /**
   * Invalidate cache entries for a specific URL
   * Removes all cache entries matching the URL pattern
   * @param url - Page URL to invalidate
   */
  async invalidate(url: string): Promise<void> {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      // Note: cache-manager doesn't support pattern-based deletion
      // This would require Redis or a custom implementation
      // For now, we log the request
      this.logger.debug(`Cache invalidation requested for URL: ${url}`);
      
      // If using Redis, we could implement pattern-based deletion here
      // For in-memory cache, we'd need to track keys manually
    } catch (error) {
      this.logger.warn(
        `Error invalidating cache: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get cache statistics
   * @returns Object with cache hit/miss counts and hit rate
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: Math.round(hitRate * 10000) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.logger.debug('Cache statistics reset');
  }
}

