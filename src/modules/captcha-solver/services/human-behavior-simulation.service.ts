import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import {
  BehaviorSimulationConfig,
  BehaviorProfile,
  PROFILE_MULTIPLIERS,
  MouseMovementConfig,
  KeystrokeTimingConfig,
  ScrollBehaviorConfig,
  MicroMovementConfig,
  PauseConfig,
  AttentionSimulationConfig,
  BehavioralFingerprint,
  Point,
  BezierCurve,
} from './interfaces/behavior-simulation.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for simulating realistic human behavior patterns
 * to bypass behavioral analysis systems
 */
@Injectable()
export class HumanBehaviorSimulationService {
  private readonly logger = new Logger(HumanBehaviorSimulationService.name);

  /**
   * Active session fingerprints
   */
  private readonly fingerprints: Map<string, BehavioralFingerprint> = new Map();

  /**
   * Active micro-movement intervals
   */
  private readonly microMovementIntervals: Map<string, NodeJS.Timeout> =
    new Map();

  /**
   * Active attention simulation intervals
   */
  private readonly attentionIntervals: Map<string, NodeJS.Timeout> =
    new Map();

  /**
   * Generate a random number from a normal distribution
   */
  private normalRandom(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Clamp a value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Calculate a point on a Bezier curve at parameter t (0-1)
   */
  private bezierPoint(curve: BezierCurve, t: number): Point {
    const { start, control1, control2, end } = curve;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x:
        mt3 * start.x +
        3 * mt2 * t * control1.x +
        3 * mt * t2 * control2.x +
        t3 * end.x,
      y:
        mt3 * start.y +
        3 * mt2 * t * control1.y +
        3 * mt * t2 * control2.y +
        t3 * end.y,
    };
  }

  /**
   * Generate Bezier curve control points for natural mouse movement
   */
  private generateBezierCurve(
    start: Point,
    end: Point,
    deviation: number = 20,
  ): BezierCurve {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deviationPixels = (distance * deviation) / 100;

    // Generate random control points with deviation
    const angle = Math.atan2(dy, dx);
    const perpAngle = angle + Math.PI / 2;

    // Control point 1 (closer to start)
    const cp1Offset = distance * 0.3;
    const cp1Deviation =
      (Math.random() * 2 - 1) * deviationPixels * (0.5 + Math.random() * 0.5);
    const control1: Point = {
      x:
        start.x +
        Math.cos(angle) * cp1Offset +
        Math.cos(perpAngle) * cp1Deviation,
      y:
        start.y +
        Math.sin(angle) * cp1Offset +
        Math.sin(perpAngle) * cp1Deviation,
    };

    // Control point 2 (closer to end)
    const cp2Offset = distance * 0.7;
    const cp2Deviation =
      (Math.random() * 2 - 1) * deviationPixels * (0.5 + Math.random() * 0.5);
    const control2: Point = {
      x:
        start.x +
        Math.cos(angle) * cp2Offset +
        Math.cos(perpAngle) * cp2Deviation,
      y:
        start.y +
        Math.sin(angle) * cp2Offset +
        Math.sin(perpAngle) * cp2Deviation,
    };

    return {
      start,
      control1,
      control2,
      end,
    };
  }

  /**
   * Move mouse along a Bezier curve with jitter and micro-corrections
   */
  async moveMouseBezier(
    page: Page,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    config: MouseMovementConfig = {},
    sessionId?: string,
  ): Promise<void> {
    const {
      bezierDeviation = 20,
      jitterRange = 2,
      jitterInterval = 75,
      steps = 50,
    } = config;

    const start: Point = { x: startX, y: startY };
    const end: Point = { x: endX, y: endY };

    // Generate Bezier curve
    const curve = this.generateBezierCurve(start, end, bezierDeviation);

    // Calculate points along the curve
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let point = this.bezierPoint(curve, t);

      // Add jitter every few steps
      if (i % Math.floor(steps / 10) === 0 && i > 0 && i < steps) {
        const jitterX = (Math.random() * 2 - 1) * jitterRange;
        const jitterY = (Math.random() * 2 - 1) * jitterRange;
        point = {
          x: point.x + jitterX,
          y: point.y + jitterY,
        };
      }

      points.push(point);
    }

    // Move mouse along the curve
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      await page.mouse.move(point.x, point.y, { steps: 1 });

