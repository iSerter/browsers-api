import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import {
  chromium,
  firefox,
  webkit,
  Browser,
          LaunchOptions as LaunchOptionsType,
} from 'playwright';
import {
  BrowserPoolConfig,
  BrowserTypeConfig,
  IBrowserPool,
  PoolStats,
  ViewportPreset,
} from '../interfaces/browser-pool.interface';

@Injectable()
export class BrowserPoolService implements IBrowserPool, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private readonly pools: Map<string, BrowserPool> = new Map();
  private readonly config: BrowserPoolConfig = {
    minSize: 2,
    maxSize: 10,
    idleTimeout: 300000, // 5 minutes
  };

  private cleanupInterval: NodeJS.Timeout;
  private readonly cleanupIntervalMs = 60000; // Check every minute

  private readonly browserConfigs: Map<string, BrowserTypeConfig> = new Map([
    [
      'chromium',
      {
        type: 'chromium',
        launchOptions: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-domain-reliability',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-sync',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-pings',
            '--use-mock-keychain',
          ],
        },
      },
    ],
    [
      'firefox',
      {
        type: 'firefox',
        launchOptions: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      },
    ],
    [
      'webkit',
      {
        type: 'webkit',
        launchOptions: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      },
    ],
  ]);

  onModuleInit() {
    this.logger.log('BrowserPoolService initialized');
    this.startCleanupInterval();
  }

  onModuleDestroy() {
    this.logger.log('Shutting down BrowserPoolService');
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    return this.cleanup();
  }

  async acquire(browserType: string): Promise<Browser> {
    const pool = this.getOrCreatePool(browserType);
    return pool.acquire();
  }

  async release(browser: Browser, browserType: string): Promise<void> {
    const pool = this.pools.get(browserType);
    if (!pool) {
      this.logger.warn(`No pool found for browser type: ${browserType}`);
      return;
    }
    return pool.release(browser);
  }

  async cleanup(): Promise<void> {
    this.logger.log('Cleaning up all browser pools');
    const cleanupPromises = Array.from(this.pools.values()).map((pool) =>
      pool.cleanup(),
    );
    await Promise.all(cleanupPromises);
    this.pools.clear();
  }

  getStats(browserType: string): PoolStats {
    const pool = this.pools.get(browserType);
    if (!pool) {
      return { availableCount: 0, activeCount: 0, totalCount: 0 };
    }
    return pool.getStats();
  }

  getViewportConfig(preset: ViewportPreset) {
    const configs = {
      [ViewportPreset.DESKTOP]: { width: 1920, height: 1080 },
      [ViewportPreset.MOBILE_IPHONE]: { width: 375, height: 667 },
      [ViewportPreset.MOBILE_ANDROID]: { width: 412, height: 915 },
    };
    return configs[preset];
  }

  private getOrCreatePool(browserType: string): BrowserPool {
    let pool = this.pools.get(browserType);
    if (!pool) {
      const config = this.browserConfigs.get(browserType);
      if (!config) {
        throw new Error(`Unsupported browser type: ${browserType}`);
      }
      pool = new BrowserPool(
        browserType,
        config,
        this.config,
        this.logger,
      );
      this.pools.set(browserType, pool);
      this.logger.log(
        `Created browser pool for ${browserType} (minSize: ${this.config.minSize}, maxSize: ${this.config.maxSize})`,
      );
    }
    return pool;
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.logger.debug('Running periodic cleanup');
      Array.from(this.pools.values()).forEach((pool) =>
        pool.closeIdleBrowsers(),
      );
    }, this.cleanupIntervalMs);
  }
}

class BrowserPool {
  private readonly availableInstances: Browser[] = [];
  private readonly activeInstances: Set<Browser> = new Set();
  private readonly idleTimers: Map<Browser, NodeJS.Timeout> = new Map();

  constructor(
    private readonly browserType: string,
    private readonly browserConfig: BrowserTypeConfig,
    private readonly config: BrowserPoolConfig,
    private readonly logger: Logger,
  ) {
    this.initializePool();
  }

