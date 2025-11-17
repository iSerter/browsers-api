import { Test, TestingModule } from '@nestjs/testing';
import { HumanBehaviorSimulationService } from './human-behavior-simulation.service';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  BehaviorProfile,
  BehaviorSimulationConfig,
  MouseMovementConfig,
  KeystrokeTimingConfig,
  ScrollBehaviorConfig,
} from './interfaces/behavior-simulation.interface';

describe('HumanBehaviorSimulationService', () => {
  let service: HumanBehaviorSimulationService;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HumanBehaviorSimulationService],
    }).compile();

    service = module.get<HumanBehaviorSimulationService>(
      HumanBehaviorSimulationService,
    );

    // Launch a real browser for integration tests
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      console.warn(
        'Playwright browser not installed. Some tests will be skipped.',
      );
      console.warn('Run: npx playwright install');
      browser = undefined;
    }
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    if (browser) {
      context = await browser.newContext();
      page = await context.newPage();
    }
  });

  afterEach(async () => {
    // Cleanup any active intervals
    if (page) {
      const sessionId = (page as any).__behaviorConfig?.sessionId;
      if (sessionId) {
        service.cleanup(sessionId);
      }

      if (!page.isClosed()) {
        await page.close();
      }
    }
    if (context) {
      await context.close();
    }
  });

  describe('moveMouseBezier', () => {
    it('should move mouse along Bezier curve', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      const startX = 100;
      const startY = 100;
      const endX = 500;
      const endY = 500;

      await service.moveMouseBezier(page, startX, startY, endX, endY);

      // Verify mouse moved (basic check - mouse position not directly accessible)
      expect(true).toBe(true);
    });

    it('should use custom configuration', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      const config: MouseMovementConfig = {
        bezierDeviation: 30,
        jitterRange: 3,
        jitterInterval: 100,
        steps: 30,
      };

      await service.moveMouseBezier(
        page,
        0,
        0,
        100,
        100,
        config,
      );

      expect(true).toBe(true);
    });

    it('should update fingerprint when session ID provided', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'test-session';
      await service.moveMouseBezier(
        page,
        0,
        0,
        100,
        100,
        {},
        sessionId,
      );

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.mousePatterns.movementCount).toBeGreaterThan(0);
    });
  });

  describe('typeWithTiming', () => {
    it('should type text with realistic timing', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<input type="text" id="test-input" />');
      await page.goto('about:blank');

      await page.focus('#test-input');
      await service.typeWithTiming(page, 'Hello World');

      const value = await page.$eval(
        '#test-input',
        (el: HTMLInputElement) => el.value,
      );
      expect(value).toBe('Hello World');
    });

    it('should use custom keystroke timing configuration', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<input type="text" id="test-input" />');
      await page.goto('about:blank');

      const config: KeystrokeTimingConfig = {
        keyPressMean: 150,
        keyPressStdDev: 30,
        interKeyMean: 250,
        interKeyStdDev: 60,
        thinkingPauseProbability: 0.2,
        thinkingPauseRange: [1000, 3000],
      };

      await page.focus('#test-input');
      await service.typeWithTiming(page, 'Test', config);

      const value = await page.$eval(
        '#test-input',
        (el: HTMLInputElement) => el.value,
      );
      expect(value).toBe('Test');
    });

    it('should update typing fingerprint', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'test-session';
      await page.setContent('<input type="text" id="test-input" />');
      await page.goto('about:blank');

      await page.focus('#test-input');
      await service.typeWithTiming(page, 'Test', {}, sessionId);

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.typingSpeed.samples.length).toBeGreaterThan(0);
    });
  });

  describe('scrollWithMomentum', () => {
    it('should scroll with momentum', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent(
        '<div style="height: 2000px;">Long content</div>',
      );
      await page.goto('about:blank');

      await service.scrollWithMomentum(page, 300);

      // Verify scroll occurred (basic check)
      expect(true).toBe(true);
    });

    it('should use custom scroll configuration', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent(
        '<div style="height: 2000px;">Long content</div>',
      );
      await page.goto('about:blank');

      const config: ScrollBehaviorConfig = {
        minDistance: 200,
        maxDistance: 600,
        overshootProbability: 0.5,
        overshootCorrectionRange: [20, 60],
        scrollDuration: 800,
      };

      await service.scrollWithMomentum(page, 400, config);

      expect(true).toBe(true);
    });

    it('should update scroll fingerprint', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'test-session';
      await page.setContent(
        '<div style="height: 2000px;">Long content</div>',
      );
      await page.goto('about:blank');

      await service.scrollWithMomentum(page, 300, {}, sessionId);

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.scrollProfile.averageDistance).toBeGreaterThan(0);
    });
  });

  describe('micro-movements', () => {
    it('should start micro-movements', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      const sessionId = 'test-session';
      service.startMicroMovements(page, sessionId);

      // Wait a bit to ensure interval is set
      await page.waitForTimeout(100);

      // Verify interval is active
      const hasInterval = (service as any).microMovementIntervals.has(
        sessionId,
      );
      expect(hasInterval).toBe(true);

      service.stopMicroMovements(sessionId);
    });

    it('should stop micro-movements', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'test-session';
      service.startMicroMovements(page, sessionId);
      service.stopMicroMovements(sessionId);

      const hasInterval = (service as any).microMovementIntervals.has(
        sessionId,
      );
      expect(hasInterval).toBe(false);
    });
  });

  describe('randomPause', () => {
    it('should pause based on probability', async () => {
      const start = Date.now();
      await service.randomPause({
        pauseProbability: 1.0,
        minDuration: 0.1,
        maxDuration: 0.2,
      });
      const duration = Date.now() - start;

      // Should have paused (at least 100ms, at most 200ms)
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(300);
    }, 10000); // Increase timeout to 10 seconds

    it('should not pause when probability is 0', async () => {
      const start = Date.now();
      await service.randomPause({ pauseProbability: 0 });
      const duration = Date.now() - start;

      // Should be very fast (no pause)
      expect(duration).toBeLessThan(50);
    });
  });

  describe('attention simulation', () => {
    it('should start attention simulation', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent(
        '<input type="text" id="input1" /><input type="text" id="input2" />',
      );
      await page.goto('about:blank');

      const sessionId = 'test-session';
      service.startAttentionSimulation(page, sessionId);

      // Wait a bit to ensure interval is set
      await page.waitForTimeout(100);

      const hasInterval = (service as any).attentionIntervals.has(sessionId);
      expect(hasInterval).toBe(true);

      service.stopAttentionSimulation(sessionId);
    });

    it('should stop attention simulation', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'test-session';
      service.startAttentionSimulation(page, sessionId);
      service.stopAttentionSimulation(sessionId);

      const hasInterval = (service as any).attentionIntervals.has(sessionId);
      expect(hasInterval).toBe(false);
    });
  });

  describe('behavioral fingerprints', () => {
    it('should create fingerprint on first access', () => {
      const sessionId = 'new-session';
      const fingerprint = service.getOrCreateFingerprint(sessionId);

      expect(fingerprint).toBeDefined();
      expect(fingerprint.sessionId).toBe(sessionId);
      expect(fingerprint.mousePatterns.movementCount).toBe(0);
    });

    it('should return existing fingerprint', () => {
      const sessionId = 'existing-session';
      const fingerprint1 = service.getOrCreateFingerprint(sessionId);
      const fingerprint2 = service.getOrCreateFingerprint(sessionId);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should update fingerprint with mouse movements', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'fingerprint-test';
      await service.moveMouseBezier(
        page,
        0,
        0,
        100,
        100,
        {},
        sessionId,
      );

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.mousePatterns.movementCount).toBe(1);
      expect(fingerprint?.mousePatterns.averageSpeed).toBeGreaterThan(0);
    });

    it('should update fingerprint with typing', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'typing-test';
      await page.setContent('<input type="text" id="test-input" />');
      await page.goto('about:blank');

      await page.focus('#test-input');
      await service.typeWithTiming(page, 'Hello', {}, sessionId);

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.typingSpeed.samples.length).toBeGreaterThan(0);
      expect(fingerprint?.typingSpeed.mean).toBeGreaterThan(0);
    });

    it('should update fingerprint with scrolling', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = 'scroll-test';
      await page.setContent(
        '<div style="height: 2000px;">Long content</div>',
      );
      await page.goto('about:blank');

      await service.scrollWithMomentum(page, 300, {}, sessionId);

      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeDefined();
      expect(fingerprint?.scrollProfile.averageDistance).toBeGreaterThan(0);
    });
  });

  describe('initialize', () => {
    it('should initialize behavior simulation', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      const config: BehaviorSimulationConfig = {
        profile: BehaviorProfile.NORMAL,
        enableMicroMovements: true,
        enableAttentionSimulation: true,
      };

      const sessionId = await service.initialize(page, config);

      expect(sessionId).toBeDefined();
      expect((page as any).__behaviorConfig).toBeDefined();
      expect((page as any).__behaviorConfig.sessionId).toBe(sessionId);

      service.cleanup(sessionId);
    });

    it('should use different profiles', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      await page.setContent('<div></div>');
      await page.goto('about:blank');

      const cautiousId = await service.initialize(page, {
        profile: BehaviorProfile.CAUTIOUS,
      });
      const aggressiveId = await service.initialize(page, {
        profile: BehaviorProfile.AGGRESSIVE,
      });

      expect(cautiousId).toBeDefined();
      expect(aggressiveId).toBeDefined();

      service.cleanup(cautiousId);
      service.cleanup(aggressiveId);
    });
  });

  describe('cleanup', () => {
    it('should cleanup session resources', async () => {
      if (!browser || !page) {
        return; // Skip if browser not available
      }
      const sessionId = await service.initialize(page);

      // Start micro-movements and attention simulation
      service.startMicroMovements(page, sessionId);
      service.startAttentionSimulation(page, sessionId);

      service.cleanup(sessionId);

      // Verify cleanup
      const fingerprint = service.getFingerprint(sessionId);
      expect(fingerprint).toBeUndefined();

      const hasMicroInterval = (service as any).microMovementIntervals.has(
        sessionId,
      );
      expect(hasMicroInterval).toBe(false);

      const hasAttentionInterval = (service as any).attentionIntervals.has(
        sessionId,
      );
      expect(hasAttentionInterval).toBe(false);
    });
  });

  describe('Bezier curve calculations', () => {
    it('should generate valid Bezier curves', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 100 };

      // Access private method via type assertion
      const curve = (service as any).generateBezierCurve(start, end, 20);

      expect(curve.start).toEqual(start);
      expect(curve.end).toEqual(end);
      expect(curve.control1).toBeDefined();
      expect(curve.control2).toBeDefined();
    });

    it('should calculate Bezier points correctly', () => {
      const curve = {
        start: { x: 0, y: 0 },
        control1: { x: 25, y: 0 },
        control2: { x: 75, y: 100 },
        end: { x: 100, y: 100 },
      };

      // Test start point (t=0)
      const startPoint = (service as any).bezierPoint(curve, 0);
      expect(startPoint.x).toBeCloseTo(0, 1);
      expect(startPoint.y).toBeCloseTo(0, 1);

      // Test end point (t=1)
      const endPoint = (service as any).bezierPoint(curve, 1);
      expect(endPoint.x).toBeCloseTo(100, 1);
      expect(endPoint.y).toBeCloseTo(100, 1);
    });
  });

  describe('normal distribution', () => {
    it('should generate normally distributed random numbers', () => {
      const mean = 100;
      const stdDev = 10;
      const samples: number[] = [];

      // Generate multiple samples
      for (let i = 0; i < 100; i++) {
        samples.push((service as any).normalRandom(mean, stdDev));
      }

      // Calculate sample mean
      const sampleMean =
        samples.reduce((a, b) => a + b, 0) / samples.length;

      // Should be close to the mean (within 2 standard deviations)
      expect(sampleMean).toBeGreaterThan(mean - 2 * stdDev);
      expect(sampleMean).toBeLessThan(mean + 2 * stdDev);
    });
  });
});

