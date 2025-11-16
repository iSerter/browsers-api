import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Page } from 'playwright';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  DetectionSignal,
  SignalStrength,
  AntiBotSystemDetails,
  DetectionError,
  DetectionConfig,
  MultiDetectionResult,
  DetectionContext,
} from '../interfaces';
import { ConfidenceScoringService } from './confidence-scoring.service';
import { DetectionRegistryService } from './detection-registry.service';
import { DetectionServiceAdapter } from './detection-service-adapter';
import { IDetectionStrategy } from './detection-strategy.interface';
import { CaptchaLoggingService } from './captcha-logging.service';

/**
 * Service for detecting various anti-bot systems on web pages
 * Supports: Cloudflare, DataDome, Akamai, Imperva, reCAPTCHA, hCAPTCHA
 * 
 * Uses a registry pattern for extensibility - new anti-bot systems can be
 * added by registering their detection strategies.
 */
@Injectable()
export class DetectionService implements OnModuleInit {
  private readonly logger = new Logger(DetectionService.name);

  constructor(
    private readonly confidenceScoring: ConfidenceScoringService,
    private readonly registry: DetectionRegistryService,
    private readonly captchaLogging: CaptchaLoggingService,
  ) {}

  /**
   * Initialize the service and register built-in detection strategies
   */
  onModuleInit() {
    this.registerBuiltInStrategies();
  }

  /**
   * Register built-in detection strategies
   * This allows the existing detection methods to be used via the registry
   */
  private registerBuiltInStrategies(): void {
    const strategies = [
      new DetectionServiceAdapter(
        AntiBotSystemType.CLOUDFLARE,
        (page, context) => this.detectCloudflare(page, context),
        'cloudflare-detection',
      ),
      new DetectionServiceAdapter(
        AntiBotSystemType.DATADOME,
        (page, context) => this.detectDataDome(page, context),
        'datadome-detection',
      ),
      new DetectionServiceAdapter(
        AntiBotSystemType.AKAMAI,
        (page, context) => this.detectAkamai(page, context),
        'akamai-detection',
      ),
      new DetectionServiceAdapter(
        AntiBotSystemType.IMPERVA,
        (page, context) => this.detectImperva(page, context),
        'imperva-detection',
      ),
      new DetectionServiceAdapter(
        AntiBotSystemType.RECAPTCHA,
        (page, context) => this.detectReCaptcha(page, context),
        'recaptcha-detection',
      ),
      new DetectionServiceAdapter(
        AntiBotSystemType.HCAPTCHA,
        (page, context) => this.detectHCaptcha(page, context),
        'hcaptcha-detection',
      ),
    ];

    this.registry.registerAll(strategies);
    this.logger.log(
      `Registered ${strategies.length} built-in detection strategies`,
    );
  }

  /**
   * Register a custom detection strategy
   * 
   * This allows external code to register new anti-bot detection strategies
   * without modifying the core DetectionService.
   * 
   * @param strategy - The detection strategy to register
   * @example
   * ```typescript
   * const customStrategy = new MyCustomDetectionStrategy();
   * detectionService.registerStrategy(customStrategy);
   * ```
   */
  registerStrategy(strategy: IDetectionStrategy): void {
    this.registry.register(strategy);
    this.logger.log(
      `Registered custom detection strategy: ${strategy.getName()} for ${strategy.systemType}`,
    );
  }

  /**
   * Get the detection registry service
   * Useful for advanced use cases that need direct registry access
   */
  getRegistry(): DetectionRegistryService {
    return this.registry;
  }

