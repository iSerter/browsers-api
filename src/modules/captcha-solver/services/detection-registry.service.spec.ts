import { Test, TestingModule } from '@nestjs/testing';
import { DetectionRegistryService } from './detection-registry.service';
import { IDetectionStrategy } from './detection-strategy.interface';
import { AntiBotSystemType } from '../interfaces';

describe('DetectionRegistryService', () => {
  let service: DetectionRegistryService;

  // Mock detection strategy
  class MockDetectionStrategy implements IDetectionStrategy {
    constructor(
      public systemType: AntiBotSystemType,
      public name: string,
    ) {}

    getName(): string {
      return this.name;
    }

    async detect(page: any): Promise<any> {
      return { detected: true };
    }
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DetectionRegistryService],
    }).compile();

    service = module.get<DetectionRegistryService>(DetectionRegistryService);
  });

  afterEach(() => {
    service.clear();
  });

  describe('register', () => {
    it('should register a detection strategy', () => {
      const strategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );

      service.register(strategy);

      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(true);
      expect(service.get(AntiBotSystemType.CLOUDFLARE)).toBe(strategy);
    });

    it('should overwrite existing strategy with warning', () => {
      const strategy1 = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy1',
      );
      const strategy2 = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy2',
      );

      service.register(strategy1);
      const logSpy = jest.spyOn(service['logger'], 'warn');
      service.register(strategy2);

      expect(logSpy).toHaveBeenCalled();
      expect(service.get(AntiBotSystemType.CLOUDFLARE)).toBe(strategy2);
    });

    it('should register multiple different strategies', () => {
      const cloudflareStrategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );
      const recaptchaStrategy = new MockDetectionStrategy(
        AntiBotSystemType.RECAPTCHA,
        'RecaptchaStrategy',
      );

      service.register(cloudflareStrategy);
      service.register(recaptchaStrategy);

      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(true);
      expect(service.has(AntiBotSystemType.RECAPTCHA)).toBe(true);
      expect(service.getCount()).toBe(2);
    });
  });

  describe('registerAll', () => {
    it('should register multiple strategies at once', () => {
      const strategies = [
        new MockDetectionStrategy(
          AntiBotSystemType.CLOUDFLARE,
          'CloudflareStrategy',
        ),
        new MockDetectionStrategy(
          AntiBotSystemType.RECAPTCHA,
          'RecaptchaStrategy',
        ),
        new MockDetectionStrategy(
          AntiBotSystemType.HCAPTCHA,
          'HcaptchaStrategy',
        ),
      ];

      service.registerAll(strategies);

      expect(service.getCount()).toBe(3);
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(true);
      expect(service.has(AntiBotSystemType.RECAPTCHA)).toBe(true);
      expect(service.has(AntiBotSystemType.HCAPTCHA)).toBe(true);
    });

    it('should handle empty array', () => {
      service.registerAll([]);
      expect(service.getCount()).toBe(0);
    });
  });

  describe('get', () => {
    it('should return registered strategy', () => {
      const strategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );

      service.register(strategy);
      const retrieved = service.get(AntiBotSystemType.CLOUDFLARE);

      expect(retrieved).toBe(strategy);
      expect(retrieved?.getName()).toBe('CloudflareStrategy');
    });

    it('should return undefined for unregistered strategy', () => {
      const retrieved = service.get(AntiBotSystemType.CLOUDFLARE);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered strategy', () => {
      const strategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );

      service.register(strategy);
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(true);
    });

    it('should return false for unregistered strategy', () => {
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(false);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return all registered system types', () => {
      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.CLOUDFLARE,
          'CloudflareStrategy',
        ),
      );
      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.RECAPTCHA,
          'RecaptchaStrategy',
        ),
      );

      const types = service.getRegisteredTypes();

      expect(types).toHaveLength(2);
      expect(types).toContain(AntiBotSystemType.CLOUDFLARE);
      expect(types).toContain(AntiBotSystemType.RECAPTCHA);
    });

    it('should return empty array when no strategies registered', () => {
      const types = service.getRegisteredTypes();
      expect(types).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should return all registered strategies', () => {
      const strategy1 = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );
      const strategy2 = new MockDetectionStrategy(
        AntiBotSystemType.RECAPTCHA,
        'RecaptchaStrategy',
      );

      service.register(strategy1);
      service.register(strategy2);

      const all = service.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContain(strategy1);
      expect(all).toContain(strategy2);
    });

    it('should return empty array when no strategies registered', () => {
      const all = service.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('unregister', () => {
    it('should remove registered strategy', () => {
      const strategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );

      service.register(strategy);
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(true);

      const removed = service.unregister(AntiBotSystemType.CLOUDFLARE);

      expect(removed).toBe(true);
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(false);
    });

    it('should return false when unregistering non-existent strategy', () => {
      const removed = service.unregister(AntiBotSystemType.CLOUDFLARE);
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all registered strategies', () => {
      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.CLOUDFLARE,
          'CloudflareStrategy',
        ),
      );
      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.RECAPTCHA,
          'RecaptchaStrategy',
        ),
      );

      expect(service.getCount()).toBe(2);

      service.clear();

      expect(service.getCount()).toBe(0);
      expect(service.has(AntiBotSystemType.CLOUDFLARE)).toBe(false);
      expect(service.has(AntiBotSystemType.RECAPTCHA)).toBe(false);
    });

    it('should handle clearing empty registry', () => {
      service.clear();
      expect(service.getCount()).toBe(0);
    });
  });

  describe('getCount', () => {
    it('should return correct count of registered strategies', () => {
      expect(service.getCount()).toBe(0);

      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.CLOUDFLARE,
          'CloudflareStrategy',
        ),
      );
      expect(service.getCount()).toBe(1);

      service.register(
        new MockDetectionStrategy(
          AntiBotSystemType.RECAPTCHA,
          'RecaptchaStrategy',
        ),
      );
      expect(service.getCount()).toBe(2);

      service.unregister(AntiBotSystemType.CLOUDFLARE);
      expect(service.getCount()).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle all anti-bot system types', () => {
      const allTypes = Object.values(AntiBotSystemType);
      const strategies = allTypes.map(
        (type) => new MockDetectionStrategy(type, `${type}Strategy`),
      );

      service.registerAll(strategies);

      expect(service.getCount()).toBe(allTypes.length);
      allTypes.forEach((type) => {
        expect(service.has(type)).toBe(true);
      });
    });

    it('should maintain strategy references after multiple operations', () => {
      const strategy = new MockDetectionStrategy(
        AntiBotSystemType.CLOUDFLARE,
        'CloudflareStrategy',
      );

      service.register(strategy);
      const retrieved1 = service.get(AntiBotSystemType.CLOUDFLARE);

      service.unregister(AntiBotSystemType.CLOUDFLARE);
      service.register(strategy);
      const retrieved2 = service.get(AntiBotSystemType.CLOUDFLARE);

      expect(retrieved1).toBe(strategy);
      expect(retrieved2).toBe(strategy);
      expect(retrieved1).toBe(retrieved2);
    });
  });
});

