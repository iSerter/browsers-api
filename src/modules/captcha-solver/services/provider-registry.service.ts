import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ICaptchaSolver } from '../interfaces/captcha-solver.interface';
import { TwoCaptchaProvider } from '../providers/two-captcha.provider';
import { AntiCaptchaProvider } from '../providers/anti-captcha.provider';
import { CapMonsterProvider } from '../providers/capmonster.provider';
import { ApiKeyManagerService } from './api-key-manager.service';
import { CostTrackingService } from './cost-tracking.service';
import { CaptchaSolverConfigService } from '../config';

/**
 * Provider registry for managing captcha solver providers
 */
@Injectable()
export class ProviderRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers: Map<string, ICaptchaSolver> = new Map();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly apiKeyManager: ApiKeyManagerService,
    private readonly costTracking: CostTrackingService,
    private readonly captchaConfig: CaptchaSolverConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Provider Registry...');

    // Register 2Captcha provider
    try {
      const twoCaptcha = new TwoCaptchaProvider(
        this.httpService,
        this.configService,
        this.apiKeyManager,
        this.captchaConfig,
      );
      this.registerProvider('2captcha', twoCaptcha);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to register 2Captcha provider: ${errorMessage}`);
    }

    // Register Anti-Captcha provider
    try {
      const antiCaptcha = new AntiCaptchaProvider(
        this.httpService,
        this.configService,
        this.apiKeyManager,
        this.captchaConfig,
      );
      this.registerProvider('anticaptcha', antiCaptcha);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to register Anti-Captcha provider: ${errorMessage}`);
    }

    // Register CapMonster provider
    try {
      const capMonster = new CapMonsterProvider(
        this.httpService,
        this.configService,
        this.apiKeyManager,
        this.captchaConfig,
      );
      this.registerProvider('capmonster', capMonster);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to register CapMonster provider: ${errorMessage}`);
    }

    this.logger.log(
      `Provider Registry initialized with ${this.providers.size} provider(s)`,
    );
  }

  /**
   * Register a provider
   */
  registerProvider(name: string, provider: ICaptchaSolver): void {
    this.providers.set(name.toLowerCase(), provider);
    this.logger.log(`Registered provider: ${name}`);
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): ICaptchaSolver | null {
    return this.providers.get(name.toLowerCase()) || null;
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): ICaptchaSolver[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get available providers (with valid API keys)
   */
  async getAvailableProviders(): Promise<ICaptchaSolver[]> {
    const available: ICaptchaSolver[] = [];

    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        available.push(provider);
      }
    }

    return available;
  }

  /**
   * Get provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get cost tracking service
   */
  getCostTracking(): CostTrackingService {
    return this.costTracking;
  }
}

