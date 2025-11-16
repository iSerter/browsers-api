import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';
import {
  AntiBotDetectionResult,
  AntiBotSystemType,
  DetectionContext,
  DetectionSignal,
  SignalStrength,
} from '../../interfaces';
import { BaseDetectionStrategy } from '../base-detection-strategy';
import { ConfidenceScoringService } from '../confidence-scoring.service';

/**
 * Detection strategy for Cloudflare anti-bot systems
 * Detects: Turnstile, Challenge Page, Bot Management
 */
@Injectable()
export class CloudflareDetectionStrategy extends BaseDetectionStrategy {
  readonly systemType = AntiBotSystemType.CLOUDFLARE;

  constructor(confidenceScoring: ConfidenceScoringService) {
    super(confidenceScoring);
  }

  getName(): string {
    return 'cloudflare-detection-strategy';
  }

  async detect(
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
        const interstitial = document.querySelector(
          '.cf-error-details, #cf-wrapper',
        );
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
          .filter(
            (src) => src && (src.includes('cloudflare') || src.includes('cf-')),
          )
          .filter((src): src is string => src !== null);

        return data;
      });
    } catch (error) {
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
    const cfCookies =
      context.cookies?.filter(
        (c) => c.name.startsWith('__cf') || c.name.startsWith('cf_'),
      ) || [];

    // Check headers for Cloudflare
    const hasCfRayHeader = context.headers?.['cf-ray'] !== undefined;
    const hasCloudflareServer = context.headers?.['server']
      ?.toLowerCase()
      .includes('cloudflare');

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
        context: {
          count: cfCookies.length,
          names: cfCookies.map((c) => c.name),
        },
      });
    }

    if (hasCfRayHeader || cloudflareData.cfRayId) {
      signals.push({
        type: 'header',
        name: 'cf-ray',
        strength: SignalStrength.MODERATE,
        context: {
          rayId: cloudflareData.cfRayId || context.headers?.['cf-ray'],
        },
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

    // Determine challenge type
    let challengeType = 'unknown';
    if (cloudflareData.hasTurnstile) challengeType = 'turnstile';
    else if (cloudflareData.hasChallengeForm)
      challengeType = 'challenge-page';
    else if (cloudflareData.hasInterstitial) challengeType = 'interstitial';

    return this.createDetectionResult(signals, {
      challengeType,
      metadata: {
        title: cloudflareData.challengeTitle,
        cfRayId: cloudflareData.cfRayId || context.headers?.['cf-ray'],
      },
    });
  }
}

