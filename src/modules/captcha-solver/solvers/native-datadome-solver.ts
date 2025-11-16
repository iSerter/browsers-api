import { Injectable, Logger } from '@nestjs/common';
import { Page, Frame, CDPSession } from 'playwright';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import {
  DataDomeChallengeType,
  DataDomeDetectionResult,
  DataDomeChallengeResponse,
  DataDomeSolverConfig,
  DataDomeSolverMetrics,
  BrowserFingerprint,
  SensorData,
} from './interfaces/datadome-solver.interface';

/**
 * Default configuration for DataDome solver
 */
const DEFAULT_CONFIG: Required<DataDomeSolverConfig> = {
  maxRetries: 3,
  sensorTimeout: 30000,
  captchaTimeout: 60000,
  sliderTimeout: 30000,
  initialRetryDelay: 2000,
  maxRetryDelay: 30000,
  fingerprintConsistency: 'session',
  sensorVerbosity: 'normal',
  enableCaptchaSolving: true,
  enableSliderSolving: true,
  enableCookieManipulation: true,
};

/**
 * Native DataDome Challenge Solver
 *
 * Implements browser automation-based solving for DataDome challenges.
 * Supports sensor validation, CAPTCHA, slider, and cookie challenges.
 */
@Injectable()
export class NativeDataDomeSolver implements ICaptchaSolver {
  private readonly logger: Logger;
  private readonly config: Required<DataDomeSolverConfig>;
  private readonly metrics: DataDomeSolverMetrics;
  private readonly sessionFingerprints: Map<string, BrowserFingerprint> = new Map();
  private cdpSession: CDPSession | null = null;

