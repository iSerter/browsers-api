## Anti-Bot Detection & Captcha Solver Guide for Playwright

## Key Features
### 1. Detection Methods

- Cloudflare: Detects challenge pages, ray IDs, and challenge forms
- DataDome: Identifies captcha containers and cookies
- Akamai Bot Manager: Detects sensor scripts and bmak objects
- Imperva/Incapsula: Checks for specific cookies and scripts
- reCAPTCHA/hCAPTCHA: Standard captcha detection

### 2. Solving Strategies
- Cloudflare: Waits for automatic challenge completion (usually 5-10 seconds)
- DataDome & Captchas: Integrates with captcha solving services (2Captcha, Anti-Captcha, etc.)
### 3. Stealth Configuration

- Removes navigator.webdriver flag
Mocks plugins and Chrome runtime
Sets realistic headers and viewport
Adds human-like mouse movements


## Sample Code

```
import { Page, BrowserContext } from 'playwright';

/**
 * Anti-Bot Detection Handler
 * Provides methods to detect and handle various anti-bot systems
 */

export interface AntiBotDetection {
  detected: boolean;
  type: 'cloudflare' | 'datadome' | 'akamai' | 'imperva' | 'recaptcha' | 'hcaptcha' | 'unknown' | null;
  confidence: number;
}

export class AntiBotHandler {
  
  /**
   * Detect if an anti-bot system is present on the page
   */
  static async detectAntiBotBlock(page: Page): Promise<AntiBotDetection> {
    const detections = await Promise.all([
      this.detectCloudflare(page),
      this.detectDataDome(page),
      this.detectAkamai(page),
      this.detectImperva(page),
      this.detectRecaptcha(page),
      this.detectHCaptcha(page),
    ]);

    const detected = detections.find(d => d.detected);
    return detected || { detected: false, type: null, confidence: 0 };
  }

  /**
   * Attempt to solve detected anti-bot challenge
   */
  static async solveAntiBotBlock(
    page: Page, 
    detection: AntiBotDetection,
    options?: { captchaSolver?: CaptchaSolver }
  ): Promise<boolean> {
    if (!detection.detected) return true;

    switch (detection.type) {
      case 'cloudflare':
        return await this.solveCloudflare(page);
      case 'datadome':
        return await this.solveDataDome(page, options?.captchaSolver);
      case 'recaptcha':
      case 'hcaptcha':
        return await this.solveCaptcha(page, detection.type, options?.captchaSolver);
      default:
        console.warn(`No solver available for ${detection.type}`);
        return false;
    }
  }

  // ==================== DETECTION METHODS ====================

  private static async detectCloudflare(page: Page): Promise<AntiBotDetection> {
    try {
      const indicators = await page.evaluate(() => {
        const checks = {
          title: document.title.includes('Just a moment'),
          challengeForm: !!document.querySelector('#challenge-form'),
          cfRay: !!document.querySelector('.ray-id'),
          cfScript: !!document.querySelector('script[src*="cloudflare"]'),
          cfChallenge: !!window.__CF$cv$params,
        };
        return checks;
      });

      const score = Object.values(indicators).filter(Boolean).length;
      
      return {
        detected: score >= 2,
        type: 'cloudflare',
        confidence: score / 5,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  private static async detectDataDome(page: Page): Promise<AntiBotDetection> {
    try {
      const indicators = await page.evaluate(() => {
        const checks = {
          captcha: !!document.querySelector('.datadome-container'),
          cookie: document.cookie.includes('datadome'),
          script: !!document.querySelector('script[src*="datadome"]'),
          blocked: document.body?.textContent?.includes('DataDome'),
        };
        return checks;
      });

      const score = Object.values(indicators).filter(Boolean).length;
      
      return {
        detected: score >= 1,
        type: 'datadome',
        confidence: score / 4,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  private static async detectAkamai(page: Page): Promise<AntiBotDetection> {
    try {
      const indicators = await page.evaluate(() => {
        const checks = {
          sensor: !!document.querySelector('script[src*="akam"]'),
          bmak: !!(window as any)._bmak,
          cookie: document.cookie.includes('bm_'),
          challenge: document.body?.textContent?.includes('Akamai'),
        };
        return checks;
      });

      const score = Object.values(indicators).filter(Boolean).length;
      
      return {
        detected: score >= 2,
        type: 'akamai',
        confidence: score / 4,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  private static async detectImperva(page: Page): Promise<AntiBotDetection> {
    try {
      const indicators = await page.evaluate(() => {
        const checks = {
          incapsula: document.body?.textContent?.includes('Incapsula') || 
                      document.body?.textContent?.includes('Imperva'),
          cookie: document.cookie.includes('incap_ses') || 
                  document.cookie.includes('visid_incap'),
          script: !!document.querySelector('script[src*="incapsula"]'),
        };
        return checks;
      });

      const score = Object.values(indicators).filter(Boolean).length;
      
      return {
        detected: score >= 1,
        type: 'imperva',
        confidence: score / 3,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  private static async detectRecaptcha(page: Page): Promise<AntiBotDetection> {
    try {
      const has = await page.evaluate(() => {
        return !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"]');
      });

      return {
        detected: has,
        type: 'recaptcha',
        confidence: has ? 1 : 0,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  private static async detectHCaptcha(page: Page): Promise<AntiBotDetection> {
    try {
      const has = await page.evaluate(() => {
        return !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]');
      });

      return {
        detected: has,
        type: 'hcaptcha',
        confidence: has ? 1 : 0,
      };
    } catch {
      return { detected: false, type: null, confidence: 0 };
    }
  }

  // ==================== SOLVING METHODS ====================

  private static async solveCloudflare(page: Page): Promise<boolean> {
    try {
      console.log('Waiting for Cloudflare challenge to complete...');
      
      // Wait for the challenge to complete (up to 30 seconds)
      await page.waitForFunction(() => {
        return !document.title.includes('Just a moment') &&
               !document.querySelector('#challenge-form');
      }, { timeout: 30000 });

      // Additional wait for navigation
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      return true;
    } catch (error) {
      console.error('Failed to solve Cloudflare challenge:', error);
      return false;
    }
  }

  private static async solveDataDome(page: Page, solver?: CaptchaSolver): Promise<boolean> {
    try {
      // Check if captcha is present
      const hasCaptcha = await page.evaluate(() => {
        return !!document.querySelector('.datadome-container');
      });

      if (!hasCaptcha) return true;

      if (!solver) {
        console.warn('DataDome captcha detected but no solver provided');
        return false;
      }

      // Extract captcha details and solve
      const captchaData = await page.evaluate(() => {
        const container = document.querySelector('.datadome-container');
        return {
          sitekey: container?.getAttribute('data-sitekey'),
          url: window.location.href,
        };
      });

      const solution = await solver.solve({
        type: 'datadome',
        ...captchaData,
      });

      // Submit solution
      await page.evaluate((token) => {
        (window as any).dataDomeCallback?.(token);
      }, solution.token);

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      return true;
    } catch (error) {
      console.error('Failed to solve DataDome:', error);
      return false;
    }
  }

  private static async solveCaptcha(
    page: Page, 
    type: 'recaptcha' | 'hcaptcha',
    solver?: CaptchaSolver
  ): Promise<boolean> {
    if (!solver) {
      console.warn(`${type} detected but no solver provided`);
      return false;
    }

    try {
      const captchaData = await page.evaluate((captchaType) => {
        const selector = captchaType === 'recaptcha' ? '.g-recaptcha' : '.h-captcha';
        const element = document.querySelector(selector);
        return {
          sitekey: element?.getAttribute('data-sitekey'),
          url: window.location.href,
        };
      }, type);

      const solution = await solver.solve({
        type,
        ...captchaData,
      });

      // Inject solution
      await page.evaluate(({ token, captchaType }) => {
        const callback = captchaType === 'recaptcha' 
          ? (window as any).grecaptcha?.getResponse
          : (window as any).hcaptcha?.getResponse;
        
        if (callback) {
          const textarea = document.querySelector(`[name="${captchaType === 'recaptcha' ? 'g-recaptcha-response' : 'h-captcha-response'}"]`) as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = token;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }, { token: solution.token, captchaType: type });

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      return true;
    } catch (error) {
      console.error(`Failed to solve ${type}:`, error);
      return false;
    }
  }

  // ==================== STEALTH CONFIGURATION ====================

  /**
   * Configure browser context with stealth settings
   */
  static async setupStealthContext(context: BrowserContext): Promise<void> {
    // Add stealth scripts to all pages
    await context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Chrome runtime
      (window as any).chrome = {
        runtime: {},
      };

      // Permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters)
      );
    });
  }

  /**
   * Configure page with additional stealth measures
   */
  static async setupStealthPage(page: Page): Promise<void> {
    // Set realistic viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Set user agent
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Add random mouse movements
    await page.mouse.move(Math.random() * 100, Math.random() * 100);
  }
}

// ==================== CAPTCHA SOLVER INTERFACE ====================

export interface CaptchaSolver {
  solve(params: CaptchaParams): Promise<CaptchaSolution>;
}

export interface CaptchaParams {
  type: 'recaptcha' | 'hcaptcha' | 'datadome';
  sitekey?: string;
  url: string;
}

export interface CaptchaSolution {
  token: string;
}

/**
 * Example implementation using 2Captcha service
 */
export class TwoCaptchaSolver implements CaptchaSolver {
  constructor(private apiKey: string) {}

  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    // This is a simplified example - implement actual API calls
    console.log('Solving captcha with 2Captcha:', params);
    
    // You would make HTTP requests to 2Captcha API here
    // 1. Submit captcha task
    // 2. Poll for solution
    // 3. Return token
    
    throw new Error('Implement 2Captcha API integration');
  }
}

// ==================== USAGE EXAMPLE ====================

export async function exampleUsage(page: Page) {
  // Setup stealth mode
  await AntiBotHandler.setupStealthPage(page);
  
  // Navigate to target
  await page.goto('https://example.com');
  
  // Detect anti-bot systems
  const detection = await AntiBotHandler.detectAntiBotBlock(page);
  
  if (detection.detected) {
    console.log(`Detected: ${detection.type} (confidence: ${detection.confidence})`);
    
    // Attempt to solve
    const solver = new TwoCaptchaSolver('YOUR_API_KEY');
    const solved = await AntiBotHandler.solveAntiBotBlock(page, detection, { captchaSolver: solver });
    
    if (solved) {
      console.log('Successfully bypassed anti-bot protection');
    } else {
      console.log('Failed to bypass anti-bot protection');
    }
  }
  
  // Continue with automation
  await page.waitForLoadState('networkidle');
}
```