  /**
   * Detect all anti-bot systems on a page
   */
  async detectAll(
    page: Page,
    config?: DetectionConfig,
  ): Promise<MultiDetectionResult> {
    const startTime = Date.now();
    const detections: AntiBotDetectionResult[] = [];

    // Validate page object
    if (!page) {
      this.logger.error('Page object is null or undefined');
      return {
        detections: [],
        primary: null,
        totalDurationMs: Date.now() - startTime,
        analyzedAt: new Date(),
      };
    }

    // Get detection context
    let context: DetectionContext;
    try {
      context = await this.getDetectionContext(page);
    } catch (error) {
      this.logger.error(
        `Failed to get detection context: ${error.message}`,
        { error: error.stack },
      );
      return {
        detections: [],
        primary: null,
        totalDurationMs: Date.now() - startTime,
        analyzedAt: new Date(),
      };
    }

    // Determine which systems to check
    const targetSystems =
      config?.targetSystems || Object.values(AntiBotSystemType);

    // Run all detections
    for (const systemType of targetSystems) {
      if (systemType === AntiBotSystemType.UNKNOWN) continue;

      try {
        const result = await this.detectSystem(page, systemType, context);
        
        // Apply minimum confidence filter if configured
        if (!config?.minConfidence || result.confidence >= config.minConfidence) {
          detections.push(result);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to detect ${systemType}: ${error.message}`,
          {
            systemType,
            url: context.url,
            error: error.stack,
          },
        );
        // Add error result to detections for visibility
        const errorResult = this.createErrorResult(
          systemType,
          error,
          0,
          { url: context.url },
        );
        detections.push(errorResult);
      }
    }

    // Sort by confidence (highest first)
    detections.sort((a, b) => b.confidence - a.confidence);

    const result = {
      detections,
      primary: detections.length > 0 ? detections[0] : null,
      totalDurationMs: Date.now() - startTime,
      analyzedAt: new Date(),
    };

    // Log detection results
    if (result.primary) {
      this.captchaLogging.logDetection(
        result.primary,
        result.totalDurationMs,
        context.url,
      );
    } else if (detections.length > 0) {
      // Log all detections if no primary
      for (const detection of detections) {
        this.captchaLogging.logDetection(
          detection,
          detection.durationMs || 0,
          context.url,
        );
      }
    } else {
      // Log "no detection" result
      const noDetectionResult: AntiBotDetectionResult = {
        detected: false,
        type: null,
        confidence: 0,
        details: {},
        detectedAt: new Date(),
        durationMs: result.totalDurationMs,
      };
      this.captchaLogging.logDetection(
        noDetectionResult,
        result.totalDurationMs,
        context.url,
      );
    }

    return result;
  }

  /**
   * Detect a specific anti-bot system
   * Uses the registry to find a strategy, falls back to built-in methods
   */
  private async detectSystem(
    page: Page,
    systemType: AntiBotSystemType,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const startTime = Date.now();

    try {
      let result: AntiBotDetectionResult;

      // Try to get strategy from registry first
      const strategy = this.registry.get(systemType);
      if (strategy) {
        result = await strategy.detect(page, context);
      } else {
        // Fallback to built-in methods for backward compatibility
        this.logger.debug(
          `No strategy registered for ${systemType}, using built-in method`,
        );
        result = await this.detectSystemFallback(page, systemType, context);
      }

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      return this.createErrorResult(
        systemType,
        error,
        Date.now() - startTime,
        { url: context.url },
      );
    }
  }

  /**
   * Fallback detection method using built-in switch statement
   * Used when no strategy is registered for a system type
   */
  private async detectSystemFallback(
    page: Page,
    systemType: AntiBotSystemType,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    switch (systemType) {
      case AntiBotSystemType.CLOUDFLARE:
        return this.detectCloudflare(page, context);
      case AntiBotSystemType.DATADOME:
        return this.detectDataDome(page, context);
      case AntiBotSystemType.AKAMAI:
        return this.detectAkamai(page, context);
      case AntiBotSystemType.IMPERVA:
        return this.detectImperva(page, context);
      case AntiBotSystemType.RECAPTCHA:
        return this.detectReCaptcha(page, context);
      case AntiBotSystemType.HCAPTCHA:
        return this.detectHCaptcha(page, context);
      default:
        return this.createNoDetectionResult();
    }
  }

  /**
   * Detect Cloudflare anti-bot systems
   * Checks for: Turnstile, Challenge Page, Bot Management
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectCloudflare(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    // Check for Cloudflare-specific elements and scripts
    let cloudflareData: any;
    try {
      cloudflareData = await page.evaluate(() => {
      const data = {
        hasChallengeForm: false,
        hasTurnstile: false,
        hasCfRay: false,
        hasInterstitial: false,
        challengeTitle: '',
        cfRayId: '',
        scripts: [] as string[],
      };

      // Check for challenge form
      const challengeForm = document.querySelector(
        '#challenge-form, #cf-challenge-form, .cf-browser-verification',
      );
      data.hasChallengeForm = !!challengeForm;

      // Check for Turnstile widget
      const turnstile = document.querySelector(
        '[class*="cf-turnstile"], [id*="cf-turnstile"]',
      );
      data.hasTurnstile = !!turnstile;

      // Check for interstitial page
      const interstitial = document.querySelector('.cf-error-details, #cf-wrapper');
      data.hasInterstitial = !!interstitial;

      // Get page title
      data.challengeTitle = document.title;

      // Check for cf-ray meta tag or header
      const cfRayMeta = document.querySelector('meta[name="cf-ray"]');
      if (cfRayMeta) {
        data.cfRayId = cfRayMeta.getAttribute('content') || '';
      }

      // Check for Cloudflare scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts
        .map((s) => s.getAttribute('src'))
        .filter((src) => src && (src.includes('cloudflare') || src.includes('cf-')))
        .filter((src): src is string => src !== null);

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for Cloudflare detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure to continue with cookie/header checks
      cloudflareData = {
        hasChallengeForm: false,
        hasTurnstile: false,
        hasCfRay: false,
        hasInterstitial: false,
        challengeTitle: '',
        cfRayId: '',
        scripts: [],
      };
    }

    // Check cookies for Cloudflare markers
    const cfCookies = context.cookies?.filter((c) =>
      c.name.startsWith('__cf') || c.name.startsWith('cf_'),
    ) || [];

    // Check headers for Cloudflare
    const hasCfRayHeader = context.headers?.['cf-ray'] !== undefined;
    const hasCloudflareServer = context.headers?.['server']?.toLowerCase().includes('cloudflare');

    // Build signals
    if (cloudflareData.hasChallengeForm) {
      signals.push({
        type: 'dom-element',
        name: 'challenge-form',
        strength: SignalStrength.STRONG,
        context: { title: cloudflareData.challengeTitle },
      });
    }

    if (cloudflareData.hasTurnstile) {
      signals.push({
        type: 'dom-element',
        name: 'turnstile-widget',
        strength: SignalStrength.STRONG,
      });
    }

    if (cloudflareData.hasInterstitial) {
      signals.push({
        type: 'dom-element',
        name: 'interstitial-page',
        strength: SignalStrength.STRONG,
      });
    }

    if (cfCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'cloudflare-cookies',
        strength: SignalStrength.MODERATE,
        context: { count: cfCookies.length, names: cfCookies.map((c) => c.name) },
      });
    }

    if (hasCfRayHeader || cloudflareData.cfRayId) {
      signals.push({
        type: 'header',
        name: 'cf-ray',
        strength: SignalStrength.MODERATE,
        context: { rayId: cloudflareData.cfRayId || context.headers?.['cf-ray'] },
      });
    }

    if (hasCloudflareServer) {
      signals.push({
        type: 'header',
        name: 'cloudflare-server',
        strength: SignalStrength.WEAK,
      });
    }

    if (cloudflareData.scripts.length > 0) {
      signals.push({
        type: 'script',
        name: 'cloudflare-scripts',
        strength: SignalStrength.MODERATE,
        context: { scripts: cloudflareData.scripts },
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.CLOUDFLARE,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for Cloudflare: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      // Default to 0 confidence on scoring error
      confidence = 0;
    }

    // Determine challenge type
    let challengeType = 'unknown';
    if (cloudflareData.hasTurnstile) challengeType = 'turnstile';
    else if (cloudflareData.hasChallengeForm) challengeType = 'challenge-page';
    else if (cloudflareData.hasInterstitial) challengeType = 'interstitial';

    return {
      detected,
      type: detected ? AntiBotSystemType.CLOUDFLARE : null,
      confidence,
      details: {
        challengeType,
        signals,
        metadata: {
          title: cloudflareData.challengeTitle,
          cfRayId: cloudflareData.cfRayId || context.headers?.['cf-ray'],
        },
      },
      detectedAt: new Date(),
      durationMs: 0, // Will be set by caller
    };
  }

  /**
   * Detect DataDome anti-bot system
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectDataDome(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    let datadomeData: any;
    try {
      datadomeData = await page.evaluate(() => {
      const data = {
        hasCaptchaDiv: false,
        hasDataDomeScript: false,
        hasDataDomeTag: false,
        scripts: [] as string[],
      };

      // Check for DataDome captcha container
      const captchaDiv = document.querySelector(
        '#datadome, [id*="datadome"], .datadome',
      );
      data.hasCaptchaDiv = !!captchaDiv;

      // Check for DataDome scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts
        .map((s) => s.getAttribute('src'))
        .filter((src) => src && src.includes('datadome'))
        .filter((src): src is string => src !== null);
      
      data.hasDataDomeScript = data.scripts.length > 0;

      // Check for DataDome tags/attributes
      const ddTags = document.querySelectorAll('[data-dd], [dd-]');
      data.hasDataDomeTag = ddTags.length > 0;

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for DataDome detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure to continue with cookie checks
      datadomeData = {
        hasCaptchaDiv: false,
        hasDataDomeScript: false,
        hasDataDomeTag: false,
        scripts: [],
      };
    }

    // Check for DataDome cookies
    const ddCookies = context.cookies?.filter((c) =>
      c.name.toLowerCase().includes('datadome'),
    ) || [];

    // Build signals
    if (datadomeData.hasCaptchaDiv) {
      signals.push({
        type: 'dom-element',
        name: 'datadome-captcha',
        strength: SignalStrength.STRONG,
      });
    }

    if (datadomeData.hasDataDomeScript) {
      signals.push({
        type: 'script',
        name: 'datadome-js',
        strength: SignalStrength.STRONG,
        context: { scripts: datadomeData.scripts },
      });
    }

    if (ddCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'datadome-cookie',
        strength: SignalStrength.MODERATE,
        context: { cookies: ddCookies.map((c) => c.name) },
      });
    }

    if (datadomeData.hasDataDomeTag) {
      signals.push({
        type: 'dom-element',
        name: 'datadome-attributes',
        strength: SignalStrength.MODERATE,
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.DATADOME,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for DataDome: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      confidence = 0;
    }

    return {
      detected,
      type: detected ? AntiBotSystemType.DATADOME : null,
      confidence,
      details: { signals },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Detect Akamai Bot Manager
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectAkamai(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    let akamaiData: any;
    try {
      akamaiData = await page.evaluate(() => {
      const data = {
        hasSensorScript: false,
        hasBmScript: false,
        hasBmpScript: false,
        scripts: [] as string[],
      };

      // Check for Akamai sensor scripts
      const scripts = Array.from(document.querySelectorAll('script'));
      
      for (const script of scripts) {
        const src = script.getAttribute('src') || '';
        const content = script.textContent || '';
        
        if (src.includes('akam') || content.includes('akam')) {
          data.hasSensorScript = true;
        }
        
        if (src.includes('/bm.') || content.includes('_bmak')) {
          data.hasBmScript = true;
        }

        if (src.includes('/bmp.') || content.includes('_bmp')) {
          data.hasBmpScript = true;
        }

        if (src && (src.includes('akam') || src.includes('/bm') || src.includes('/bmp'))) {
          data.scripts.push(src);
        }
      }

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for Akamai detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure to continue with cookie checks
      akamaiData = {
        hasSensorScript: false,
        hasBmScript: false,
        hasBmpScript: false,
        scripts: [],
      };
    }

    // Check for Akamai cookies
    const akamCookies = context.cookies?.filter((c) =>
      c.name.includes('_abck') || c.name.includes('bm_') || c.name.includes('ak_'),
    ) || [];

    // Build signals
    if (akamaiData.hasSensorScript) {
      signals.push({
        type: 'script',
        name: 'akamai-sensor',
        strength: SignalStrength.STRONG,
        context: { scripts: akamaiData.scripts },
      });
    }

    if (akamaiData.hasBmScript) {
      signals.push({
        type: 'script',
        name: 'akamai-bot-manager',
        strength: SignalStrength.STRONG,
      });
    }

    if (akamaiData.hasBmpScript) {
      signals.push({
        type: 'script',
        name: 'akamai-bmp',
        strength: SignalStrength.MODERATE,
      });
    }

    if (akamCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'akamai-cookies',
        strength: SignalStrength.MODERATE,
        context: { cookies: akamCookies.map((c) => c.name) },
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.AKAMAI,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for Akamai: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      confidence = 0;
    }

    return {
      detected,
      type: detected ? AntiBotSystemType.AKAMAI : null,
      confidence,
      details: { signals },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Detect Imperva (Incapsula)
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectImperva(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    let impervaData: any;
    try {
      impervaData = await page.evaluate(() => {
      const data = {
        hasIncapScript: false,
        hasImpervaElement: false,
        scripts: [] as string[],
      };

      // Check for Incapsula/Imperva scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts
        .map((s) => s.getAttribute('src'))
        .filter((src) => 
          src && (src.includes('incap') || src.includes('imperva'))
        )
        .filter((src): src is string => src !== null);
      
      data.hasIncapScript = data.scripts.length > 0;

      // Check for Imperva elements
      const impervaEl = document.querySelector(
        '[id*="incap"], [class*="incap"], [id*="imperva"]',
      );
      data.hasImpervaElement = !!impervaEl;

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for Imperva detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure to continue with cookie/header checks
      impervaData = {
        hasIncapScript: false,
        hasImpervaElement: false,
        scripts: [],
      };
    }

    // Check for Imperva cookies
    const impervaCookies = context.cookies?.filter((c) =>
      c.name.includes('incap_') || c.name.includes('visid_incap'),
    ) || [];

    // Check headers
    const hasImpervaHeader = context.headers?.['x-cdn']?.toLowerCase().includes('incapsula');

    // Build signals
    if (impervaData.hasIncapScript) {
      signals.push({
        type: 'script',
        name: 'imperva-script',
        strength: SignalStrength.STRONG,
        context: { scripts: impervaData.scripts },
      });
    }

    if (impervaData.hasImpervaElement) {
      signals.push({
        type: 'dom-element',
        name: 'imperva-element',
        strength: SignalStrength.MODERATE,
      });
    }

    if (impervaCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'imperva-cookies',
        strength: SignalStrength.MODERATE,
        context: { cookies: impervaCookies.map((c) => c.name) },
      });
    }

    if (hasImpervaHeader) {
      signals.push({
        type: 'header',
        name: 'imperva-cdn',
        strength: SignalStrength.WEAK,
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.IMPERVA,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for Imperva: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      confidence = 0;
    }

    return {
      detected,
      type: detected ? AntiBotSystemType.IMPERVA : null,
      confidence,
      details: { signals },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Detect Google reCAPTCHA
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectReCaptcha(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    let recaptchaData: any;
    try {
      recaptchaData = await page.evaluate(() => {
      const data = {
        hasRecaptchaDiv: false,
        hasRecaptchaScript: false,
        hasRecaptchaFrame: false,
        version: '',
        sitekey: '',
        scripts: [] as string[],
      };

      // Check for reCAPTCHA div
      const recaptchaDiv = document.querySelector(
        '.g-recaptcha, [class*="g-recaptcha"], #g-recaptcha',
      );
      data.hasRecaptchaDiv = !!recaptchaDiv;
      
      if (recaptchaDiv) {
        data.sitekey = recaptchaDiv.getAttribute('data-sitekey') || '';
      }

      // Check for reCAPTCHA scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts
        .map((s) => s.getAttribute('src'))
        .filter((src) => 
          src && (src.includes('google.com/recaptcha') || src.includes('gstatic.com/recaptcha'))
        )
        .filter((src): src is string => src !== null);
      
      data.hasRecaptchaScript = data.scripts.length > 0;

      // Check for reCAPTCHA iframes
      const frames = document.querySelectorAll('iframe[src*="recaptcha"]');
      data.hasRecaptchaFrame = frames.length > 0;

      // Determine version
      if (data.scripts.some((s) => s.includes('/api.js'))) {
        data.version = 'v2';
      } else if (data.scripts.some((s) => s.includes('render='))) {
        data.version = 'v3';
      }

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for reCAPTCHA detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure
      recaptchaData = {
        hasRecaptchaDiv: false,
        hasRecaptchaScript: false,
        hasRecaptchaFrame: false,
        version: '',
        sitekey: '',
        scripts: [],
      };
    }

    // Build signals
    if (recaptchaData.hasRecaptchaDiv) {
      signals.push({
        type: 'dom-element',
        name: 'recaptcha-widget',
        strength: SignalStrength.STRONG,
        context: { sitekey: recaptchaData.sitekey },
      });
    }

    if (recaptchaData.hasRecaptchaScript) {
      signals.push({
        type: 'script',
        name: 'recaptcha-api',
        strength: SignalStrength.STRONG,
        context: { 
          scripts: recaptchaData.scripts,
          version: recaptchaData.version,
        },
      });
    }

    if (recaptchaData.hasRecaptchaFrame) {
      signals.push({
        type: 'dom-element',
        name: 'recaptcha-iframe',
        strength: SignalStrength.MODERATE,
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.RECAPTCHA,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for reCAPTCHA: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      confidence = 0;
    }

    return {
      detected,
      type: detected ? AntiBotSystemType.RECAPTCHA : null,
      confidence,
      details: {
        version: recaptchaData.version || undefined,
        signals,
        metadata: {
          sitekey: recaptchaData.sitekey,
        },
      },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Detect hCaptcha
   * 
   * @protected - Can be used by strategy adapters
   */
  protected async detectHCaptcha(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    let hcaptchaData: any;
    try {
      hcaptchaData = await page.evaluate(() => {
      const data = {
        hasHcaptchaDiv: false,
        hasHcaptchaScript: false,
        hasHcaptchaFrame: false,
        sitekey: '',
        scripts: [] as string[],
      };

      // Check for hCaptcha div
      const hcaptchaDiv = document.querySelector(
        '.h-captcha, [class*="h-captcha"], #h-captcha',
      );
      data.hasHcaptchaDiv = !!hcaptchaDiv;
      
      if (hcaptchaDiv) {
        data.sitekey = hcaptchaDiv.getAttribute('data-sitekey') || '';
      }

      // Check for hCaptcha scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      data.scripts = scripts
        .map((s) => s.getAttribute('src'))
        .filter((src) => src && src.includes('hcaptcha'))
        .filter((src): src is string => src !== null);
      
      data.hasHcaptchaScript = data.scripts.length > 0;

      // Check for hCaptcha iframes
      const frames = document.querySelectorAll('iframe[src*="hcaptcha"]');
      data.hasHcaptchaFrame = frames.length > 0;

      return data;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate page for hCaptcha detection: ${error.message}`,
        {
          url: context.url,
          error: error.stack,
        },
      );
      // Return empty data structure
      hcaptchaData = {
        hasHcaptchaDiv: false,
        hasHcaptchaScript: false,
        hasHcaptchaFrame: false,
        sitekey: '',
        scripts: [],
      };
    }

    // Build signals
    if (hcaptchaData.hasHcaptchaDiv) {
      signals.push({
        type: 'dom-element',
        name: 'hcaptcha-widget',
        strength: SignalStrength.STRONG,
        context: { sitekey: hcaptchaData.sitekey },
      });
    }

    if (hcaptchaData.hasHcaptchaScript) {
      signals.push({
        type: 'script',
        name: 'hcaptcha-api',
        strength: SignalStrength.STRONG,
        context: { scripts: hcaptchaData.scripts },
      });
    }

    if (hcaptchaData.hasHcaptchaFrame) {
      signals.push({
        type: 'dom-element',
        name: 'hcaptcha-iframe',
        strength: SignalStrength.MODERATE,
      });
    }

    const detected = signals.length > 0;
    let confidence = 0;
    try {
      confidence = this.confidenceScoring.calculateConfidence(
        signals,
        AntiBotSystemType.HCAPTCHA,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for hCaptcha: ${error.message}`,
        { url: context.url, error: error.stack },
      );
      confidence = 0;
    }

    return {
      detected,
      type: detected ? AntiBotSystemType.HCAPTCHA : null,
      confidence,
      details: {
        signals,
        metadata: {
          sitekey: hcaptchaData.sitekey,
        },
      },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Get detection context from the page
   */
  private async getDetectionContext(page: Page): Promise<DetectionContext> {
    try {
      if (!page) {
        throw new Error('Page object is null or undefined');
      }

      const url = page.url();
      let title: string | undefined;
      let cookies: any[] = [];

      try {
        title = await page.title();
      } catch (error) {
        this.logger.debug(
          `Failed to get page title: ${error.message}`,
          { url },
        );
      }
      
      // Get cookies with error handling
      try {
        const context = page.context();
        if (context) {
          cookies = await context.cookies();
        }
      } catch (error) {
        this.logger.debug(
          `Failed to get cookies: ${error.message}`,
          { url },
        );
      }

      return {
        url,
        title,
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
        })),
        // Headers are not easily accessible from an already-loaded page
        // They would need to be captured during initial navigation
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get detection context: ${error.message}`,
        {
          url: page?.url() || 'unknown',
          error: error.stack,
        },
      );
      return {
        url: page?.url() || 'unknown',
      };
    }
  }

  /**
   * Create a "not detected" result
   */
  private createNoDetectionResult(): AntiBotDetectionResult {
    return {
      detected: false,
      type: null,
      confidence: 0,
      details: { signals: [] },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    systemType: AntiBotSystemType,
    error: any,
    durationMs: number,
    context?: Record<string, any>,
  ): AntiBotDetectionResult {
    const detectionError: DetectionError = {
      code: error.code || error.name || 'DETECTION_ERROR',
      message: error.message || 'Unknown error during detection',
      stack: error.stack,
      context: {
        systemType,
        ...context,
      },
    };

    this.logger.error(
      `Detection error for ${systemType}: ${error.message}`,
      {
        systemType,
        errorCode: detectionError.code,
        context: detectionError.context,
        stack: error.stack,
      },
    );

    return {
      detected: false,
      type: null,
      confidence: 0,
      details: { signals: [] },
      error: detectionError,
      detectedAt: new Date(),
      durationMs,
    };
  }
}