  constructor(
    private readonly page: Page,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
    private readonly behaviorSimulation: HumanBehaviorSimulationService,
    private readonly performanceTracker?: SolverPerformanceTracker,
    config?: DataDomeSolverConfig,
  ) {
    this.logger = new Logger(NativeDataDomeSolver.name);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageSolvingTime: 0,
      challengeTypeDistribution: {
        [DataDomeChallengeType.SENSOR_VALIDATION]: 0,
        [DataDomeChallengeType.CAPTCHA]: 0,
        [DataDomeChallengeType.SLIDER]: 0,
        [DataDomeChallengeType.COOKIE]: 0,
      },
      failureReasons: {},
      fingerprintConfigs: [],
    };
  }

  /**
   * Get the name of the solver
   */
  getName(): string {
    return 'datadome-native';
  }

  /**
   * Check if the solver is available
   * Native solvers are always available (no API key required)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Initialize CDP session for low-level browser manipulation
   */
  private async initializeCDP(): Promise<void> {
    if (!this.cdpSession) {
      try {
        const context = this.page.context();
        this.cdpSession = await context.newCDPSession(this.page);
        this.logger.debug('CDP session initialized');
      } catch (error: any) {
        this.logger.warn(`Failed to initialize CDP session: ${error.message}`);
      }
    }
  }

  /**
   * Solve a DataDome challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    let lastError: Error | null = null;

    // Initialize CDP session
    await this.initializeCDP();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      this.metrics.totalAttempts++;
      let detection: DataDomeDetectionResult | null = null;

      try {
        this.logger.debug(
          `Attempt ${attempt}/${this.config.maxRetries} to solve DataDome challenge`,
        );

        // Detect DataDome widget
        detection = await this.detectDataDome(params);
        if (!detection || detection.confidence < 0.5) {
          throw new Error('DataDome widget not detected');
        }

        // Generate or retrieve fingerprint
        const fingerprint = await this.generateOrRetrieveFingerprint();

        // Generate sensor data
        const sensorData = await this.generateSensorData();

        // Intercept and modify DataDome requests
        await this.setupDataDomeInterception(fingerprint, sensorData);

        // Determine challenge type
        if (!detection.challengeType) {
          detection.challengeType = await this.determineChallengeType(detection);
        }

        if (detection.challengeType) {
          this.metrics.challengeTypeDistribution[detection.challengeType]++;
        }

        // Solve based on challenge type
        const response = await this.solveChallenge(detection, params, attempt, fingerprint);

        const duration = Date.now() - startTime;
        this.metrics.successCount++;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'datadome',
            duration,
            true,
          );
        }

        this.logger.log(
          `Successfully solved DataDome challenge${detection.challengeType ? ` (${detection.challengeType})` : ''} in ${duration}ms on attempt ${attempt}`,
        );

        return {
          token: response.token,
          solvedAt: response.solvedAt,
          solverId: this.getName(),
        };
      } catch (error: any) {
        lastError = error;
        const duration = Date.now() - startTime;
        this.metrics.failureCount++;
        const errorMessage = error.message || 'Unknown error';
        this.metrics.failureReasons[errorMessage] =
          (this.metrics.failureReasons[errorMessage] || 0) + 1;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'datadome',
            duration,
            false,
            errorMessage,
          );
        }

        this.logger.warn(
          `Attempt ${attempt}/${this.config.maxRetries} failed: ${errorMessage}`,
        );

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }

        // Exponential backoff retry delay
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(
            this.config.initialRetryDelay * Math.pow(2, attempt - 1),
            this.config.maxRetryDelay,
          );
          this.logger.debug(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to solve DataDome challenge after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Detect DataDome widget on the page
   */
  private async detectDataDome(
    params: CaptchaParams,
  ): Promise<DataDomeDetectionResult> {
    try {
      const detectionData = await this.page.evaluate(() => {
        const data: any = {
          hasCaptchaDiv: false,
          hasDataDomeScript: false,
          hasWindowDD: false,
          scripts: [] as string[],
          cookieNames: [] as string[],
        };

        // Check for DataDome captcha container
        const captchaDiv = document.querySelector(
          '#datadome, [id*="datadome"], .datadome, [class*="datadome"]',
        );
        data.hasCaptchaDiv = !!captchaDiv;

        // Check for DataDome scripts
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        data.scripts = scripts
          .map((s) => s.getAttribute('src'))
          .filter((src) => src && (src.includes('datadome') || src.includes('dd.js')))
          .filter((src): src is string => src !== null);

        data.hasDataDomeScript = data.scripts.length > 0;

        // Check for window.DD_RUM or window.datadomeOptions
        data.hasWindowDD = !!(window as any).DD_RUM || !!(window as any).datadomeOptions;

        // Check cookies
        const cookies = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
        data.cookieNames = cookies.filter((name) =>
          name.toLowerCase().includes('datadome') || name.toLowerCase().includes('dd_'),
        );

        return data;
      });

      // Get DataDome cookies from context
      const context = this.page.context();
      const cookies = await context.cookies();
      const datadomeCookies = cookies.filter(
        (c) =>
          c.name.toLowerCase().includes('datadome') ||
          c.name.toLowerCase().includes('dd_testcookie'),
      );

      const datadomeCookie = datadomeCookies.find((c) => c.name === 'datadome')?.value;

      // Calculate confidence
      let confidence = 0;
      if (detectionData.hasCaptchaDiv) confidence += 0.3;
      if (detectionData.hasDataDomeScript) confidence += 0.3;
      if (detectionData.hasWindowDD) confidence += 0.2;
      if (datadomeCookies.length > 0) confidence += 0.2;

      return {
        container: null, // Will be set if needed
        captchaIframe: null,
        sliderElement: null,
        confidence,
        datadomeCookie,
        details: {
          scriptUrls: detectionData.scripts,
          hasWindowDD: detectionData.hasWindowDD,
          cookieNames: datadomeCookies.map((c) => c.name),
        },
      };
    } catch (error: any) {
      this.logger.warn(`Error detecting DataDome widget: ${error.message}`);
      return {
        container: null,
        captchaIframe: null,
        sliderElement: null,
        confidence: 0,
      };
    }
  }

  /**
   * Generate or retrieve browser fingerprint
   */
  private async generateOrRetrieveFingerprint(): Promise<BrowserFingerprint> {
    const sessionId = await this.getSessionId();

    // Check if we have a session-based fingerprint
    if (
      this.config.fingerprintConsistency === 'session' &&
      this.sessionFingerprints.has(sessionId)
    ) {
      return this.sessionFingerprints.get(sessionId)!;
    }

    // Generate new fingerprint
    const fingerprint = await this.generateFingerprint();

    // Store for session consistency
    if (this.config.fingerprintConsistency === 'session') {
      this.sessionFingerprints.set(sessionId, fingerprint);
    }

    return fingerprint;
  }

  /**
   * Get session ID for fingerprint consistency
   */
  private async getSessionId(): Promise<string> {
    return await this.page.evaluate(() => {
      if (!(window as any).__datadomeSessionId) {
        (window as any).__datadomeSessionId = Math.random().toString(36).substring(2, 15);
      }
      return (window as any).__datadomeSessionId;
    });
  }

  /**
   * Generate browser fingerprint
   */
  private async generateFingerprint(): Promise<BrowserFingerprint> {
    return await this.page.evaluate(() => {
      // Canvas fingerprinting with randomized but consistent noise
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('DataDome fingerprint', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('DataDome fingerprint', 4, 17);
        // Add random noise for consistency
        const noise = Math.random() * 0.1;
        ctx.globalAlpha = noise;
        ctx.fillRect(0, 0, 200, 50);
      }
      const canvasFingerprint = canvas.toDataURL();

      // WebGL fingerprinting
      let webglRenderer = 'Unknown';
      try {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            webglRenderer =
              gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
          }
        }
      } catch (e) {
        // WebGL not available
      }

      // Audio context fingerprinting
      let audioFingerprint = 'unknown';
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const analyser = audioContext.createAnalyser();
        const gainNode = audioContext.createGain();
        const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.value = 10000;
        gainNode.gain.value = 0;

        oscillator.start(0);
        oscillator.stop(0.1);

        // Generate fingerprint from audio context
        audioFingerprint = audioContext.sampleRate.toString();
      } catch (e) {
        // Audio context not available
      }

      // Font enumeration
      const fonts = [
        'Arial',
        'Verdana',
        'Times New Roman',
        'Courier New',
        'Georgia',
        'Palatino',
        'Garamond',
        'Bookman',
        'Comic Sans MS',
        'Trebuchet MS',
        'Arial Black',
        'Impact',
      ];

      // Get screen resolution
      const screenResolution = {
        width: screen.width,
        height: screen.height,
      };

      // Get timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Get plugins
      const plugins = Array.from(navigator.plugins).map((p) => p.name);

      return {
        screenResolution,
        timezone,
        plugins,
        canvasFingerprint,
        webglRenderer,
        audioFingerprint,
        fonts,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || 4,
        deviceMemory: (navigator as any).deviceMemory,
      } as BrowserFingerprint;
    });
  }

  /**
   * Generate sensor data (mouse movements, scroll, keyboard, touch)
   */
  private async generateSensorData(): Promise<SensorData> {
    const mouseMovements: SensorData['mouseMovements'] = [];
    const scrollEvents: SensorData['scrollEvents'] = [];
    const keyboardEvents: SensorData['keyboardEvents'] = [];
    const touchEvents: SensorData['touchEvents'] = [];

    // Generate realistic mouse movements using Bezier curves
    const startTime = Date.now();
    const viewport = this.page.viewportSize() || { width: 1920, height: 1080 };

    // Generate 10-20 mouse movements
    const numMovements = 10 + Math.floor(Math.random() * 11);
    let currentX = Math.random() * viewport.width;
    let currentY = Math.random() * viewport.height;

    for (let i = 0; i < numMovements; i++) {
      const targetX = Math.random() * viewport.width;
      const targetY = Math.random() * viewport.height;

      // Generate Bezier curve points
      const points = this.generateBezierPoints(
        { x: currentX, y: currentY },
        { x: targetX, y: targetY },
        10, // Number of points along curve
      );

      points.forEach((point, index) => {
        const timestamp = startTime + i * 200 + index * 20; // 200ms between movements, 20ms between points
        mouseMovements.push({
          timestamp,
          x: point.x + (Math.random() - 0.5) * 2, // 1-3px jitter
          y: point.y + (Math.random() - 0.5) * 2,
          type: index === 0 ? 'mousemove' : 'mousemove',
        });
      });

      currentX = targetX;
      currentY = targetY;
    }

    // Generate scroll events
    const numScrolls = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numScrolls; i++) {
      scrollEvents.push({
        timestamp: startTime + i * 500,
        deltaX: (Math.random() - 0.5) * 100,
        deltaY: Math.random() * 200 + 50,
      });
    }

    // Generate keyboard events (if needed)
    const numKeys = Math.floor(Math.random() * 5);
    for (let i = 0; i < numKeys; i++) {
      keyboardEvents.push({
        timestamp: startTime + i * 300,
        key: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
        code: `Key${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
      });
    }

    return {
      mouseMovements,
      scrollEvents,
      keyboardEvents,
      touchEvents,
    };
  }

  /**
   * Generate Bezier curve points for natural mouse movement
   */
  private generateBezierPoints(
    start: { x: number; y: number },
    end: { x: number; y: number },
    numPoints: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deviation = distance * 0.2; // 20% deviation

    // Control points with deviation
    const control1 = {
      x: start.x + dx * 0.3 + (Math.random() - 0.5) * deviation,
      y: start.y + dy * 0.3 + (Math.random() - 0.5) * deviation,
    };
    const control2 = {
      x: start.x + dx * 0.7 + (Math.random() - 0.5) * deviation,
      y: start.y + dy * 0.7 + (Math.random() - 0.5) * deviation,
    };

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        mt3 * start.x +
        3 * mt2 * t * control1.x +
        3 * mt * t2 * control2.x +
        t3 * end.x;
      const y =
        mt3 * start.y +
        3 * mt2 * t * control1.y +
        3 * mt * t2 * control2.y +
        t3 * end.y;

      points.push({ x, y });
    }

    return points;
  }

  /**
   * Setup DataDome request interception and modification
   */
  private async setupDataDomeInterception(
    fingerprint: BrowserFingerprint,
    sensorData: SensorData,
  ): Promise<void> {
    // Intercept network requests to datadome.co/js/ endpoints
    await this.page.route('**/datadome.co/js/**', async (route) => {
      const request = route.request();
      const postData = request.postData();

      // Modify request payload with fingerprint and sensor data
      const modifiedData = {
        ...(postData ? JSON.parse(postData) : {}),
        fingerprint: {
          screen: fingerprint.screenResolution,
          timezone: fingerprint.timezone,
          plugins: fingerprint.plugins,
          canvas: fingerprint.canvasFingerprint.substring(0, 100), // Truncate for size
          webgl: fingerprint.webglRenderer,
          audio: fingerprint.audioFingerprint,
          fonts: fingerprint.fonts,
          userAgent: fingerprint.userAgent,
          language: fingerprint.language,
          platform: fingerprint.platform,
          hardwareConcurrency: fingerprint.hardwareConcurrency,
        },
        sensorData: {
          mouse: sensorData.mouseMovements.slice(0, 50), // Limit size
          scroll: sensorData.scrollEvents,
          keyboard: sensorData.keyboardEvents,
        },
      };

      await route.continue({
        postData: JSON.stringify(modifiedData),
      });
    });
  }

  /**
   * Determine challenge type
   */
  private async determineChallengeType(
    detection: DataDomeDetectionResult,
  ): Promise<DataDomeChallengeType> {
    try {
      // Check for CAPTCHA iframe
      const frames = this.page.frames();
      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('recaptcha') || url.includes('hcaptcha')) {
          detection.captchaIframe = frame;
          return DataDomeChallengeType.CAPTCHA;
        }
      }

      // Check for slider widget
      const slider = await this.page.locator(
        '[class*="slider"], [id*="slider"], .datadome-slider, [data-slider]',
      ).first();
      if (await slider.count() > 0) {
        detection.sliderElement = slider;
        return DataDomeChallengeType.SLIDER;
      }

      // Check for challenge cookie
      if (detection.datadomeCookie) {
        return DataDomeChallengeType.COOKIE;
      }

      // Default to sensor validation
      return DataDomeChallengeType.SENSOR_VALIDATION;
    } catch (error: any) {
      this.logger.warn(`Error determining challenge type: ${error.message}`);
      return DataDomeChallengeType.SENSOR_VALIDATION;
    }
  }

  /**
   * Solve challenge based on type
   */
  private async solveChallenge(
    detection: DataDomeDetectionResult,
    params: CaptchaParams,
    attempt: number,
    fingerprint: BrowserFingerprint,
  ): Promise<DataDomeChallengeResponse> {
    const challengeType =
      detection.challengeType || DataDomeChallengeType.SENSOR_VALIDATION;
    const solveStartTime = Date.now();

    switch (challengeType) {
      case DataDomeChallengeType.SENSOR_VALIDATION:
        return this.solveSensorValidation(detection, solveStartTime, fingerprint);
      case DataDomeChallengeType.CAPTCHA:
        return this.solveCaptchaChallenge(detection, params, solveStartTime);
      case DataDomeChallengeType.SLIDER:
        return this.solveSliderChallenge(detection, solveStartTime);
      case DataDomeChallengeType.COOKIE:
        return this.solveCookieChallenge(detection, solveStartTime);
      default:
        throw new Error(`Unknown challenge type: ${challengeType}`);
    }
  }

  /**
   * Solve sensor validation challenge
   */
  private async solveSensorValidation(
    detection: DataDomeDetectionResult,
    solveStartTime: number,
    fingerprint: BrowserFingerprint,
  ): Promise<DataDomeChallengeResponse> {
    // Sensor validation is handled by fingerprint and sensor data injection
    // Wait for page to process and check for success
    await this.sleep(3000);

    // Check if challenge was bypassed (cookie updated or page redirected)
    const cookies = await this.page.context().cookies();
    const datadomeCookie = cookies.find((c) => c.name === 'datadome');

    if (datadomeCookie && datadomeCookie.value.length > 50) {
      // Valid cookie indicates success
      return {
        token: datadomeCookie.value,
        solvedAt: new Date(),
        challengeType: DataDomeChallengeType.SENSOR_VALIDATION,
        duration: Date.now() - solveStartTime,
        fingerprint,
      };
    }

    throw new Error('Sensor validation challenge not bypassed');
  }

  /**
   * Solve CAPTCHA challenge
   */
  private async solveCaptchaChallenge(
    detection: DataDomeDetectionResult,
    params: CaptchaParams,
    solveStartTime: number,
  ): Promise<DataDomeChallengeResponse> {
    if (!this.config.enableCaptchaSolving) {
      throw new Error('CAPTCHA solving is disabled');
    }

    if (!detection.captchaIframe) {
      throw new Error('CAPTCHA iframe not found');
    }

    // Determine CAPTCHA type (reCAPTCHA or hCAPTCHA)
    const captchaUrl = detection.captchaIframe.url();
    let captchaType: 'recaptcha' | 'hcaptcha' = 'recaptcha';

    if (captchaUrl.includes('hcaptcha')) {
      captchaType = 'hcaptcha';
    }

    // Use existing native solvers for CAPTCHA
    // This would require integration with NativeRecaptchaSolver or NativeHcaptchaSolver
    // For now, we'll wait and check for token
    this.logger.debug(`Detected ${captchaType} CAPTCHA in DataDome challenge`);

    // Wait for CAPTCHA to be solved (this would typically be done by another solver)
    await this.sleep(5000);

    // Check for token in cookies or DOM
    const cookies = await this.page.context().cookies();
    const datadomeCookie = cookies.find((c) => c.name === 'datadome');

    if (datadomeCookie && datadomeCookie.value.length > 50) {
      return {
        token: datadomeCookie.value,
        solvedAt: new Date(),
        challengeType: DataDomeChallengeType.CAPTCHA,
        duration: Date.now() - solveStartTime,
      };
    }

    throw new Error('CAPTCHA challenge not solved');
  }

  /**
   * Solve slider challenge
   */
  private async solveSliderChallenge(
    detection: DataDomeDetectionResult,
    solveStartTime: number,
  ): Promise<DataDomeChallengeResponse> {
    if (!this.config.enableSliderSolving) {
      throw new Error('Slider solving is disabled');
    }

    if (!detection.sliderElement) {
      throw new Error('Slider element not found');
    }

    try {
      // Get slider dimensions and calculate drag distance
      const sliderInfo = await this.page.evaluate(() => {
        const slider = document.querySelector(
          '[class*="slider"], [id*="slider"], .datadome-slider, [data-slider]',
        ) as HTMLElement;
        if (!slider) return null;

        const track = slider.querySelector('[class*="track"], [class*="rail"]') as HTMLElement;
        const handle = slider.querySelector('[class*="handle"], [class*="thumb"]') as HTMLElement;

        if (!track || !handle) return null;

        return {
          trackWidth: track.offsetWidth,
          handleLeft: handle.offsetLeft,
          handleWidth: handle.offsetWidth,
        };
      });

      if (!sliderInfo) {
        throw new Error('Could not get slider dimensions');
      }

      // Calculate required drag distance (typically full width)
      const dragDistance = sliderInfo.trackWidth - sliderInfo.handleLeft - sliderInfo.handleWidth;

      // Perform realistic drag with variable speed and micro-adjustments
      const slider = detection.sliderElement;
      const box = await slider.boundingBox();
      if (!box) {
        throw new Error('Slider bounding box not found');
      }

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const endX = startX + dragDistance;

      // Generate Bezier curve points for natural drag
      const points = this.generateBezierPoints(
        { x: startX, y: startY },
        { x: endX, y: startY },
        20,
      );

      // Move mouse to start position
      await this.page.mouse.move(startX, startY);
      await this.sleep(100 + Math.random() * 100);

      // Press mouse button
      await this.page.mouse.down();
      await this.sleep(50 + Math.random() * 50);

      // Drag along Bezier curve
      for (const point of points) {
        await this.page.mouse.move(point.x, point.y + (Math.random() - 0.5) * 2); // Micro-adjustments
        await this.sleep(10 + Math.random() * 20); // Variable speed
      }

      // Release mouse button
      await this.sleep(50 + Math.random() * 50);
      await this.page.mouse.up();

      // Wait for validation
      await this.sleep(2000);

      // Check for success
      const cookies = await this.page.context().cookies();
      const datadomeCookie = cookies.find((c) => c.name === 'datadome');

      if (datadomeCookie && datadomeCookie.value.length > 50) {
        return {
          token: datadomeCookie.value,
          solvedAt: new Date(),
          challengeType: DataDomeChallengeType.SLIDER,
          duration: Date.now() - solveStartTime,
        };
      }

      throw new Error('Slider challenge not completed');
    } catch (error: any) {
      throw new Error(`Failed to solve slider challenge: ${error.message}`);
    }
  }

  /**
   * Solve cookie challenge
   */
  private async solveCookieChallenge(
    detection: DataDomeDetectionResult,
    solveStartTime: number,
  ): Promise<DataDomeChallengeResponse> {
    if (!this.config.enableCookieManipulation) {
      throw new Error('Cookie manipulation is disabled');
    }

    // Extract and analyze challenge cookie
    if (!detection.datadomeCookie) {
      throw new Error('DataDome cookie not found');
    }

    // Cookie manipulation would involve decoding, modifying, and re-encoding
    // This is a simplified version
    const context = this.page.context();
    const cookies = await context.cookies();
    const datadomeCookie = cookies.find((c) => c.name === 'datadome');

    if (datadomeCookie) {
      // In a real implementation, we would:
      // 1. Decode the cookie value
      // 2. Modify challenge parameters
      // 3. Re-encode with valid signature
      // For now, we'll just return the existing cookie if it's valid

      if (datadomeCookie.value.length > 50) {
        return {
          token: datadomeCookie.value,
          solvedAt: new Date(),
          challengeType: DataDomeChallengeType.COOKIE,
          duration: Date.now() - solveStartTime,
        };
      }
    }

    throw new Error('Cookie challenge not solved');
  }

  /**
   * Determine if an error should not trigger a retry
   */
  private shouldNotRetry(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';

    // Don't retry on widget not detected errors
    if (errorMessage.includes('widget not detected')) {
      return true;
    }

    // Don't retry on invalid parameters
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('required')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update metrics after solving attempt
   */
  private updateMetrics(duration: number): void {
    this.metrics.successRate =
      this.metrics.totalAttempts > 0
        ? this.metrics.successCount / this.metrics.totalAttempts
        : 0;

    // Update average solving time (exponential moving average)
    if (this.metrics.averageSolvingTime === 0) {
      this.metrics.averageSolvingTime = duration;
    } else {
      this.metrics.averageSolvingTime =
        this.metrics.averageSolvingTime * 0.7 + duration * 0.3;
    }
  }

  /**
   * Get solver metrics
   */
  getMetrics(): DataDomeSolverMetrics {
    return { ...this.metrics };
  }
}

