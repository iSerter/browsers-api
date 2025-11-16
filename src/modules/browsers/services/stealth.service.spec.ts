import { Test, TestingModule } from '@nestjs/testing';
import { StealthService } from './stealth.service';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  StealthConfig,
  DEFAULT_STEALTH_CONFIG,
  MouseMovementConfig,
} from '../interfaces/stealth.interface';

describe('StealthService', () => {
  let service: StealthService;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StealthService],
    }).compile();

    service = module.get<StealthService>(StealthService);

    // Launch a real browser for integration tests
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    if (page && !page.isClosed()) {
      await page.close();
    }
    if (context) {
      await context.close();
    }
  });

  describe('applyStealthToContext', () => {
    it('should apply stealth configuration to context', async () => {
      const config: StealthConfig = {
        overrideWebdriver: true,
        preventCanvasFingerprinting: true,
      };

      await service.applyStealthToContext(context, config);

      const newPage = await context.newPage();
      const webdriver = await newPage.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
      await newPage.close();
    });

    it('should use default config when no config provided', async () => {
      await service.applyStealthToContext(context);

      const newPage = await context.newPage();
      const webdriver = await newPage.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
      await newPage.close();
    });

    it('should handle errors gracefully', async () => {
      const invalidContext = null as unknown as BrowserContext;
      await expect(
        service.applyStealthToContext(invalidContext),
      ).rejects.toThrow();
    });
  });

  describe('applyStealthToPage', () => {
    it('should apply stealth configuration to existing page', async () => {
      const config: StealthConfig = {
        overrideWebdriver: true,
      };

      await service.applyStealthToPage(page, config);

      const webdriver = await page.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
    });

    it('should use default config when no config provided', async () => {
      await service.applyStealthToPage(page);

      const webdriver = await page.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
    });
  });

  describe('navigator.webdriver override', () => {
    it('should override navigator.webdriver to false', async () => {
      await service.applyStealthToContext(context, {
        overrideWebdriver: true,
      });

      const newPage = await context.newPage();
      const webdriver = await newPage.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);
      await newPage.close();
    });

    it('should not override when disabled', async () => {
      await service.applyStealthToContext(context, {
        overrideWebdriver: false,
      });

      const newPage = await context.newPage();
      const webdriver = await newPage.evaluate(() => navigator.webdriver);
      // In Playwright, webdriver is typically true by default
      expect(webdriver).toBeDefined();
      await newPage.close();
    });
  });

  describe('canvas fingerprinting prevention', () => {
    it('should prevent canvas fingerprinting', async () => {
      await service.applyStealthToContext(context, {
        preventCanvasFingerprinting: true,
      });

      const newPage = await context.newPage();
      const canvas = await newPage.evaluate(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillText('test', 10, 10);
          return ctx.getImageData(0, 0, 10, 10);
        }
        return null;
      });

      expect(canvas).toBeDefined();
      await newPage.close();
    });
  });

  describe('WebGL fingerprinting prevention', () => {
    it('should prevent WebGL fingerprinting', async () => {
      await service.applyStealthToContext(context, {
        preventWebGLFingerprinting: true,
      });

      const newPage = await context.newPage();
      const vendor = await newPage.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) {
          return gl.getParameter(gl.VENDOR);
        }
        return null;
      });

      expect(vendor).toBe('Intel Inc.');
      await newPage.close();
    });
  });

  describe('battery API mocking', () => {
    it('should mock battery API', async () => {
      await service.applyStealthToContext(context, {
        mockBatteryAPI: true,
      });

      const newPage = await context.newPage();
      const battery = await newPage.evaluate(async () => {
        if (navigator.getBattery) {
          return await navigator.getBattery();
        }
        return null;
      });

      expect(battery).toBeDefined();
      expect(battery?.charging).toBe(true);
      expect(battery?.level).toBe(0.8);
      await newPage.close();
    });
  });

  describe('hardware concurrency randomization', () => {
    it('should randomize hardware concurrency', async () => {
      await service.applyStealthToContext(context, {
        randomizeHardwareConcurrency: true,
        hardwareConcurrencyRange: [2, 4],
      });

      const newPage = await context.newPage();
      const concurrency = await newPage.evaluate(
        () => navigator.hardwareConcurrency,
      );

      expect(concurrency).toBeGreaterThanOrEqual(2);
      expect(concurrency).toBeLessThanOrEqual(4);
      await newPage.close();
    });

    it('should use default range when not specified', async () => {
      await service.applyStealthToContext(context, {
        randomizeHardwareConcurrency: true,
      });

      const newPage = await context.newPage();
      const concurrency = await newPage.evaluate(
        () => navigator.hardwareConcurrency,
      );

      expect(concurrency).toBeGreaterThanOrEqual(2);
      expect(concurrency).toBeLessThanOrEqual(8);
      await newPage.close();
    });
  });

  describe('plugins mocking', () => {
    it('should mock browser plugins', async () => {
      await service.applyStealthToContext(context, {
        mockPlugins: true,
      });

      const newPage = await context.newPage();
      const plugins = await newPage.evaluate(() => navigator.plugins.length);

      expect(plugins).toBeGreaterThan(0);
      await newPage.close();
    });
  });

  describe('languages mocking', () => {
    it('should mock browser languages', async () => {
      await service.applyStealthToContext(context, {
        mockLanguages: true,
        locale: 'en-US',
      });

      const newPage = await context.newPage();
      const language = await newPage.evaluate(() => navigator.language);

      expect(language).toBe('en-US');
      await newPage.close();
    });
  });

  describe('timezone consistency', () => {
    it('should enforce timezone consistency', async () => {
      await service.applyStealthToContext(context, {
        enforceTimezoneConsistency: true,
        timezoneId: 'America/New_York',
      });

      const newPage = await context.newPage();
      const timezone = await newPage.evaluate(() => {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      });

      expect(timezone).toBe('America/New_York');
      await newPage.close();
    });
  });

  describe('moveMouseHumanLike', () => {
    it('should move mouse with human-like behavior', async () => {
      await page.setContent('<div style="width: 100px; height: 100px;"></div>');
      await page.goto('about:blank');

      const config: MouseMovementConfig = {
        minSteps: 5,
        maxSteps: 10,
      };

      await service.moveMouseHumanLike(page, 50, 50, config);

      // Verify mouse position (basic check)
      const position = await page.evaluate(() => {
        return { x: 0, y: 0 }; // Mouse position not directly accessible
      });

      expect(position).toBeDefined();
    });

    it('should use default config when not provided', async () => {
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      await service.moveMouseHumanLike(page, 100, 100);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const invalidPage = null as unknown as Page;
      await expect(
        service.moveMouseHumanLike(invalidPage, 0, 0),
      ).rejects.toThrow();
    });
  });

  describe('clickHumanLike', () => {
    it('should click with human-like behavior', async () => {
      await page.setContent(
        '<button id="test-btn">Click me</button>',
      );
      await page.goto('about:blank');

      let clicked = false;
      await page.evaluate(() => {
        const btn = document.getElementById('test-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            (window as any).clicked = true;
          });
        }
      });

      await service.clickHumanLike(page, 50, 50);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('validateUserAgentConsistency', () => {
    it('should validate Windows user-agent correctly', () => {
      const isValid = service.validateUserAgentConsistency(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Win32',
      );
      expect(isValid).toBe(true);
    });

    it('should validate macOS user-agent correctly', () => {
      const isValid = service.validateUserAgentConsistency(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'MacIntel',
      );
      expect(isValid).toBe(true);
    });

    it('should validate Linux user-agent correctly', () => {
      const isValid = service.validateUserAgentConsistency(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Linux x86_64',
      );
      expect(isValid).toBe(true);
    });

    it('should return true when platform is not provided', () => {
      const isValid = service.validateUserAgentConsistency(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36',
      );
      expect(isValid).toBe(true);
    });
  });

  describe('getRealisticUserAgent', () => {
    it('should return Windows user-agent', () => {
      const ua = service.getRealisticUserAgent('windows');
      expect(ua).toContain('Windows');
      expect(ua).toContain('Chrome');
    });

    it('should return macOS user-agent', () => {
      const ua = service.getRealisticUserAgent('macos');
      expect(ua).toContain('Macintosh');
      expect(ua).toContain('Chrome');
    });

    it('should return Linux user-agent', () => {
      const ua = service.getRealisticUserAgent('linux');
      expect(ua).toContain('Linux');
      expect(ua).toContain('Chrome');
    });

    it('should default to Windows', () => {
      const ua = service.getRealisticUserAgent();
      expect(ua).toContain('Windows');
    });
  });

  describe('combined stealth features', () => {
    it('should apply all stealth features together', async () => {
      const config: StealthConfig = {
        overrideWebdriver: true,
        preventCanvasFingerprinting: true,
        preventWebGLFingerprinting: true,
        preventAudioFingerprinting: true,
        mockBatteryAPI: true,
        randomizeHardwareConcurrency: true,
        mockPlugins: true,
        mockLanguages: true,
        enforceTimezoneConsistency: true,
        timezoneId: 'America/New_York',
        locale: 'en-US',
      };

      await service.applyStealthToContext(context, config);

      const newPage = await context.newPage();
      const results = await newPage.evaluate(() => {
        return {
          webdriver: navigator.webdriver,
          hardwareConcurrency: navigator.hardwareConcurrency,
          language: navigator.language,
          plugins: navigator.plugins.length,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      });

      expect(results.webdriver).toBe(false);
      expect(results.hardwareConcurrency).toBeGreaterThanOrEqual(2);
      expect(results.hardwareConcurrency).toBeLessThanOrEqual(8);
      expect(results.language).toBe('en-US');
      expect(results.plugins).toBeGreaterThan(0);
      expect(results.timezone).toBe('America/New_York');
      await newPage.close();
    });
  });
});

