import { Test, TestingModule } from '@nestjs/testing';
import { Page, Frame, BrowserContext, CDPSession } from 'playwright';
import { NativeDataDomeSolver } from './native-datadome-solver';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import { DataDomeChallengeType } from './interfaces/datadome-solver.interface';

describe('NativeDataDomeSolver', () => {
  let solver: NativeDataDomeSolver;
  let mockPage: jest.Mocked<Page>;
  let mockWidgetInteraction: jest.Mocked<CaptchaWidgetInteractionService>;
  let mockBehaviorSimulation: jest.Mocked<HumanBehaviorSimulationService>;
  let mockPerformanceTracker: jest.Mocked<SolverPerformanceTracker>;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockCDPSession: jest.Mocked<CDPSession>;
  let mockFrame: jest.Mocked<Frame>;

  beforeEach(async () => {
    // Create mock CDP session
    mockCDPSession = {} as any;

    // Create mock context
    mockContext = {
      cookies: jest.fn(),
      newCDPSession: jest.fn().mockResolvedValue(mockCDPSession),
    } as any;

    // Create mock page
    mockPage = {
      evaluate: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      frames: jest.fn(),
      route: jest.fn(),
      mouse: {
        move: jest.fn(),
        down: jest.fn(),
        up: jest.fn(),
      },
      locator: jest.fn(),
      viewportSize: jest.fn().mockReturnValue({ width: 1920, height: 1080 }),
      context: jest.fn().mockReturnValue(mockContext),
    } as any;

    // Create mock frame
    mockFrame = {
      url: jest.fn(),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    // Create mock widget interaction service
    mockWidgetInteraction = {
      detectWidget: jest.fn(),
    } as any;

    // Create mock behavior simulation service
    mockBehaviorSimulation = {
      moveMouseBezier: jest.fn(),
      simulateKeystroke: jest.fn(),
      simulateScroll: jest.fn(),
    } as any;

    // Create mock performance tracker
    mockPerformanceTracker = {
      recordAttempt: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CaptchaWidgetInteractionService,
          useValue: mockWidgetInteraction,
        },
        {
          provide: HumanBehaviorSimulationService,
          useValue: mockBehaviorSimulation,
        },
        {
          provide: SolverPerformanceTracker,
          useValue: mockPerformanceTracker,
        },
      ],
    }).compile();

    solver = new NativeDataDomeSolver(
      mockPage,
      mockWidgetInteraction,
      mockBehaviorSimulation,
      mockPerformanceTracker,
    );
  });

  describe('getName', () => {
    it('should return correct solver name', () => {
      expect(solver.getName()).toBe('datadome-native');
    });
  });

  describe('isAvailable', () => {
    it('should always return true for native solvers', async () => {
      const result = await solver.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('detectDataDome', () => {
    it('should detect DataDome with captcha div and scripts', async () => {
      mockPage.evaluate.mockResolvedValue({
        hasCaptchaDiv: true,
        hasDataDomeScript: true,
        hasWindowDD: true,
        scripts: ['https://js.datadome.co/tags.js'],
        cookieNames: ['datadome'],
      });

      mockContext.cookies.mockResolvedValue([
        { name: 'datadome', value: 'test-cookie-value', domain: 'example.com' },
      ]);

      const result = await (solver as any).detectDataDome({
        type: 'datadome',
        url: 'https://example.com',
      });

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.datadomeCookie).toBe('test-cookie-value');
      expect(result.details?.scriptUrls).toContain('https://js.datadome.co/tags.js');
      expect(result.details?.hasWindowDD).toBe(true);
    });

    it('should detect DataDome with only cookies', async () => {
      mockPage.evaluate.mockResolvedValue({
        hasCaptchaDiv: false,
        hasDataDomeScript: false,
        hasWindowDD: false,
        scripts: [],
        cookieNames: ['datadome'],
      });

      mockContext.cookies.mockResolvedValue([
        { name: 'datadome', value: 'test-cookie', domain: 'example.com' },
      ]);

      const result = await (solver as any).detectDataDome({
        type: 'datadome',
        url: 'https://example.com',
      });

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.datadomeCookie).toBe('test-cookie');
    });

    it('should return low confidence when DataDome not detected', async () => {
      mockPage.evaluate.mockResolvedValue({
        hasCaptchaDiv: false,
        hasDataDomeScript: false,
        hasWindowDD: false,
        scripts: [],
        cookieNames: [],
      });

      mockContext.cookies.mockResolvedValue([]);

      const result = await (solver as any).detectDataDome({
        type: 'datadome',
        url: 'https://example.com',
      });

      expect(result.confidence).toBe(0);
    });
  });

  describe('generateFingerprint', () => {
    it('should generate browser fingerprint with all required fields', async () => {
      mockPage.evaluate.mockResolvedValue({
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'America/New_York',
        plugins: ['Chrome PDF Plugin', 'Chrome PDF Viewer'],
        canvasFingerprint: 'data:image/png;base64,test',
        webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
        audioFingerprint: '48000',
        fonts: ['Arial', 'Verdana', 'Times New Roman'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        language: 'en-US',
        platform: 'Win32',
        hardwareConcurrency: 8,
        deviceMemory: 8,
      });

      const fingerprint = await (solver as any).generateFingerprint();

      expect(fingerprint.screenResolution).toBeDefined();
      expect(fingerprint.timezone).toBeDefined();
      expect(fingerprint.plugins).toBeInstanceOf(Array);
      expect(fingerprint.canvasFingerprint).toBeDefined();
      expect(fingerprint.webglRenderer).toBeDefined();
      expect(fingerprint.audioFingerprint).toBeDefined();
      expect(fingerprint.fonts).toBeInstanceOf(Array);
      expect(fingerprint.userAgent).toBeDefined();
      expect(fingerprint.language).toBeDefined();
      expect(fingerprint.platform).toBeDefined();
      expect(fingerprint.hardwareConcurrency).toBeDefined();
    });

    it('should handle missing optional fields gracefully', async () => {
      mockPage.evaluate.mockResolvedValue({
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'UTC',
        plugins: [],
        canvasFingerprint: 'data:image/png;base64,test',
        webglRenderer: 'Unknown',
        audioFingerprint: 'unknown',
        fonts: [],
        userAgent: 'Mozilla/5.0',
        language: 'en',
        platform: 'Linux',
        hardwareConcurrency: 4,
      });

      const fingerprint = await (solver as any).generateFingerprint();

      expect(fingerprint).toBeDefined();
      expect(fingerprint.deviceMemory).toBeUndefined();
    });
  });

  describe('generateSensorData', () => {
    it('should generate sensor data with mouse movements', async () => {
      const sensorData = await (solver as any).generateSensorData();

      expect(sensorData.mouseMovements).toBeInstanceOf(Array);
      expect(sensorData.mouseMovements.length).toBeGreaterThan(0);
      expect(sensorData.mouseMovements[0]).toHaveProperty('timestamp');
      expect(sensorData.mouseMovements[0]).toHaveProperty('x');
      expect(sensorData.mouseMovements[0]).toHaveProperty('y');
      expect(sensorData.mouseMovements[0]).toHaveProperty('type');
    });

    it('should generate sensor data with scroll events', async () => {
      const sensorData = await (solver as any).generateSensorData();

      expect(sensorData.scrollEvents).toBeInstanceOf(Array);
      expect(sensorData.scrollEvents.length).toBeGreaterThan(0);
      expect(sensorData.scrollEvents[0]).toHaveProperty('timestamp');
      expect(sensorData.scrollEvents[0]).toHaveProperty('deltaX');
      expect(sensorData.scrollEvents[0]).toHaveProperty('deltaY');
    });

    it('should generate sensor data with keyboard events', async () => {
      const sensorData = await (solver as any).generateSensorData();

      expect(sensorData.keyboardEvents).toBeInstanceOf(Array);
      if (sensorData.keyboardEvents.length > 0) {
        expect(sensorData.keyboardEvents[0]).toHaveProperty('timestamp');
        expect(sensorData.keyboardEvents[0]).toHaveProperty('key');
        expect(sensorData.keyboardEvents[0]).toHaveProperty('code');
      }
    });
  });

  describe('generateBezierPoints', () => {
    it('should generate Bezier curve points', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 100 };
      const numPoints = 10;

      const points = (solver as any).generateBezierPoints(start, end, numPoints);

      expect(points).toBeInstanceOf(Array);
      expect(points.length).toBe(numPoints + 1);
      expect(points[0]).toEqual({ x: start.x, y: start.y });
      expect(points[points.length - 1].x).toBeCloseTo(end.x, 1);
      expect(points[points.length - 1].y).toBeCloseTo(end.y, 1);
    });

    it('should generate smooth curve points', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 200, y: 200 };
      const numPoints = 20;

      const points = (solver as any).generateBezierPoints(start, end, numPoints);

      // Check that points are in order and form a curve
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        // Points should progress towards end
        expect(Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y)).toBeGreaterThan(0);
      }
    });
  });

  describe('determineChallengeType', () => {
    it('should detect CAPTCHA challenge type', async () => {
      const mockCaptchaFrame = {
        url: jest.fn().mockReturnValue('https://www.google.com/recaptcha/api2/anchor'),
      } as any;

      mockPage.frames.mockReturnValue([mockCaptchaFrame]);

      const detection: any = {
        container: null,
        captchaIframe: null,
        sliderElement: null,
        confidence: 0.8,
      };

      const challengeType = await (solver as any).determineChallengeType(detection);

      expect(challengeType).toBe(DataDomeChallengeType.CAPTCHA);
      expect(detection.captchaIframe).toBe(mockCaptchaFrame);
    });

    it('should detect slider challenge type', async () => {
      const mockSlider = {
        count: jest.fn().mockResolvedValue(1),
        boundingBox: jest.fn(),
      };

      mockPage.frames.mockReturnValue([]);
      mockPage.locator.mockReturnValue(mockSlider);

      const detection: any = {
        container: null,
        captchaIframe: null,
        sliderElement: null,
        confidence: 0.8,
      };

      const challengeType = await (solver as any).determineChallengeType(detection);

      expect(challengeType).toBe(DataDomeChallengeType.SLIDER);
    });

    it('should detect cookie challenge type', async () => {
      mockPage.frames.mockReturnValue([]);
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(0),
        }),
      });

      const detection: any = {
        container: null,
        captchaIframe: null,
        sliderElement: null,
        confidence: 0.8,
        datadomeCookie: 'test-cookie-value',
      };

      const challengeType = await (solver as any).determineChallengeType(detection);

      expect(challengeType).toBe(DataDomeChallengeType.COOKIE);
    });

    it('should default to sensor validation', async () => {
      mockPage.frames.mockReturnValue([]);
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(0),
        }),
      });

      const detection: any = {
        container: null,
        captchaIframe: null,
        sliderElement: null,
        confidence: 0.8,
      };

      const challengeType = await (solver as any).determineChallengeType(detection);

      expect(challengeType).toBe(DataDomeChallengeType.SENSOR_VALIDATION);
    });
  });

  describe('solveSensorValidation', () => {
    it('should solve sensor validation challenge', async () => {
      const solveStartTime = Date.now();
      const fingerprint = {
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'UTC',
        plugins: [],
        canvasFingerprint: 'test',
        webglRenderer: 'test',
        audioFingerprint: 'test',
        fonts: [],
        userAgent: 'test',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      };

      mockContext.cookies.mockResolvedValue([
        {
          name: 'datadome',
          value: 'valid-cookie-value-that-is-long-enough-to-pass-validation',
          domain: 'example.com',
        },
      ]);

      // Mock sleep
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await (solver as any).solveSensorValidation(
        { confidence: 0.8 },
        solveStartTime,
        fingerprint,
      );

      expect(result.token).toBe('valid-cookie-value-that-is-long-enough-to-pass-validation');
      expect(result.challengeType).toBe(DataDomeChallengeType.SENSOR_VALIDATION);
      expect(result.fingerprint).toBeDefined();
    });

    it('should throw error when cookie is invalid', async () => {
      const solveStartTime = Date.now();
      const fingerprint = {
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'UTC',
        plugins: [],
        canvasFingerprint: 'test',
        webglRenderer: 'test',
        audioFingerprint: 'test',
        fonts: [],
        userAgent: 'test',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      };

      mockContext.cookies.mockResolvedValue([
        { name: 'datadome', value: 'short', domain: 'example.com' },
      ]);

      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        (solver as any).solveSensorValidation({ confidence: 0.8 }, solveStartTime, fingerprint),
      ).rejects.toThrow('Sensor validation challenge not bypassed');
    });
  });

  describe('solveSliderChallenge', () => {
    it('should solve slider challenge', async () => {
      const solveStartTime = Date.now();
      const mockSlider = {
        boundingBox: jest.fn().mockResolvedValue({ x: 100, y: 100, width: 300, height: 50 }),
      };

      const detection: any = {
        sliderElement: mockSlider,
        confidence: 0.8,
      };

      mockPage.evaluate.mockResolvedValue({
        trackWidth: 300,
        handleLeft: 0,
        handleWidth: 50,
      });

      mockContext.cookies.mockResolvedValue([
        {
          name: 'datadome',
          value: 'valid-cookie-value-that-is-long-enough-to-pass-validation',
          domain: 'example.com',
        },
      ]);

      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await (solver as any).solveSliderChallenge(detection, solveStartTime);

      expect(result.token).toBe('valid-cookie-value-that-is-long-enough-to-pass-validation');
      expect(result.challengeType).toBe(DataDomeChallengeType.SLIDER);
    });

    it('should throw error when slider element not found', async () => {
      const solveStartTime = Date.now();
      const detection: any = {
        sliderElement: null,
        confidence: 0.8,
      };

      await expect(
        (solver as any).solveSliderChallenge(detection, solveStartTime),
      ).rejects.toThrow('Slider element not found');
    });
  });

  describe('solveCookieChallenge', () => {
    it('should solve cookie challenge', async () => {
      const solveStartTime = Date.now();
      const detection: any = {
        datadomeCookie: 'valid-cookie-value-that-is-long-enough-to-pass-validation',
        confidence: 0.8,
      };

      mockContext.cookies.mockResolvedValue([
        {
          name: 'datadome',
          value: 'valid-cookie-value-that-is-long-enough-to-pass-validation',
          domain: 'example.com',
        },
      ]);

      const result = await (solver as any).solveCookieChallenge(detection, solveStartTime);

      expect(result.token).toBe('valid-cookie-value-that-is-long-enough-to-pass-validation');
      expect(result.challengeType).toBe(DataDomeChallengeType.COOKIE);
    });

    it('should throw error when cookie not found', async () => {
      const solveStartTime = Date.now();
      const detection: any = {
        datadomeCookie: null,
        confidence: 0.8,
      };

      await expect(
        (solver as any).solveCookieChallenge(detection, solveStartTime),
      ).rejects.toThrow('DataDome cookie not found');
    });
  });

  describe('solve', () => {
    it('should solve DataDome challenge successfully', async () => {
      // Mock detection
      jest.spyOn(solver as any, 'detectDataDome').mockResolvedValue({
        confidence: 0.8,
        datadomeCookie: 'test-cookie',
      });

      // Mock fingerprint generation
      jest.spyOn(solver as any, 'generateOrRetrieveFingerprint').mockResolvedValue({
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'UTC',
        plugins: [],
        canvasFingerprint: 'test',
        webglRenderer: 'test',
        audioFingerprint: 'test',
        fonts: [],
        userAgent: 'test',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      });

      // Mock sensor data generation
      jest.spyOn(solver as any, 'generateSensorData').mockResolvedValue({
        mouseMovements: [],
        scrollEvents: [],
        keyboardEvents: [],
        touchEvents: [],
      });

      // Mock challenge type determination
      jest.spyOn(solver as any, 'determineChallengeType').mockResolvedValue(
        DataDomeChallengeType.SENSOR_VALIDATION,
      );

      // Mock challenge solving
      jest.spyOn(solver as any, 'solveSensorValidation').mockResolvedValue({
        token: 'test-token',
        solvedAt: new Date(),
        challengeType: DataDomeChallengeType.SENSOR_VALIDATION,
        duration: 1000,
      });

      // Mock CDP initialization
      jest.spyOn(solver as any, 'initializeCDP').mockResolvedValue(undefined);

      // Mock setup interception
      jest.spyOn(solver as any, 'setupDataDomeInterception').mockResolvedValue(undefined);

      const result = await solver.solve({
        type: 'datadome',
        url: 'https://example.com',
      });

      expect(result.token).toBe('test-token');
      expect(result.solverId).toBe('datadome-native');
    });

    it('should retry on failure with exponential backoff', async () => {
      // Mock detection
      jest.spyOn(solver as any, 'detectDataDome').mockResolvedValue({
        confidence: 0.8,
        datadomeCookie: 'test-cookie',
      });

      // Mock fingerprint generation
      jest.spyOn(solver as any, 'generateOrRetrieveFingerprint').mockResolvedValue({
        screenResolution: { width: 1920, height: 1080 },
        timezone: 'UTC',
        plugins: [],
        canvasFingerprint: 'test',
        webglRenderer: 'test',
        audioFingerprint: 'test',
        fonts: [],
        userAgent: 'test',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      });

      // Mock sensor data generation
      jest.spyOn(solver as any, 'generateSensorData').mockResolvedValue({
        mouseMovements: [],
        scrollEvents: [],
        keyboardEvents: [],
        touchEvents: [],
      });

      // Mock challenge type determination
      jest.spyOn(solver as any, 'determineChallengeType').mockResolvedValue(
        DataDomeChallengeType.SENSOR_VALIDATION,
      );

      // Mock challenge solving to fail twice then succeed
      let attemptCount = 0;
      jest.spyOn(solver as any, 'solveSensorValidation').mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return {
          token: 'test-token',
          solvedAt: new Date(),
          challengeType: DataDomeChallengeType.SENSOR_VALIDATION,
          duration: 1000,
        };
      });

      // Mock CDP initialization
      jest.spyOn(solver as any, 'initializeCDP').mockResolvedValue(undefined);

      // Mock setup interception
      jest.spyOn(solver as any, 'setupDataDomeInterception').mockResolvedValue(undefined);

      // Mock sleep for retry delays
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await solver.solve({
        type: 'datadome',
        url: 'https://example.com',
      });

      expect(result.token).toBe('test-token');
      expect(attemptCount).toBe(3); // Should have retried
    });
  });

  describe('getMetrics', () => {
    it('should return solver metrics', () => {
      const metrics = solver.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.challengeTypeDistribution).toBeDefined();
    });
  });
});

