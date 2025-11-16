import { Injectable, Logger } from '@nestjs/common';
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

/**
 * Service for detecting various anti-bot systems on web pages
 * Supports: Cloudflare, DataDome, Akamai, Imperva, reCAPTCHA, hCAPTCHA
 */
@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(
    private readonly confidenceScoring: ConfidenceScoringService,
  ) {}

  /**
   * Detect all anti-bot systems on a page
   */
  async detectAll(
    page: Page,
    config?: DetectionConfig,
  ): Promise<MultiDetectionResult> {
    const startTime = Date.now();
    const detections: AntiBotDetectionResult[] = [];

    // Get detection context
    const context = await this.getDetectionContext(page);

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
        );
      }
    }

    // Sort by confidence (highest first)
    detections.sort((a, b) => b.confidence - a.confidence);

    return {
      detections,
      primary: detections.length > 0 ? detections[0] : null,
      totalDurationMs: Date.now() - startTime,
      analyzedAt: new Date(),
    };
  }

  /**
   * Detect a specific anti-bot system
   */
  private async detectSystem(
    page: Page,
    systemType: AntiBotSystemType,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const startTime = Date.now();

    try {
      let result: AntiBotDetectionResult;

      switch (systemType) {
        case AntiBotSystemType.CLOUDFLARE:
          result = await this.detectCloudflare(page, context);
          break;
        case AntiBotSystemType.DATADOME:
          result = await this.detectDataDome(page, context);
          break;
        case AntiBotSystemType.AKAMAI:
          result = await this.detectAkamai(page, context);
          break;
        case AntiBotSystemType.IMPERVA:
          result = await this.detectImperva(page, context);
          break;
        case AntiBotSystemType.RECAPTCHA:
          result = await this.detectReCaptcha(page, context);
          break;
        case AntiBotSystemType.HCAPTCHA:
          result = await this.detectHCaptcha(page, context);
          break;
        default:
          result = this.createNoDetectionResult();
      }

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      return this.createErrorResult(systemType, error, Date.now() - startTime);
    }
  }

  /**
   * Detect Cloudflare anti-bot systems
   * Checks for: Turnstile, Challenge Page, Bot Management
   */
  private async detectCloudflare(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    // Check for Cloudflare-specific elements and scripts
    const cloudflareData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.CLOUDFLARE,
    );

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
   */
  private async detectDataDome(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    const datadomeData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.DATADOME,
    );

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
   */
  private async detectAkamai(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    const akamaiData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.AKAMAI,
    );

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
   */
  private async detectImperva(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    const impervaData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.IMPERVA,
    );

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
   */
  private async detectReCaptcha(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    const recaptchaData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.RECAPTCHA,
    );

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
   */
  private async detectHCaptcha(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    const hcaptchaData = await page.evaluate(() => {
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
    const confidence = this.confidenceScoring.calculateConfidence(
      signals,
      AntiBotSystemType.HCAPTCHA,
    );

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
      const url = page.url();
      const title = await page.title().catch(() => undefined);
      
      // Get cookies
      const cookies = await page.context().cookies().catch(() => []);

      return {
        url,
        title,
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
        })),
      };
    } catch (error) {
      this.logger.warn(`Failed to get detection context: ${error.message}`);
      return {
        url: page.url(),
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
  ): AntiBotDetectionResult {
    const detectionError: DetectionError = {
      code: error.code || 'DETECTION_ERROR',
      message: error.message || 'Unknown error during detection',
      stack: error.stack,
    };

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
