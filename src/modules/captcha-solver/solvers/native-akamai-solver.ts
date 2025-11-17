import { Injectable, Logger } from '@nestjs/common';
import type { Page, Frame, CDPSession } from 'playwright';
import * as crypto from 'crypto';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import type {
  AkamaiSolverConfig,
} from './interfaces/akamai-solver.interface';
import {
  AkamaiChallengeLevel,
  AkamaiDetectionResult,
  AkamaiChallengeResponse,
  AkamaiSolverMetrics,
  AkamaiBrowserFingerprint,
  AkamaiBehavioralTelemetry,
  AkamaiSensorData,
  BmakCookie,
} from './interfaces/akamai-solver.interface';

/**
 * Default configuration for Akamai solver
 */
const DEFAULT_CONFIG: Required<AkamaiSolverConfig> = {
  maxRetries: 3,
  level1Timeout: 2000,
  level2Timeout: 5000,
  level3Timeout: 10000,
  initialRetryDelay: 1000,
  maxRetryDelay: 30000,
  fingerprintConsistency: 'session',
  sensorVerbosity: 'normal',
  enableLevel2: true,
  enableLevel3: true,
  enableBmakCookie: true,
  enableRequestSigning: true,
};

/**
 * Native Akamai Bot Manager Challenge Solver
 *
 * Implements browser automation-based solving for Akamai Bot Manager challenges.
 * Supports sensor data generation, bmak cookie generation, request signing,
 * and handling of various challenge levels (1-3).
 */
@Injectable()
export class NativeAkamaiSolver implements ICaptchaSolver {
  private readonly logger: Logger;
  private readonly config: Required<AkamaiSolverConfig>;
  private readonly metrics: AkamaiSolverMetrics;
  private readonly sessionFingerprints: Map<string, AkamaiBrowserFingerprint> = new Map();
  private readonly sessionSensorCache: Map<string, AkamaiSensorData> = new Map();
  private cdpSession: CDPSession | null = null;

