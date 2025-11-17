import { Test, TestingModule } from '@nestjs/testing';
import { Page, Frame, BrowserContext, CDPSession } from 'playwright';
import { NativeAkamaiSolver } from './native-akamai-solver';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import { AkamaiChallengeLevel } from './interfaces/akamai-solver.interface';

describe('NativeAkamaiSolver', () => {
  let solver: NativeAkamaiSolver;
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
      url: jest.fn().mockReturnValue('https://example.com'),
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

    solver = new NativeAkamaiSolver(
      mockPage,
      mockWidgetInteraction,
      mockBehaviorSimulation,
      mockPerformanceTracker,
    );
  });

  describe('getName', () => {
    it('should return correct solver name', () => {
      expect(solver.getName()).toBe('akamai-native');
    });
  });

  describe('isAvailable', () => {
    it('should always return true for native solver', async () => {
      const result = await solver.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('detectAkamai', () => {
    it('should detect Akamai Bot Manager with high confidence', async () => {
      // Mock page evaluation for Akamai detection
      (mockPage.evaluate as jest.Mock).mockResolvedValue({
        hasAkamaiScript: true,
        hasBmScript: true,
        hasBmpScript: false,
        hasWindowCf: true,
        hasWindowBmak: true,
        scripts: ['https://akam.net/sensor_data.js'],
        cookieNames: ['_abck', 'bm_sz'],
        sensorVersion: '1.0',
      });

      // Mock context cookies
      (mockContext.cookies as jest.Mock).mockResolvedValue([
        { name: '_abck', value: 'test-abck-value' },
        { name: 'bm_sz', value: 'test-bm-sz-value' },
      ]);

      const params = { type: 'akamai' as const, url: 'https://example.com' };
      const result = await (solver as any).detectAkamai(params);

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.cookies?._abck).toBe('test-abck-value');
      expect(result.details?.hasWindowCf).toBe(true);
      expect(result.details?.hasWindowBmak).toBe(true);
    });

    it('should return low confidence when Akamai is not detected', async () => {
      (mockPage.evaluate as jest.Mock).mockResolvedValue({
        hasAkamaiScript: false,
        hasBmScript: false,
        hasBmpScript: false,
        hasWindowCf: false,
        hasWindowBmak: false,
        scripts: [],
        cookieNames: [],
        sensorVersion: null,
      });

      (mockContext.cookies as jest.Mock).mockResolvedValue([]);

      const params = { type: 'akamai' as const, url: 'https://example.com' };
      const result = await (solver as any).detectAkamai(params);

      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('determineChallengeLevel', () => {
    it('should detect Level 1 challenge by default', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
      };

      (mockPage.evaluate as jest.Mock).mockResolvedValue(false);

      const level = await (solver as any).determineChallengeLevel(detection);

      expect(level).toBe(AkamaiChallengeLevel.LEVEL_1);
    });

    it('should detect Level 2 challenge when indicators are present', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
      };

      // Mock Level 3 check (false) then Level 2 check (true)
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce(false) // hasLevel3Indicators
        .mockResolvedValueOnce(true); // hasLevel2Indicators

      const level = await (solver as any).determineChallengeLevel(detection);

      expect(level).toBe(AkamaiChallengeLevel.LEVEL_2);
    });

    it('should detect Level 3 challenge when advanced indicators are present', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
      };

      // Mock Level 3 indicators (anti-debugging, obfuscation)
      (mockPage.evaluate as jest.Mock).mockResolvedValueOnce(true); // hasLevel3Indicators

      const level = await (solver as any).determineChallengeLevel(detection);

      expect(level).toBe(AkamaiChallengeLevel.LEVEL_3);
    });
  });

  describe('generateFingerprint', () => {
    it('should generate realistic browser fingerprint', async () => {
      (mockPage.evaluate as jest.Mock).mockResolvedValue({
        screen: {
          width: 1920,
          height: 1080,
          availWidth: 1920,
          availHeight: 1040,
          colorDepth: 24,
          pixelDepth: 24,
        },
        timezoneOffset: -480,
        language: 'en-US',
        platform: 'Win32',
        userAgent: 'Mozilla/5.0...',
        capabilities: {
          plugins: ['Chrome PDF Plugin'],
          mimeTypes: ['application/pdf'],
          webglRenderer: 'ANGLE (NVIDIA)',
          canvasFingerprint: 'data:image/png;base64,...',
        },
        hardware: {
          hardwareConcurrency: 8,
          deviceMemory: 8,
          maxTouchPoints: 0,
        },
      });

      const fingerprint = await (solver as any).generateFingerprint();

      expect(fingerprint).toBeDefined();
      expect(fingerprint.screen.width).toBe(1920);
      expect(fingerprint.screen.height).toBe(1080);
      expect(fingerprint.language).toBe('en-US');
      expect(fingerprint.capabilities.plugins).toBeDefined();
    });
  });

  describe('generateSensorData', () => {
    it('should generate sensor data with behavioral telemetry', async () => {
      const fingerprint = {
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        timezoneOffset: -480,
        language: 'en-US',
        platform: 'Win32',
        userAgent: 'Mozilla/5.0...',
        capabilities: { plugins: [], mimeTypes: [] },
        hardware: { hardwareConcurrency: 8 },
      };

      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce('session-id-123') // getSessionId
        .mockResolvedValueOnce('https://example.com') // referrer
        .mockResolvedValueOnce({
          pageLoadTime: 1000,
          scriptExecutionTime: 500,
          domContentLoadedTime: 800,
          firstPaintTime: 600,
        });

      const sensorData = await (solver as any).generateSensorData(fingerprint);

      expect(sensorData).toBeDefined();
      expect(sensorData.sensorVersion).toBe('1.0');
      expect(sensorData.fingerprint).toEqual(fingerprint);
      expect(sensorData.telemetry.mouseMovements.length).toBeGreaterThan(0);
      expect(sensorData.telemetry.scrollEvents.length).toBeGreaterThan(0);
      expect(sensorData.timestamp).toBeDefined();
      expect(sensorData.pageUrl).toBe('https://example.com');
    });

    it('should cache sensor data for session consistency', async () => {
      const fingerprint = {
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        timezoneOffset: -480,
        language: 'en-US',
        platform: 'Win32',
        userAgent: 'Mozilla/5.0...',
        capabilities: { plugins: [], mimeTypes: [] },
        hardware: { hardwareConcurrency: 8 },
      };

      // Mock for first call - need to mock in the exact order they're called
      let callCount = 0;
      (mockPage.evaluate as jest.Mock).mockImplementation(async (fn?: () => any) => {
        callCount++;
        if (callCount === 1) {
          // getSessionId call
          return 'session-id-123';
        } else if (callCount === 2) {
          // referrer call
          return 'https://example.com';
        } else if (callCount === 3) {
          // timing call
          return {
            pageLoadTime: 1000,
            scriptExecutionTime: 500,
            domContentLoadedTime: 800,
            firstPaintTime: 600,
          };
        }
        return undefined;
      });

      const sensorData1 = await (solver as any).generateSensorData(fingerprint);
      
      // Reset mock for second call - only getSessionId will be called (returns same session ID)
      (mockPage.evaluate as jest.Mock).mockClear();
      (mockPage.evaluate as jest.Mock).mockResolvedValue('session-id-123');
      
      // Second call should use cache after getSessionId call
      const sensorData2 = await (solver as any).generateSensorData(fingerprint);

      // Should return cached data on second call
      expect(sensorData1).toEqual(sensorData2);
      // Verify that page.evaluate was only called once (for getSessionId) on second invocation
      // The cache check happens after getSessionId, so getSessionId will always be called
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateBmakCookie', () => {
    it('should generate valid bmak cookie structure', async () => {
      const sensorData = {
        sensorVersion: '1.0',
        fingerprint: {
          screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
          timezoneOffset: -480,
          language: 'en-US',
          platform: 'Win32',
          userAgent: 'Mozilla/5.0...',
          capabilities: { plugins: [], mimeTypes: [] },
          hardware: { hardwareConcurrency: 8 },
        },
        telemetry: {
          mouseMovements: [],
          keyboardEvents: [],
          scrollEvents: [],
          touchEvents: [],
          timing: { pageLoadTime: 1000, scriptExecutionTime: 500, domContentLoadedTime: 800 },
        },
        timestamp: Date.now(),
        pageUrl: 'https://example.com',
      };

      const bmakCookie = await (solver as any).generateBmakCookie(sensorData, sensorData.fingerprint);

      expect(bmakCookie).toBeDefined();
      expect(bmakCookie.version).toBe('1');
      expect(bmakCookie.timestamp).toBeDefined();
      expect(bmakCookie.sessionToken).toBeDefined();
      expect(bmakCookie.sensorHash).toBeDefined();
      expect(bmakCookie.metadata).toBeDefined();
    });
  });

  describe('solveLevel1', () => {
    it('should solve Level 1 challenge by submitting sensor data', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
        challengeLevel: AkamaiChallengeLevel.LEVEL_1,
      };

      const sensorData = {
        sensorVersion: '1.0',
        fingerprint: {},
        telemetry: { mouseMovements: [], keyboardEvents: [], scrollEvents: [], touchEvents: [], timing: {} },
        timestamp: Date.now(),
        pageUrl: 'https://example.com',
      };

      const bmakCookie = {
        version: '1',
        timestamp: Date.now(),
        sessionToken: 'test-token',
        sensorHash: 'test-hash',
      };

      // Mock finding sensor endpoint
      (mockPage.evaluate as jest.Mock).mockResolvedValueOnce('https://akam.net/sensor');

      // Mock sensor submission
      (mockPage.evaluate as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock cookies after submission (value must be > 50 characters)
      (mockContext.cookies as jest.Mock).mockResolvedValue([
        { name: '_abck', value: 'valid-abck-cookie-value-123456789012345678901234567890' },
      ]);

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await (solver as any).solveLevel1(detection, Date.now(), sensorData, bmakCookie);

      expect(result).toBeDefined();
      expect(result.token).toBe('valid-abck-cookie-value-123456789012345678901234567890');
      expect(result.challengeLevel).toBe(AkamaiChallengeLevel.LEVEL_1);
    });

    it('should throw error if Level 1 challenge not bypassed', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
        challengeLevel: AkamaiChallengeLevel.LEVEL_1,
      };

      const sensorData = {
        sensorVersion: '1.0',
        fingerprint: {},
        telemetry: { mouseMovements: [], keyboardEvents: [], scrollEvents: [], touchEvents: [], timing: {} },
        timestamp: Date.now(),
        pageUrl: 'https://example.com',
      };

      (mockPage.evaluate as jest.Mock).mockResolvedValueOnce(null); // No sensor endpoint
      (mockContext.cookies as jest.Mock).mockResolvedValue([]); // No cookies

      await expect(
        (solver as any).solveLevel1(detection, Date.now(), sensorData),
      ).rejects.toThrow('Level 1 challenge not bypassed');
    });
  });

  describe('solveLevel2', () => {
    it('should solve Level 2 challenge with JavaScript execution', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
        challengeLevel: AkamaiChallengeLevel.LEVEL_2,
      };

      const sensorData = {
        sensorVersion: '1.0',
        fingerprint: {},
        telemetry: { mouseMovements: [], keyboardEvents: [], scrollEvents: [], touchEvents: [], timing: {} },
        timestamp: Date.now(),
        pageUrl: 'https://example.com',
      };

      // Mock bmak challenge execution
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce(true) // challenge result
        .mockResolvedValueOnce('https://akam.net/sensor') // sensor endpoint
        .mockResolvedValueOnce(undefined); // sensor submission

      (mockContext.cookies as jest.Mock).mockResolvedValue([
        { name: '_abck', value: 'valid-abck-cookie-value-123456789012345678901234567890' },
      ]);

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await (solver as any).solveLevel2(detection, Date.now(), sensorData);

      expect(result).toBeDefined();
      expect(result.token).toBe('valid-abck-cookie-value-123456789012345678901234567890');
      expect(result.challengeLevel).toBe(AkamaiChallengeLevel.LEVEL_2);
    });
  });

  describe('solveLevel3', () => {
    it('should solve Level 3 challenge with anti-debugging bypass', async () => {
      const detection = {
        confidence: 0.8,
        container: null,
        challengeIframe: null,
        challengeLevel: AkamaiChallengeLevel.LEVEL_3,
      };

      const sensorData = {
        sensorVersion: '1.0',
        fingerprint: {},
        telemetry: { mouseMovements: [], keyboardEvents: [], scrollEvents: [], touchEvents: [], timing: {} },
        timestamp: Date.now(),
        pageUrl: 'https://example.com',
      };

      // Mock anti-debugging override
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce(undefined) // anti-debugging override
        .mockResolvedValueOnce(true) // challenge solve result
        .mockResolvedValueOnce('https://akam.net/sensor') // sensor endpoint
        .mockResolvedValueOnce(undefined); // sensor submission

      (mockContext.cookies as jest.Mock).mockResolvedValue([
        { name: '_abck', value: 'valid-abck-cookie-value-123456789012345678901234567890' },
      ]);

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await (solver as any).solveLevel3(detection, Date.now(), sensorData);

      expect(result).toBeDefined();
      expect(result.token).toBe('valid-abck-cookie-value-123456789012345678901234567890');
      expect(result.challengeLevel).toBe(AkamaiChallengeLevel.LEVEL_3);
    });
  });

  describe('solve', () => {
    it('should solve Akamai challenge successfully', async () => {
      const params = { type: 'akamai' as const, url: 'https://example.com' };

      // Mock detection
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce({
          hasAkamaiScript: true,
          hasBmScript: true,
          hasBmpScript: false,
          hasWindowCf: true,
          hasWindowBmak: true,
          scripts: ['https://akam.net/sensor_data.js'],
          cookieNames: ['_abck'],
          sensorVersion: '1.0',
        })
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 3 check (false)
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 2 check (false) -> defaults to Level 1
        .mockResolvedValueOnce('session-id') // getSessionId for fingerprint
        .mockResolvedValueOnce({
          screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
          timezoneOffset: -480,
          language: 'en-US',
          platform: 'Win32',
          userAgent: 'Mozilla/5.0...',
          capabilities: { plugins: [], mimeTypes: [] },
          hardware: { hardwareConcurrency: 8 },
        })
        .mockResolvedValueOnce('session-id') // getSessionId for sensor data
        .mockResolvedValueOnce('https://example.com') // referrer
        .mockResolvedValueOnce({
          pageLoadTime: 1000,
          scriptExecutionTime: 500,
          domContentLoadedTime: 800,
          firstPaintTime: 600,
        })
        .mockResolvedValueOnce('https://akam.net/sensor') // findSensorEndpoint
        .mockResolvedValueOnce(undefined); // submitSensorData

      (mockContext.cookies as jest.Mock)
        .mockResolvedValueOnce([
          { name: '_abck', value: 'test-abck' },
        ])
        .mockResolvedValueOnce([
          { name: '_abck', value: 'valid-abck-cookie-value-123456789012345678901234567890' },
        ]);

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await solver.solve(params);

      expect(result).toBeDefined();
      expect(result.token).toBe('valid-abck-cookie-value-123456789012345678901234567890');
      expect(result.solverId).toBe('akamai-native');
    });

    it('should retry on failure', async () => {
      const params = { type: 'akamai' as const, url: 'https://example.com' };

      // Mock detection success both times, but first solve attempt fails (no cookie), second succeeds
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce({
          hasAkamaiScript: true,
          hasBmScript: true,
          hasBmpScript: false,
          hasWindowCf: true,
          hasWindowBmak: true,
          scripts: ['https://akam.net/sensor_data.js'],
          cookieNames: ['_abck'],
          sensorVersion: '1.0',
        })
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 3 check (false)
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 2 check (false) -> defaults to Level 1
        .mockResolvedValueOnce('session-id') // getSessionId for fingerprint
        .mockResolvedValueOnce({
          screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
          timezoneOffset: -480,
          language: 'en-US',
          platform: 'Win32',
          userAgent: 'Mozilla/5.0...',
          capabilities: { plugins: [], mimeTypes: [] },
          hardware: { hardwareConcurrency: 8 },
        })
        .mockResolvedValueOnce('session-id') // getSessionId for sensor data
        .mockResolvedValueOnce('https://example.com') // referrer
        .mockResolvedValueOnce({
          pageLoadTime: 1000,
          scriptExecutionTime: 500,
          domContentLoadedTime: 800,
          firstPaintTime: 600,
        })
        .mockResolvedValueOnce('https://akam.net/sensor') // findSensorEndpoint - first attempt
        .mockResolvedValueOnce(undefined) // submitSensorData - first attempt
        // Second attempt mocks
        .mockResolvedValueOnce({
          hasAkamaiScript: true,
          hasBmScript: true,
          hasBmpScript: false,
          hasWindowCf: true,
          hasWindowBmak: true,
          scripts: ['https://akam.net/sensor_data.js'],
          cookieNames: ['_abck'],
          sensorVersion: '1.0',
        })
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 3 check (false)
        .mockResolvedValueOnce(false) // determineChallengeLevel - Level 2 check (false) -> defaults to Level 1
        .mockResolvedValueOnce('session-id') // getSessionId for fingerprint
        .mockResolvedValueOnce({
          screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
          timezoneOffset: -480,
          language: 'en-US',
          platform: 'Win32',
          userAgent: 'Mozilla/5.0...',
          capabilities: { plugins: [], mimeTypes: [] },
          hardware: { hardwareConcurrency: 8 },
        })
        .mockResolvedValueOnce('session-id')
        .mockResolvedValueOnce('https://example.com')
        .mockResolvedValueOnce({
          pageLoadTime: 1000,
          scriptExecutionTime: 500,
          domContentLoadedTime: 800,
          firstPaintTime: 600,
        })
        .mockResolvedValueOnce('https://akam.net/sensor')
        .mockResolvedValueOnce(undefined);

      (mockContext.cookies as jest.Mock)
        .mockResolvedValueOnce([
          { name: '_abck', value: 'test-abck' },
        ])
        .mockResolvedValueOnce([]) // First attempt: no valid cookie after submission
        .mockResolvedValueOnce([
          { name: '_abck', value: 'test-abck' },
        ])
        .mockResolvedValueOnce([
          { name: '_abck', value: 'valid-abck-cookie-value-123456789012345678901234567890' },
        ]); // Second attempt: valid cookie after submission

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await solver.solve(params);

      expect(result).toBeDefined();
      expect(result.token).toBe('valid-abck-cookie-value-123456789012345678901234567890');
    });
  });

  describe('getMetrics', () => {
    it('should return solver metrics', () => {
      const metrics = solver.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.challengeLevelDistribution).toBeDefined();
    });
  });
});