      // Add micro-delay with jitter interval
      if (i < points.length - 1) {
        const delay = jitterInterval + (Math.random() * 20 - 10);
        await page.waitForTimeout(Math.max(1, Math.floor(delay)));
      }
    }

    // Update fingerprint if session ID provided
    if (sessionId) {
      this.updateMouseFingerprint(sessionId, start, end, points);
    }
  }

  /**
   * Type text with realistic keystroke timing
   */
  async typeWithTiming(
    page: Page,
    text: string,
    config: KeystrokeTimingConfig = {},
    sessionId?: string,
  ): Promise<void> {
    const {
      keyPressMean = 100,
      keyPressStdDev = 25,
      interKeyMean = 200,
      interKeyStdDev = 50,
      thinkingPauseProbability = 0.1,
      thinkingPauseRange = [500, 2000],
    } = config;

    const timings: number[] = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Key press duration (keydown to keyup)
      const pressDuration = this.clamp(
        this.normalRandom(keyPressMean, keyPressStdDev),
        50,
        150,
      );

      await page.keyboard.down(char);
      await page.waitForTimeout(Math.floor(pressDuration));
      await page.keyboard.up(char);

      timings.push(pressDuration);

      // Inter-key delay (except for last character)
      if (i < text.length - 1) {
        const interKeyDelay = this.clamp(
          this.normalRandom(interKeyMean, interKeyStdDev),
          100,
          300,
        );
        await page.waitForTimeout(Math.floor(interKeyDelay));
        timings.push(interKeyDelay);
      }

      // Occasional thinking pause
      if (Math.random() < thinkingPauseProbability) {
        const pauseDuration =
          thinkingPauseRange[0] +
          Math.random() * (thinkingPauseRange[1] - thinkingPauseRange[0]);
        await page.waitForTimeout(Math.floor(pauseDuration));
        timings.push(pauseDuration);
      }
    }

    // Update fingerprint if session ID provided
    if (sessionId) {
      this.updateTypingFingerprint(sessionId, timings);
    }
  }

  /**
   * Scroll with momentum-based behavior
   */
  async scrollWithMomentum(
    page: Page,
    distance: number,
    config: ScrollBehaviorConfig = {},
    sessionId?: string,
  ): Promise<void> {
    const {
      minDistance = 100,
      maxDistance = 500,
      overshootProbability = 0.3,
      overshootCorrectionRange = [10, 50],
      scrollDuration = 500,
    } = config;

    // Clamp distance
    const clampedDistance = this.clamp(distance, minDistance, maxDistance);

    // Calculate scroll steps with easing
    const steps = 20;
    const stepDuration = scrollDuration / steps;
    const distances: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Ease-in-out function
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const stepDistance = eased * clampedDistance;
      const delta = i === 0 ? stepDistance : stepDistance - distances[i - 1];

      await page.mouse.wheel(0, delta);
      distances.push(stepDistance);

      await page.waitForTimeout(Math.floor(stepDuration));
    }

    // Overshoot and correction
    if (Math.random() < overshootProbability) {
      const overshoot =
        overshootCorrectionRange[0] +
        Math.random() *
          (overshootCorrectionRange[1] - overshootCorrectionRange[0]);
      await page.mouse.wheel(0, overshoot);
      await page.waitForTimeout(100);
      await page.mouse.wheel(0, -overshoot);
    }

    // Update fingerprint if session ID provided
    if (sessionId) {
      this.updateScrollFingerprint(sessionId, clampedDistance, distances);
    }
  }

  /**
   * Start micro-movements during idle periods
   */
  startMicroMovements(
    page: Page,
    sessionId: string,
    config: MicroMovementConfig = {},
  ): void {
    this.stopMicroMovements(sessionId);

    const {
      distanceRange = [5, 15],
      intervalRange = [2, 5],
    } = config;

    const interval = () => {
      const delay =
        intervalRange[0] +
        Math.random() * (intervalRange[1] - intervalRange[0]);
      const timeout = setTimeout(async () => {
        try {
          const currentPos = await page.evaluate(() => ({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          }));

          const distance =
            distanceRange[0] +
            Math.random() * (distanceRange[1] - distanceRange[0]);
          const angle = Math.random() * Math.PI * 2;

          const newX = currentPos.x + Math.cos(angle) * distance;
          const newY = currentPos.y + Math.sin(angle) * distance;

          await page.mouse.move(newX, newY, { steps: 3 });
        } catch (error) {
          this.logger.warn(
            `Micro-movement failed: ${error.message}`,
          );
        }

        interval();
      }, delay * 1000);

      this.microMovementIntervals.set(sessionId, timeout);
    };

    interval();
  }

  /**
   * Stop micro-movements for a session
   */
  stopMicroMovements(sessionId: string): void {
    const interval = this.microMovementIntervals.get(sessionId);
    if (interval) {
      clearTimeout(interval);
      this.microMovementIntervals.delete(sessionId);
    }
  }

  /**
   * Add a random pause
   */
  async randomPause(config: PauseConfig = {}): Promise<void> {
    const {
      minDuration = 1,
      maxDuration = 10,
      pauseProbability = 0.3,
    } = config;

    if (Math.random() < pauseProbability) {
      const duration =
        minDuration + Math.random() * (maxDuration - minDuration);
      await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    }
  }

  /**
   * Start attention simulation
   */
  startAttentionSimulation(
    page: Page,
    sessionId: string,
    config: AttentionSimulationConfig = {},
  ): void {
    this.stopAttentionSimulation(sessionId);

    const {
      focusChangeProbability = 0.2,
      tabSwitchProbability = 0.1,
      checkInterval = 30,
    } = config;

    const interval = setInterval(async () => {
      try {
        // Focus change
        if (Math.random() < focusChangeProbability) {
          const elements = await page.$$('input, textarea, button, a');
          if (elements.length > 0) {
            const randomElement =
              elements[Math.floor(Math.random() * elements.length)];
            await randomElement.focus();
            await page.waitForTimeout(100 + Math.random() * 200);
          }
        }

        // Tab switch simulation (using keyboard shortcut)
        if (Math.random() < tabSwitchProbability) {
          await page.keyboard.press('Control+Tab');
          await page.waitForTimeout(200 + Math.random() * 300);
          await page.keyboard.press('Control+Shift+Tab');
        }
      } catch (error) {
        this.logger.warn(
          `Attention simulation failed: ${error.message}`,
        );
      }
    }, checkInterval * 1000);

    this.attentionIntervals.set(sessionId, interval);
  }

  /**
   * Stop attention simulation for a session
   */
  stopAttentionSimulation(sessionId: string): void {
    const interval = this.attentionIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.attentionIntervals.delete(sessionId);
    }
  }

  /**
   * Create or get a behavioral fingerprint for a session
   */
  getOrCreateFingerprint(sessionId: string): BehavioralFingerprint {
    if (!this.fingerprints.has(sessionId)) {
      this.fingerprints.set(sessionId, {
        sessionId,
        mousePatterns: {
          averageSpeed: 0,
          averageCurvature: 0,
          movementCount: 0,
        },
        typingSpeed: {
          mean: 0,
          stdDev: 0,
          samples: [],
        },
        scrollProfile: {
          averageVelocity: 0,
          averageDistance: 0,
          overshootFrequency: 0,
        },
        pausePatterns: {
          mean: 0,
          stdDev: 0,
          samples: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return this.fingerprints.get(sessionId)!;
  }

  /**
   * Update mouse movement fingerprint
   */
  private updateMouseFingerprint(
    sessionId: string,
    start: Point,
    end: Point,
    points: Point[],
  ): void {
    const fingerprint = this.getOrCreateFingerprint(sessionId);

    // Calculate average speed
    const distance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2),
    );
    const time = points.length * 10; // Approximate time in ms
    const speed = distance / time;

    // Calculate curvature (deviation from straight line)
    let totalCurvature = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const straightDistance = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2),
      );
      const actualDistance =
        Math.sqrt(
          Math.pow(points[i].x - start.x, 2) +
            Math.pow(points[i].y - start.y, 2),
        ) +
        Math.sqrt(
          Math.pow(end.x - points[i].x, 2) +
            Math.pow(end.y - points[i].y, 2),
        );
      totalCurvature += actualDistance - straightDistance;
    }
    const averageCurvature = totalCurvature / (points.length - 2);

    // Update fingerprint
    const count = fingerprint.mousePatterns.movementCount;
    fingerprint.mousePatterns.averageSpeed =
      (fingerprint.mousePatterns.averageSpeed * count + speed) / (count + 1);
    fingerprint.mousePatterns.averageCurvature =
      (fingerprint.mousePatterns.averageCurvature * count + averageCurvature) /
      (count + 1);
    fingerprint.mousePatterns.movementCount++;
    fingerprint.updatedAt = new Date();
  }

  /**
   * Update typing speed fingerprint
   */
  private updateTypingFingerprint(
    sessionId: string,
    timings: number[],
  ): void {
    const fingerprint = this.getOrCreateFingerprint(sessionId);

    fingerprint.typingSpeed.samples.push(...timings);

    // Calculate mean and std dev
    const samples = fingerprint.typingSpeed.samples;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      samples.length;
    const stdDev = Math.sqrt(variance);

    fingerprint.typingSpeed.mean = mean;
    fingerprint.typingSpeed.stdDev = stdDev;
    fingerprint.updatedAt = new Date();
  }

  /**
   * Update scroll fingerprint
   */
  private updateScrollFingerprint(
    sessionId: string,
    distance: number,
    distances: number[],
  ): void {
    const fingerprint = this.getOrCreateFingerprint(sessionId);

    const velocity = distance / (distances.length * 25); // Approximate time

    fingerprint.scrollProfile.averageVelocity =
      (fingerprint.scrollProfile.averageVelocity +
        velocity) /
      2;
    fingerprint.scrollProfile.averageDistance =
      (fingerprint.scrollProfile.averageDistance + distance) / 2;
    fingerprint.updatedAt = new Date();
  }

  /**
   * Initialize behavior simulation for a page
   */
  async initialize(
    page: Page,
    config: BehaviorSimulationConfig = {},
  ): Promise<string> {
    const sessionId = uuidv4();
    const profile = config.profile || BehaviorProfile.NORMAL;
    const multipliers = PROFILE_MULTIPLIERS[profile];

    // Apply profile multipliers to configs
    const mouseConfig: MouseMovementConfig = {
      bezierDeviation: 20,
      jitterRange: 2,
      jitterInterval: 75 * multipliers.movementSpeed,
      steps: 50,
    };

    const keystrokeConfig: KeystrokeTimingConfig = {
      keyPressMean: 100 * multipliers.timing,
      keyPressStdDev: 25,
      interKeyMean: 200 * multipliers.timing,
      interKeyStdDev: 50,
      thinkingPauseProbability: 0.1 * multipliers.pauseFrequency,
      thinkingPauseRange: [500, 2000],
    };

    const scrollConfig: ScrollBehaviorConfig = {
      minDistance: 100,
      maxDistance: 500,
      overshootProbability: 0.3,
      overshootCorrectionRange: [10, 50],
      scrollDuration: 500 * multipliers.timing,
    };

    const microMovementConfig: MicroMovementConfig = {
      distanceRange: [5, 15],
      intervalRange: [2, 5],
    };

    const pauseConfig: PauseConfig = {
      minDuration: 1,
      maxDuration: 10,
      pauseProbability: 0.3 * multipliers.pauseFrequency,
    };

    const attentionConfig: AttentionSimulationConfig = {
      focusChangeProbability: 0.2 * multipliers.attentionFrequency,
      tabSwitchProbability: 0.1 * multipliers.attentionFrequency,
      checkInterval: 30,
    };

    // Start micro-movements if enabled
    if (config.enableMicroMovements !== false) {
      this.startMicroMovements(page, sessionId, microMovementConfig);
    }

    // Start attention simulation if enabled
    if (config.enableAttentionSimulation !== false) {
      this.startAttentionSimulation(page, sessionId, attentionConfig);
    }

    // Store configs for later use
    (page as any).__behaviorConfig = {
      sessionId,
      profile,
      mouseConfig,
      keystrokeConfig,
      scrollConfig,
      pauseConfig,
      attentionConfig,
      config,
    };

    this.logger.debug(`Behavior simulation initialized for session ${sessionId}`);

    return sessionId;
  }

  /**
   * Cleanup behavior simulation for a session
   */
  cleanup(sessionId: string): void {
    this.stopMicroMovements(sessionId);
    this.stopAttentionSimulation(sessionId);
    this.fingerprints.delete(sessionId);
    this.logger.debug(`Behavior simulation cleaned up for session ${sessionId}`);
  }

  /**
   * Get behavioral fingerprint for a session
   */
  getFingerprint(sessionId: string): BehavioralFingerprint | undefined {
    return this.fingerprints.get(sessionId);
  }
}