  constructor(
    private readonly page: Page,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
    private readonly behaviorSimulation: HumanBehaviorSimulationService,
    private readonly performanceTracker?: SolverPerformanceTracker,
    config?: AkamaiSolverConfig,
  ) {
    this.logger = new Logger(NativeAkamaiSolver.name);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      averageSolvingTime: 0,
      challengeLevelDistribution: {
        [AkamaiChallengeLevel.LEVEL_1]: 0,
        [AkamaiChallengeLevel.LEVEL_2]: 0,
        [AkamaiChallengeLevel.LEVEL_3]: 0,
      },
      failureReasons: {},
      sensorGenerationSuccessRate: 0,
      averageSensorGenerationTime: 0,
    };
  }

  /**
   * Get the name of the solver
   */
  getName(): string {
    return 'akamai-native';
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
   * Solve an Akamai challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    let lastError: Error | null = null;

    // Initialize CDP session
    await this.initializeCDP();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      this.metrics.totalAttempts++;
      let detection: AkamaiDetectionResult | null = null;

      try {
        this.logger.debug(
          `Attempt ${attempt}/${this.config.maxRetries} to solve Akamai challenge`,
        );

        // Detect Akamai Bot Manager
        detection = await this.detectAkamai(params);
        if (!detection || detection.confidence < 0.5) {
          throw new Error('Akamai Bot Manager not detected');
        }

        // Determine challenge level
        if (!detection.challengeLevel) {
          detection.challengeLevel = await this.determineChallengeLevel(detection);
        }

        if (detection.challengeLevel) {
          this.metrics.challengeLevelDistribution[detection.challengeLevel]++;
        }

        // Generate or retrieve fingerprint
        const fingerprint = await this.generateOrRetrieveFingerprint();

        // Generate sensor data
        const sensorData = await this.generateSensorData(fingerprint);

        // Generate bmak cookie if enabled
        let bmakCookie: BmakCookie | undefined;
        if (this.config.enableBmakCookie) {
          bmakCookie = await this.generateBmakCookie(sensorData, fingerprint);
        }

        // Setup request interception and signing
        if (this.config.enableRequestSigning) {
          await this.setupRequestInterception(sensorData, bmakCookie);
        }

        // Solve based on challenge level
        const response = await this.solveChallenge(
          detection,
          params,
          attempt,
          fingerprint,
          sensorData,
          bmakCookie,
        );

        const duration = Date.now() - startTime;
        this.metrics.successCount++;
        this.updateMetrics(duration);

        // Record performance metrics
        if (this.performanceTracker) {
          this.performanceTracker.recordAttempt(
            this.getName(),
            'akamai',
            duration,
            true,
          );
        }

        this.logger.log(
          `Successfully solved Akamai challenge${detection.challengeLevel ? ` (${detection.challengeLevel})` : ''} in ${duration}ms on attempt ${attempt}`,
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
            'akamai',
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
      `Failed to solve Akamai challenge after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Detect Akamai Bot Manager on the page
   */
  private async detectAkamai(
    params: CaptchaParams,
  ): Promise<AkamaiDetectionResult> {
    try {
      const detectionData = await this.page.evaluate(() => {
        const data: any = {
          hasAkamaiScript: false,
          hasBmScript: false,
          hasBmpScript: false,
          hasWindowCf: false,
          hasWindowBmak: false,
          scripts: [] as string[],
          cookieNames: [] as string[],
          sensorVersion: null as string | null,
        };

        // Check for Akamai scripts
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        data.scripts = scripts
          .map((s) => s.getAttribute('src'))
          .filter((src) => src && (src.includes('akam.net') || src.includes('akamaihd.net')))
          .filter((src): src is string => src !== null);

        data.hasAkamaiScript = data.scripts.some((src) =>
          src.includes('akam.net') || src.includes('akamaihd.net'),
        );
        data.hasBmScript = data.scripts.some((src) => src.includes('bm.akam.net'));
        data.hasBmpScript = data.scripts.some((src) => src.includes('bmp.akam.net'));

        // Check for window objects
        data.hasWindowCf = !!(window as any)._cf;
        data.hasWindowBmak = !!(window as any).bmak;

        // Extract sensor version from scripts
        for (const script of data.scripts) {
          const versionMatch = script.match(/sensor_data[_-]?v?(\d+)/i);
          if (versionMatch) {
            data.sensorVersion = versionMatch[1];
            break;
          }
        }

        // Check cookies
        const cookies = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
        data.cookieNames = cookies.filter((name) =>
          ['_abck', 'bm_sz', 'ak_bmsc'].includes(name),
        );

        return data;
      });

      // Get Akamai cookies from context
      const context = this.page.context();
      const cookies = await context.cookies();
      const akamaiCookies = {
        _abck: cookies.find((c) => c.name === '_abck')?.value,
        bm_sz: cookies.find((c) => c.name === 'bm_sz')?.value,
        ak_bmsc: cookies.find((c) => c.name === 'ak_bmsc')?.value,
      };

      // Calculate confidence
      let confidence = 0;
      if (detectionData.hasAkamaiScript) confidence += 0.3;
      if (detectionData.hasBmScript) confidence += 0.2;
      if (detectionData.hasBmpScript) confidence += 0.1;
      if (detectionData.hasWindowCf || detectionData.hasWindowBmak) confidence += 0.2;
      if (Object.values(akamaiCookies).some((v) => v)) confidence += 0.2;

      return {
        container: null,
        challengeIframe: null,
        confidence,
        cookies: akamaiCookies,
        details: {
          scriptUrls: detectionData.scripts,
          hasWindowCf: detectionData.hasWindowCf,
          hasWindowBmak: detectionData.hasWindowBmak,
          cookieNames: Object.keys(akamaiCookies).filter(
            (k) => akamaiCookies[k as keyof typeof akamaiCookies],
          ),
          sensorVersion: detectionData.sensorVersion || undefined,
        },
      };
    } catch (error: any) {
      this.logger.warn(`Error detecting Akamai Bot Manager: ${error.message}`);
      return {
        container: null,
        challengeIframe: null,
        confidence: 0,
      };
    }
  }

  /**
   * Determine challenge level
   */
  private async determineChallengeLevel(
    detection: AkamaiDetectionResult,
  ): Promise<AkamaiChallengeLevel> {
    try {
      // Check for Level 3 indicators (advanced obfuscation, anti-debugging)
      const hasLevel3Indicators = await this.page.evaluate(() => {
        // Check for anti-debugging code
        const scripts = Array.from(document.querySelectorAll('script'));
        const scriptText = scripts.map((s) => s.textContent || '').join(' ');
        const hasAntiDebug =
          scriptText.includes('debugger') ||
          scriptText.includes('devtools') ||
          scriptText.includes('console.clear');

        // Check for obfuscated code
        const hasObfuscation = scriptText.length > 10000 && scriptText.includes('eval');

        return hasAntiDebug || hasObfuscation;
      });

      if (hasLevel3Indicators && this.config.enableLevel3) {
        return AkamaiChallengeLevel.LEVEL_3;
      }

      // Check for Level 2 indicators (interactive challenges, proof-of-work)
      const hasLevel2Indicators = await this.page.evaluate(() => {
        // Check for challenge iframes or interactive elements
        const frames = Array.from(document.querySelectorAll('iframe'));
        const hasChallengeFrame = frames.some((f) =>
          f.src.includes('akam') || f.src.includes('challenge'),
        );

        // Check for proof-of-work indicators
        const hasProofOfWork = !!(window as any).bmak?.challenge;

        return hasChallengeFrame || hasProofOfWork;
      });

      if (hasLevel2Indicators && this.config.enableLevel2) {
        return AkamaiChallengeLevel.LEVEL_2;
      }

      // Default to Level 1 (passive monitoring)
      return AkamaiChallengeLevel.LEVEL_1;
    } catch (error: any) {
      this.logger.warn(`Error determining challenge level: ${error.message}`);
      return AkamaiChallengeLevel.LEVEL_1;
    }
  }

  /**
   * Generate or retrieve browser fingerprint
   */
  private async generateOrRetrieveFingerprint(): Promise<AkamaiBrowserFingerprint> {
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
      if (!(window as any).__akamaiSessionId) {
        (window as any).__akamaiSessionId = Math.random().toString(36).substring(2, 15);
      }
      return (window as any).__akamaiSessionId;
    });
  }

  /**
   * Generate browser fingerprint
   */
  private async generateFingerprint(): Promise<AkamaiBrowserFingerprint> {
    return await this.page.evaluate(() => {
      // Screen information
      const screenInfo = {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
      };

      // Canvas fingerprinting
      let canvasFingerprint: string | undefined;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = "14px 'Arial'";
          ctx.fillStyle = '#f60';
          ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = '#069';
          ctx.fillText('Akamai fingerprint', 2, 15);
          ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
          ctx.fillText('Akamai fingerprint', 4, 17);
        }
        canvasFingerprint = canvas.toDataURL();
      } catch (e) {
        // Canvas not available
      }

      // WebGL fingerprinting
      let webglRenderer: string | undefined;
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            webglRenderer =
              gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string || undefined;
          }
        }
      } catch (e) {
        // WebGL not available
      }

      // Plugins and MIME types
      const plugins = Array.from(navigator.plugins).map((p) => p.name);
      const mimeTypes = Array.from(navigator.mimeTypes).map((m) => m.type);

      // Hardware info
      const hardware = {
        hardwareConcurrency: navigator.hardwareConcurrency || 4,
        deviceMemory: (navigator as any).deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints || 0,
      };

      return {
        screen: screenInfo,
        timezoneOffset: new Date().getTimezoneOffset(),
        language: navigator.language,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        capabilities: {
          plugins,
          mimeTypes,
          webglRenderer,
          canvasFingerprint,
        },
        hardware,
      } as AkamaiBrowserFingerprint;
    });
  }

  /**
   * Generate sensor data with behavioral telemetry
   */
  private async generateSensorData(
    fingerprint: AkamaiBrowserFingerprint,
  ): Promise<AkamaiSensorData> {
    const sessionId = await this.getSessionId();

    // Check cache for session consistency
    if (
      this.config.fingerprintConsistency === 'session' &&
      this.sessionSensorCache.has(sessionId)
    ) {
      return this.sessionSensorCache.get(sessionId)!;
    }

    const startTime = Date.now();
    const pageUrl = this.page.url();
    const referrer = await this.page.evaluate(() => document.referrer);

    // Generate behavioral telemetry
    const telemetry = await this.generateBehavioralTelemetry();

    // Get timing data
    const timing = await this.page.evaluate(() => {
      const perf = performance.timing;
      return {
        pageLoadTime: perf.loadEventEnd - perf.navigationStart,
        scriptExecutionTime: perf.domContentLoadedEventEnd - perf.domInteractive,
        domContentLoadedTime: perf.domContentLoadedEventEnd - perf.navigationStart,
        firstPaintTime: (performance as any).getEntriesByType?.('paint')?.[0]?.startTime,
      };
    });

    const sensorData: AkamaiSensorData = {
      sensorVersion: '1.0', // Default version, can be detected from scripts
      fingerprint,
      telemetry: {
        ...telemetry,
        timing: {
          ...timing,
          firstPaintTime: timing.firstPaintTime,
        },
      },
      timestamp: Date.now(),
      pageUrl,
      referrer: referrer || undefined,
    };

    // Cache for session consistency
    if (this.config.fingerprintConsistency === 'session') {
      this.sessionSensorCache.set(sessionId, sensorData);
    }

    const generationTime = Date.now() - startTime;
    this.updateSensorMetrics(true, generationTime);

    return sensorData;
  }

  /**
   * Generate behavioral telemetry (mouse, keyboard, scroll, touch)
   */
  private async generateBehavioralTelemetry(): Promise<AkamaiBehavioralTelemetry> {
    const mouseMovements: AkamaiBehavioralTelemetry['mouseMovements'] = [];
    const scrollEvents: AkamaiBehavioralTelemetry['scrollEvents'] = [];
    const keyboardEvents: AkamaiBehavioralTelemetry['keyboardEvents'] = [];
    const touchEvents: AkamaiBehavioralTelemetry['touchEvents'] = [];

    const startTime = Date.now();
    const viewport = this.page.viewportSize() || { width: 1920, height: 1080 };

    // Generate realistic mouse movements using Bezier curves
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
        10,
      );

      points.forEach((point, index) => {
        const timestamp = startTime + i * 200 + index * 20;
        mouseMovements.push({
          timestamp,
          x: point.x + (Math.random() - 0.5) * 2, // 1-3px jitter
          y: point.y + (Math.random() - 0.5) * 2,
          type: 'mousemove',
          buttons: index === 0 ? 0 : undefined,
        });
      });

      currentX = targetX;
      currentY = targetY;
    }

    // Generate scroll events with natural acceleration/deceleration
    const numScrolls = 3 + Math.floor(Math.random() * 4);
    let scrollY = 0;
    for (let i = 0; i < numScrolls; i++) {
      const deltaY = Math.random() * 200 + 50;
      scrollY += deltaY;
      scrollEvents.push({
        timestamp: startTime + i * 500,
        deltaX: (Math.random() - 0.5) * 100,
        deltaY,
        scrollX: 0,
        scrollY,
      });
    }

    // Generate keyboard events with realistic inter-key delays
    const numKeys = Math.floor(Math.random() * 5);
    for (let i = 0; i < numKeys; i++) {
      const keyCode = 65 + Math.floor(Math.random() * 26);
      keyboardEvents.push({
        timestamp: startTime + i * (150 + Math.random() * 100), // Realistic delays
        key: String.fromCharCode(keyCode).toLowerCase(),
        code: `Key${String.fromCharCode(keyCode)}`,
        keyCode,
        charCode: keyCode + 32,
      });
    }

    return {
      mouseMovements,
      scrollEvents,
      keyboardEvents,
      touchEvents,
      timing: {
        pageLoadTime: 0,
        scriptExecutionTime: 0,
        domContentLoadedTime: 0,
      },
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
   * Generate bmak cookie (_abck)
   */
  private async generateBmakCookie(
    sensorData: AkamaiSensorData,
    fingerprint: AkamaiBrowserFingerprint,
  ): Promise<BmakCookie> {
    const timestamp = Date.now();
    const sessionToken = crypto.randomBytes(16).toString('hex');

    // Generate sensor data hash
    const sensorDataString = JSON.stringify({
      version: sensorData.sensorVersion,
      fingerprint: {
        screen: fingerprint.screen,
        timezone: fingerprint.timezoneOffset,
        language: fingerprint.language,
        platform: fingerprint.platform,
      },
      telemetry: {
        mouse: sensorData.telemetry.mouseMovements.length,
        keyboard: sensorData.telemetry.keyboardEvents.length,
        scroll: sensorData.telemetry.scrollEvents.length,
      },
      timestamp: sensorData.timestamp,
    });

    const sensorHash = crypto
      .createHash('sha256')
      .update(sensorDataString)
      .digest('hex')
      .substring(0, 32);

    return {
      version: '1',
      timestamp,
      sessionToken,
      sensorHash,
      metadata: {
        userAgent: fingerprint.userAgent,
        pageUrl: sensorData.pageUrl,
      },
    };
  }

  /**
   * Setup request interception and signing
   */
  private async setupRequestInterception(
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<void> {
    // Intercept network requests to Akamai endpoints
    await this.page.route('**/akam.net/**', async (route) => {
      const request = route.request();
      const postData = request.postData();

      if (postData && request.method() === 'POST') {
        try {
          const payload = JSON.parse(postData);

          // Add sensor data to payload
          payload.sensor_data = sensorData;

          // Add bmak cookie data if available
          if (bmakCookie) {
            payload.bmak = bmakCookie;
          }

          // Sign the request
          const signature = this.signRequest(payload, sensorData);

          // Modify headers
          const headers = {
            ...request.headers(),
            'Content-Type': 'application/json',
            'X-Akamai-Signature': signature,
          };

          await route.continue({
            postData: JSON.stringify(payload),
            headers,
          });
        } catch (error: any) {
          this.logger.warn(`Failed to modify Akamai request: ${error.message}`);
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Sign request for Akamai validation
   */
  private signRequest(payload: any, sensorData: AkamaiSensorData): string {
    // Create signature from payload and sensor data
    const signatureData = JSON.stringify({
      payload,
      sensorVersion: sensorData.sensorVersion,
      timestamp: sensorData.timestamp,
      pageUrl: sensorData.pageUrl,
    });

    // Generate HMAC signature (simplified - real implementation would use Akamai's secret)
    const secret = 'akamai-secret-key'; // This would be derived from page context
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signatureData)
      .digest('hex');

    return signature;
  }

  /**
   * Solve challenge based on level
   */
  private async solveChallenge(
    detection: AkamaiDetectionResult,
    params: CaptchaParams,
    attempt: number,
    fingerprint: AkamaiBrowserFingerprint,
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<AkamaiChallengeResponse> {
    const challengeLevel =
      detection.challengeLevel || AkamaiChallengeLevel.LEVEL_1;
    const solveStartTime = Date.now();
    const timeout =
      challengeLevel === AkamaiChallengeLevel.LEVEL_3
        ? this.config.level3Timeout
        : challengeLevel === AkamaiChallengeLevel.LEVEL_2
          ? this.config.level2Timeout
          : this.config.level1Timeout;

    switch (challengeLevel) {
      case AkamaiChallengeLevel.LEVEL_1:
        return this.solveLevel1(detection, solveStartTime, sensorData, bmakCookie);
      case AkamaiChallengeLevel.LEVEL_2:
        return this.solveLevel2(detection, solveStartTime, sensorData, bmakCookie);
      case AkamaiChallengeLevel.LEVEL_3:
        return this.solveLevel3(detection, solveStartTime, sensorData, bmakCookie);
      default:
        throw new Error(`Unknown challenge level: ${challengeLevel}`);
    }
  }

  /**
   * Solve Level 1 challenge (passive monitoring)
   */
  private async solveLevel1(
    detection: AkamaiDetectionResult,
    solveStartTime: number,
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<AkamaiChallengeResponse> {
    // Level 1: Inject sensor data and wait for validation
    // Submit sensor data via POST request
    const sensorUrl = await this.findSensorEndpoint();

    if (sensorUrl) {
      await this.submitSensorData(sensorUrl, sensorData, bmakCookie);
    }

    // Wait for page to process
    await this.sleep(1000);

    // Check if challenge was bypassed (cookie updated or page redirected)
    const cookies = await this.page.context().cookies();
    const abckCookie = cookies.find((c) => c.name === '_abck');

    if (abckCookie && abckCookie.value.length > 50) {
      return {
        token: abckCookie.value,
        solvedAt: new Date(),
        challengeLevel: AkamaiChallengeLevel.LEVEL_1,
        duration: Date.now() - solveStartTime,
        fingerprint: sensorData.fingerprint,
        bmakCookie,
      };
    }

    throw new Error('Level 1 challenge not bypassed');
  }

  /**
   * Solve Level 2 challenge (interactive challenges)
   */
  private async solveLevel2(
    detection: AkamaiDetectionResult,
    solveStartTime: number,
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<AkamaiChallengeResponse> {
    if (!this.config.enableLevel2) {
      throw new Error('Level 2 challenge solving is disabled');
    }

    // Level 2: Solve JavaScript challenges and proof-of-work
    // Execute challenge scripts
    const challengeResult = await this.page.evaluate(() => {
      // Check for bmak challenge
      const bmak = (window as any).bmak;
      if (bmak && bmak.challenge) {
        // Execute challenge
        try {
          return bmak.challenge();
        } catch (e) {
          return null;
        }
      }
      return null;
    });

    // Submit sensor data
    const sensorUrl = await this.findSensorEndpoint();
    if (sensorUrl) {
      await this.submitSensorData(sensorUrl, sensorData, bmakCookie);
    }

    // Wait for validation
    await this.sleep(2000);

    // Check for success
    const cookies = await this.page.context().cookies();
    const abckCookie = cookies.find((c) => c.name === '_abck');

    if (abckCookie && abckCookie.value.length > 50) {
      return {
        token: abckCookie.value,
        solvedAt: new Date(),
        challengeLevel: AkamaiChallengeLevel.LEVEL_2,
        duration: Date.now() - solveStartTime,
        fingerprint: sensorData.fingerprint,
        bmakCookie,
      };
    }

    throw new Error('Level 2 challenge not solved');
  }

  /**
   * Solve Level 3 challenge (advanced challenges)
   */
  private async solveLevel3(
    detection: AkamaiDetectionResult,
    solveStartTime: number,
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<AkamaiChallengeResponse> {
    if (!this.config.enableLevel3) {
      throw new Error('Level 3 challenge solving is disabled');
    }

    // Level 3: Handle dynamic script obfuscation and anti-debugging
    // Disable anti-debugging
    await this.page.evaluate(() => {
      // Override debugger statement
      (window as any).__originalDebugger = window.eval;
      window.eval = function (code: string) {
        if (code.includes('debugger')) {
          return;
        }
        return (window as any).__originalDebugger(code);
      };
    });

    // Execute challenge with retries
    let challengeResult = null;
    for (let i = 0; i < 3; i++) {
      try {
        challengeResult = await this.page.evaluate(() => {
          const bmak = (window as any).bmak;
          if (bmak && typeof bmak.solve === 'function') {
            return bmak.solve();
          }
          return null;
        });
        if (challengeResult) break;
      } catch (e) {
        await this.sleep(500);
      }
    }

    // Submit sensor data
    const sensorUrl = await this.findSensorEndpoint();
    if (sensorUrl) {
      await this.submitSensorData(sensorUrl, sensorData, bmakCookie);
    }

    // Wait for validation
    await this.sleep(3000);

    // Check for success
    const cookies = await this.page.context().cookies();
    const abckCookie = cookies.find((c) => c.name === '_abck');

    if (abckCookie && abckCookie.value.length > 50) {
      return {
        token: abckCookie.value,
        solvedAt: new Date(),
        challengeLevel: AkamaiChallengeLevel.LEVEL_3,
        duration: Date.now() - solveStartTime,
        fingerprint: sensorData.fingerprint,
        bmakCookie,
      };
    }

    throw new Error('Level 3 challenge not solved');
  }

  /**
   * Find Akamai sensor endpoint
   */
  private async findSensorEndpoint(): Promise<string | null> {
    try {
      // Look for sensor endpoint in network requests or page scripts
      const endpoint = await this.page.evaluate(() => {
        // Check for sensor endpoint in scripts
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const text = script.textContent || '';
          const match = text.match(/https?:\/\/[^"'\s]+akam\.net[^"'\s]*sensor[^"'\s]*/i);
          if (match) {
            return match[0];
          }
        }
        return null;
      });

      return endpoint;
    } catch (error: any) {
      this.logger.warn(`Failed to find sensor endpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Submit sensor data to Akamai endpoint
   */
  private async submitSensorData(
    endpoint: string,
    sensorData: AkamaiSensorData,
    bmakCookie?: BmakCookie,
  ): Promise<void> {
    try {
      const payload: any = {
        sensor_data: sensorData,
      };

      if (bmakCookie) {
        payload.bmak = bmakCookie;
      }

      // Sign the request
      const signature = this.signRequest(payload, sensorData);

      // Submit via fetch
      await this.page.evaluate(
        async (args: { url: string; data: any; sig: string }) => {
          await fetch(args.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Akamai-Signature': args.sig,
              'User-Agent': navigator.userAgent,
              Referer: window.location.href,
            },
            body: JSON.stringify(args.data),
          });
        },
        { url: endpoint, data: payload, sig: signature },
      );

      this.logger.debug(`Submitted sensor data to ${endpoint}`);
    } catch (error: any) {
      this.logger.warn(`Failed to submit sensor data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Determine if an error should not trigger a retry
   */
  private shouldNotRetry(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';

    // Don't retry on widget not detected errors
    if (errorMessage.includes('not detected')) {
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
   * Update sensor generation metrics
   */
  private updateSensorMetrics(success: boolean, duration: number): void {
    if (success) {
      const totalAttempts = this.metrics.totalAttempts || 1;
      const currentSuccessRate = this.metrics.sensorGenerationSuccessRate || 0;
      this.metrics.sensorGenerationSuccessRate =
        currentSuccessRate * 0.9 + 1.0 * 0.1;

      if (this.metrics.averageSensorGenerationTime === 0) {
        this.metrics.averageSensorGenerationTime = duration;
      } else {
        this.metrics.averageSensorGenerationTime =
          this.metrics.averageSensorGenerationTime * 0.7 + duration * 0.3;
      }
    }
  }

  /**
   * Get solver metrics
   */
  getMetrics(): AkamaiSolverMetrics {
    return { ...this.metrics };
  }
}

