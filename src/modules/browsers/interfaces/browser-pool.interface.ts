import { Browser, BrowserType } from 'playwright';
import { StealthConfig } from './stealth.interface';

export enum ViewportPreset {
  DESKTOP = 'desktop',
  MOBILE_IPHONE = 'mobile-iphone',
  MOBILE_ANDROID = 'mobile-android',
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface BrowserPoolConfig {
  minSize: number;
  maxSize: number;
  idleTimeout: number;
}

export interface CreateContextOptions {
  viewport?: ViewportConfig;
  userAgent?: string;
  timeout?: number;
  ignoreHTTPSErrors?: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /**
   * Stealth configuration for anti-bot detection evasion
   * If not provided, stealth will be enabled with default settings
   */
  stealth?: StealthConfig | boolean;
  /**
   * Timezone ID for the context (e.g., 'America/New_York')
   * Should match stealth timezone if stealth is enabled
   */
  timezoneId?: string;
  /**
   * Locale for the context (e.g., 'en-US')
   * Should match stealth locale if stealth is enabled
   */
  locale?: string;
}

export interface IBrowserPool {
  acquire(browserType: string): Promise<Browser>;
  release(browser: Browser, browserType: string): Promise<void>;
  cleanup(): Promise<void>;
  getStats(browserType: string): PoolStats;
}

export interface PoolStats {
  availableCount: number;
  activeCount: number;
  totalCount: number;
}

export interface BrowserTypeConfig {
  type: 'chromium' | 'firefox' | 'webkit';
  launchOptions: {
    headless: boolean;
    args: string[];
  };
}
