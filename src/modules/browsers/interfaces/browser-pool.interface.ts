import { Browser, BrowserType } from 'playwright';

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