  async acquire(): Promise<Browser> {
    // Check for available browser
    if (this.availableInstances.length > 0) {
      const browser = this.availableInstances.shift();
      if (!browser) {
        throw new Error('Failed to acquire browser from pool');
      }
      this.activeInstances.add(browser);
      this.clearIdleTimer(browser);
      return browser;
    }

    // Create new browser if under max size
    const totalInstances = this.availableInstances.length + this.activeInstances.size;
    if (totalInstances < this.config.maxSize) {
      const browser = await this.createBrowser();
      this.activeInstances.add(browser);
      this.logger.debug(
        `Created new ${this.browserType} browser (total: ${totalInstances + 1})`,
      );
      return browser;
    }

    // Wait for available browser
    this.logger.debug(
      `Pool at max capacity (${this.config.maxSize}), waiting for available browser`,
    );
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.availableInstances.length > 0) {
          clearInterval(checkInterval);
          const browser = this.availableInstances.shift();
          if (!browser) {
            clearInterval(checkInterval);
            return;
          }
          this.activeInstances.add(browser);
          this.clearIdleTimer(browser);
          resolve(browser);
        }
      }, 100);
    });
  }

  async release(browser: Browser): Promise<void> {
    if (!this.activeInstances.has(browser)) {
      this.logger.warn('Attempted to release browser not in active instances');
      return;
    }

    this.activeInstances.delete(browser);

    // Check if browser is still connected
    if (!browser.isConnected()) {
      this.logger.warn('Released browser is no longer connected, skipping');
      return;
    }

    this.availableInstances.push(browser);
    this.startIdleTimer(browser);

    this.logger.debug(
      `Released ${this.browserType} browser (available: ${this.availableInstances.length}, active: ${this.activeInstances.size})`,
    );
  }

  async cleanup(): Promise<void> {
    this.logger.log(`Cleaning up browser pool for ${this.browserType}`);

    // Clear all timers
    this.idleTimers.forEach((timer) => clearTimeout(timer));
    this.idleTimers.clear();

    // Close all browsers
    const allBrowsers = [...this.availableInstances, ...Array.from(this.activeInstances)];
    await Promise.all(
      allBrowsers.map(async (browser) => {
        try {
          if (browser.isConnected()) {
            await browser.close();
          }
        } catch (error) {
          this.logger.error(`Error closing browser: ${error.message}`);
        }
      }),
    );

    this.availableInstances.length = 0;
    this.activeInstances.clear();
  }

  getStats(): PoolStats {
    return {
      availableCount: this.availableInstances.length,
      activeCount: this.activeInstances.size,
      totalCount: this.availableInstances.length + this.activeInstances.size,
    };
  }

  closeIdleBrowsers(): void {
    const now = Date.now();
    let closedCount = 0;

    for (const browser of this.availableInstances) {
      const timer = this.idleTimers.get(browser);
      if (timer) {
        // Check if timer has been running for longer than idleTimeout
        const idleStartTime = (timer as any)._idleStart || now;
        const idleDuration = now - idleStartTime;

        if (idleDuration > this.config.idleTimeout) {
          this.closeBrowser(browser);
          this.removeFromAvailable(browser);
          closedCount++;
        }
      }
    }

    if (closedCount > 0) {
      this.logger.log(`Closed ${closedCount} idle ${this.browserType} browsers`);
    }
  }

  private async initializePool(): Promise<void> {
    for (let i = 0; i < this.config.minSize; i++) {
      const browser = await this.createBrowser();
      this.availableInstances.push(browser);
      this.startIdleTimer(browser);
    }
    this.logger.log(
      `Initialized ${this.browserType} pool with ${this.config.minSize} browsers`,
    );
  }

  private async createBrowser(): Promise<Browser> {
    try {
      const launchOptions: LaunchOptionsType = {
        headless: this.browserConfig.launchOptions.headless,
        args: this.browserConfig.launchOptions.args,
      };

      let browser: Browser;
      switch (this.browserConfig.type) {
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          throw new Error(`Unknown browser type: ${this.browserConfig.type}`);
      }

      return browser;
    } catch (error) {
      this.logger.error(
        `Failed to create ${this.browserType} browser: ${error.message}`,
      );
      throw error;
    }
  }

  private startIdleTimer(browser: Browser): void {
    this.clearIdleTimer(browser);

    const timer = setTimeout(async () => {
      this.logger.debug(
        `Idle timeout for ${this.browserType} browser, closing`,
      );
      await this.closeBrowser(browser);
      this.removeFromAvailable(browser);
    }, this.config.idleTimeout);

    (timer as any)._idleStart = Date.now();
    this.idleTimers.set(browser, timer);
  }

  private clearIdleTimer(browser: Browser): void {
    const timer = this.idleTimers.get(browser);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(browser);
    }
  }

  private async closeBrowser(browser: Browser): Promise<void> {
    try {
      if (browser.isConnected()) {
        await browser.close();
      }
    } catch (error) {
      this.logger.error(`Error closing browser: ${error.message}`);
    }
  }

  private removeFromAvailable(browser: Browser): void {
    const index = this.availableInstances.indexOf(browser);
    if (index > -1) {
      this.availableInstances.splice(index, 1);
    }
  }
}

