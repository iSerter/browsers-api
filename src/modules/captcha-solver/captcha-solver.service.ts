import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { BrowserPoolService } from '../browsers/services/browser-pool.service';

@Injectable()
export class CaptchaSolverService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaSolverService.name);
  private readonly apiKeys: Map<string, string[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CaptchaSolverConfig)
    private readonly configRepository: Repository<CaptchaSolverConfig>,
    private readonly browserPoolService: BrowserPoolService,
  ) {}

  /**
   * Initialize the captcha solver service
   * Load API keys and validate configuration on startup
   */
  async onModuleInit() {
    this.logger.log('Initializing Captcha Solver Service...');
    await this.loadApiKeys();
    await this.validateApiKeys();
    this.logger.log('Captcha Solver Service initialized successfully');
  }

  /**
   * Load API keys from environment variables
   */
  private async loadApiKeys() {
    const providers = ['2captcha', 'anticaptcha'];
    
    for (const provider of providers) {
      // Support both naming conventions: 2CAPTCHA_API_KEY and TWOCAPTCHA_API_KEY
      const envKeys: string[] = [
        `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
      ];
      
      // Add Docker-compatible env key for 2captcha
      if (provider === '2captcha') {
        envKeys.push('TWOCAPTCHA_API_KEY');
      }
      
      let apiKey: string | undefined;
      for (const envKey of envKeys) {
        apiKey = this.configService.get<string>(envKey);
        if (apiKey) break;
      }
      
      if (apiKey) {
        // Support multiple keys separated by comma for rotation
        const keys = apiKey.split(',').map(k => k.trim()).filter(k => k);
        this.apiKeys.set(provider, keys);
        this.logger.log(`Loaded ${keys.length} API key(s) for ${provider}`);
      } else {
        this.logger.warn(`No API key found for ${provider}`);
      }
    }
  }

  /**
   * Validate API keys by making test requests
   */
  private async validateApiKeys() {
    for (const [provider, keys] of this.apiKeys.entries()) {
      for (const key of keys) {
        try {
          const isValid = await this.testApiKey(provider, key);
          if (isValid) {
            this.logger.log(`API key validated for ${provider}`);
          } else {
            this.logger.warn(`API key validation failed for ${provider}`);
          }
        } catch (error) {
          this.logger.error(`Error validating API key for ${provider}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Test an API key by making a test request to the provider
   */
  private async testApiKey(provider: string, apiKey: string): Promise<boolean> {
    // TODO: Implement actual API key validation for each provider
    // For now, just check if the key exists and has minimum length
    return !!(apiKey && apiKey.length > 10);
  }

  /**
   * Get an API key for a specific provider
   * Implements simple rotation if multiple keys are available
   */
  getApiKey(provider: string): string | null {
    const keys = this.apiKeys.get(provider);
    if (!keys || keys.length === 0) {
      return null;
    }
    
    // Simple round-robin rotation
    const key = keys[0];
    keys.push(keys.shift()!);
    
    return key;
  }

  /**
   * Check if a provider is available (has API key configured)
   */
  isProviderAvailable(provider: string): boolean {
    const keys = this.apiKeys.get(provider);
    return keys !== undefined && keys.length > 0;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.apiKeys.keys()).filter(provider => 
      this.isProviderAvailable(provider)
    );
  }

  /**
   * Get or create configuration for a specific setting
   */
  async getConfig(key: string): Promise<CaptchaSolverConfig | null> {
    return this.configRepository.findOne({ where: { key } });
  }

  /**
   * Update or create configuration
   */
  async setConfig(key: string, value: string): Promise<CaptchaSolverConfig> {
    let config = await this.configRepository.findOne({ where: { key } });
    
    if (config) {
      config.value = value;
      config.updatedAt = new Date();
    } else {
      config = this.configRepository.create({ key, value });
    }
    
    return this.configRepository.save(config);
  }

  /**
   * Get all configuration settings
   */
  async getAllConfigs(): Promise<CaptchaSolverConfig[]> {
    return this.configRepository.find();
  }
}
