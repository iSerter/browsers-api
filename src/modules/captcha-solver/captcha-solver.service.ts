import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { BrowserPoolService } from '../browsers/services/browser-pool.service';
import { ApiKeyManagerService } from './services/api-key-manager.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { CaptchaSolverConfiguration } from './interfaces/captcha-config.interface';
import {
  CaptchaParams,
  CaptchaSolution,
} from './interfaces/captcha-solver.interface';

@Injectable()
export class CaptchaSolverService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaSolverService.name);
  private configuration: CaptchaSolverConfiguration = {};

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CaptchaSolverConfig)
    private readonly configRepository: Repository<CaptchaSolverConfig>,
    private readonly browserPoolService: BrowserPoolService,
    private readonly apiKeyManager: ApiKeyManagerService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly costTracking: CostTrackingService,
  ) {}

  /**
   * Initialize the captcha solver service
   * Validate configuration and ensure at least one provider is available
   */
  async onModuleInit() {
    this.logger.log('Initializing Captcha Solver Service...');
    
    try {
      await this.loadConfiguration();
      await this.validateConfiguration();
      this.logger.log('Captcha Solver Service initialized successfully');
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize Captcha Solver Service: ${error.message}`,
      );
      // Don't throw - allow app to start but log the error
      // In production, you might want to throw to prevent startup
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  /**
   * Load configuration from environment variables and database
   */
  private async loadConfiguration() {
    // Load from environment variables with defaults
    this.configuration = {
      preferredProvider:
        this.configService.get<string>('CAPTCHA_SOLVER_PREFERRED_PROVIDER') ||
        '2captcha',
      timeoutSeconds:
        this.configService.get<number>('CAPTCHA_SOLVER_TIMEOUT_SECONDS') || 60,
      maxRetries:
        this.configService.get<number>('CAPTCHA_SOLVER_MAX_RETRIES') || 3,
      enableAutoRetry:
        this.configService.get<boolean>('CAPTCHA_SOLVER_ENABLE_AUTO_RETRY') !==
        false,
      minConfidenceScore:
        this.configService.get<number>(
          'CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE',
        ) || 0.7,
      fallbackEnabled: {
        recaptcha:
          this.configService.get<boolean>(
            'CAPTCHA_SOLVER_FALLBACK_RECAPTCHA',
          ) !== false,
        hcaptcha:
          this.configService.get<boolean>(
            'CAPTCHA_SOLVER_FALLBACK_HCAPTCHA',
          ) !== false,
        datadome:
          this.configService.get<boolean>(
            'CAPTCHA_SOLVER_FALLBACK_DATADOME',
          ) !== false,
        funcaptcha:
          this.configService.get<boolean>(
            'CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA',
          ) !== false,
      },
    };

    // Override with database values if they exist
    const dbConfigs = await this.configRepository.find();
    for (const config of dbConfigs) {
      switch (config.key) {
        case 'preferred_provider':
          this.configuration.preferredProvider = config.value;
          break;
        case 'timeout_seconds':
          this.configuration.timeoutSeconds = parseInt(config.value, 10);
          break;
        case 'max_retries':
          this.configuration.maxRetries = parseInt(config.value, 10);
          break;
        case 'enable_auto_retry':
          this.configuration.enableAutoRetry = config.value === 'true';
          break;
        case 'min_confidence_score':
          this.configuration.minConfidenceScore = parseFloat(config.value);
          break;
        case 'fallback_enabled_recaptcha':
          if (!this.configuration.fallbackEnabled) {
            this.configuration.fallbackEnabled = {};
          }
          this.configuration.fallbackEnabled.recaptcha = config.value === 'true';
          break;
        case 'fallback_enabled_hcaptcha':
          if (!this.configuration.fallbackEnabled) {
            this.configuration.fallbackEnabled = {};
          }
          this.configuration.fallbackEnabled.hcaptcha = config.value === 'true';
          break;
        case 'fallback_enabled_datadome':
          if (!this.configuration.fallbackEnabled) {
            this.configuration.fallbackEnabled = {};
          }
          this.configuration.fallbackEnabled.datadome = config.value === 'true';
          break;
        case 'fallback_enabled_funcaptcha':
          if (!this.configuration.fallbackEnabled) {
            this.configuration.fallbackEnabled = {};
          }
          this.configuration.fallbackEnabled.funcaptcha = config.value === 'true';
          break;
      }
    }

    this.logger.debug(
      `Loaded configuration: ${JSON.stringify(this.configuration)}`,
    );
  }

  /**
   * Validate configuration and ensure at least one provider is available
   */
  private async validateConfiguration() {
    // Validate preferred provider
    if (
      this.configuration.preferredProvider &&
      !['2captcha', 'anticaptcha'].includes(
        this.configuration.preferredProvider,
      )
    ) {
      throw new BadRequestException(
        `Invalid preferred provider: ${this.configuration.preferredProvider}. Must be '2captcha' or 'anticaptcha'`,
      );
    }

    // Check if preferred provider is available
    if (this.configuration.preferredProvider) {
      const isAvailable = this.apiKeyManager.isProviderAvailable(
        this.configuration.preferredProvider,
      );
      if (!isAvailable) {
        this.logger.warn(
          `Preferred provider ${this.configuration.preferredProvider} is not available`,
        );
      }
    }

    // Ensure at least one provider is available
    const availableProviders = this.apiKeyManager.getAvailableProviders();
    if (availableProviders.length === 0) {
      const error = new Error(
        'No captcha solver providers are available. Please configure at least one API key.',
      );
      this.logger.error(error.message);
      throw error;
    }

    this.logger.log(
      `Available providers: ${availableProviders.join(', ')}`,
    );
  }

  /**
   * Get an API key for a specific provider
   * Uses the API key manager for rotation and health tracking
   */
  getApiKey(provider: string): string | null {
    return this.apiKeyManager.getApiKey(provider);
  }

  /**
   * Record successful API key usage
   */
  async recordApiKeySuccess(provider: string, apiKey: string): Promise<void> {
    await this.apiKeyManager.recordSuccess(provider, apiKey);
  }

  /**
   * Record failed API key usage
   */
  async recordApiKeyFailure(
    provider: string,
    apiKey: string,
    error?: string,
  ): Promise<void> {
    await this.apiKeyManager.recordFailure(provider, apiKey, error);
  }

  /**
   * Check if a provider is available (has healthy API keys)
   */
  isProviderAvailable(provider: string): boolean {
    return this.apiKeyManager.isProviderAvailable(provider);
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return this.apiKeyManager.getAvailableProviders();
  }

  /**
   * Get current configuration
   */
  getConfiguration(): CaptchaSolverConfiguration {
    return { ...this.configuration };
  }

  /**
   * Get or create configuration for a specific setting
   */
  async getConfig(key: string): Promise<CaptchaSolverConfig | null> {
    return this.configRepository.findOne({ where: { key } });
  }

  /**
   * Get all configuration settings
   */
  async getAllConfigs(): Promise<CaptchaSolverConfig[]> {
    return this.configRepository.find();
  }

  /**
   * Get configuration value by key
   */
  async getConfigValue(key: string): Promise<string | null> {
    const config = await this.configRepository.findOne({ where: { key } });
    return config?.value || null;
  }

  /**
   * Solve a captcha using 3rd party providers as fallback
   * This should be called when built-in solvers fail
   */
  async solveWithFallback(params: CaptchaParams): Promise<CaptchaSolution> {
    // Check if fallback is enabled for this challenge type
    const challengeType = params.type;
    const fallbackEnabled =
      this.configuration.fallbackEnabled?.[challengeType] !== false;

    if (!fallbackEnabled) {
      throw new Error(
        `Fallback is disabled for ${challengeType} challenge type`,
      );
    }

    // Get available providers
    const availableProviders = await this.providerRegistry.getAvailableProviders();
    if (availableProviders.length === 0) {
      throw new Error('No captcha solver providers are available');
    }

    // Try preferred provider first, then others
    const preferredProviderName = this.configuration.preferredProvider;
    let providersToTry = availableProviders;

    if (preferredProviderName) {
      const preferred = availableProviders.find(
        (p) => p.getName().toLowerCase() === preferredProviderName.toLowerCase(),
      );
      if (preferred) {
        providersToTry = [preferred, ...availableProviders.filter((p) => p !== preferred)];
      }
    }

    let lastError: Error | null = null;

    // Try each provider
    for (const provider of providersToTry) {
      try {
        this.logger.log(
          `Attempting to solve ${challengeType} with ${provider.getName()}`,
        );

        const solution = await provider.solve(params);

        // Record cost
        this.costTracking.recordSuccess(
          provider.getName(),
          challengeType,
          solution.solverId,
        );

        this.logger.log(
          `Successfully solved ${challengeType} with ${provider.getName()}`,
        );

        return solution;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Failed to solve with ${provider.getName()}: ${error.message}`,
        );
        // Continue to next provider
      }
    }

    throw new Error(
      `All providers failed to solve captcha: ${lastError?.message || 'Unknown error'}`,
    );
  }

  /**
   * Check if fallback is enabled for a challenge type
   */
  isFallbackEnabled(challengeType: CaptchaParams['type']): boolean {
    return this.configuration.fallbackEnabled?.[challengeType] !== false;
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics() {
    return this.costTracking.getAllUsageStatistics();
  }

  /**
   * Get cost tracking for a specific provider
   */
  getProviderUsageStatistics(provider: string) {
    return this.costTracking.getUsageStatistics(provider);
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.costTracking.getTotalCost();
  }

  /**
   * Set configuration value
   * Validates the value before saving
   */
  async setConfig(key: string, value: string): Promise<CaptchaSolverConfig> {
    // Validate configuration key and value
    this.validateConfigKey(key, value);

    let config = await this.configRepository.findOne({ where: { key } });

    if (config) {
      config.value = value;
      config.updatedAt = new Date();
    } else {
      config = this.configRepository.create({ key, value });
    }

    const savedConfig = await this.configRepository.save(config);

    // Update in-memory configuration
    await this.loadConfiguration();

    return savedConfig;
  }

  /**
   * Validate configuration key and value
   */
  private validateConfigKey(key: string, value: string): void {
    switch (key) {
      case 'preferred_provider':
        if (!['2captcha', 'anticaptcha'].includes(value)) {
          throw new BadRequestException(
            `Invalid preferred_provider value: ${value}. Must be '2captcha' or 'anticaptcha'`,
          );
        }
        break;
      case 'timeout_seconds':
        const timeout = parseInt(value, 10);
        if (isNaN(timeout) || timeout < 10 || timeout > 300) {
          throw new BadRequestException(
            `Invalid timeout_seconds value: ${value}. Must be between 10 and 300`,
          );
        }
        break;
      case 'max_retries':
        const retries = parseInt(value, 10);
        if (isNaN(retries) || retries < 0 || retries > 10) {
          throw new BadRequestException(
            `Invalid max_retries value: ${value}. Must be between 0 and 10`,
          );
        }
        break;
      case 'enable_auto_retry':
        if (!['true', 'false'].includes(value.toLowerCase())) {
          throw new BadRequestException(
            `Invalid enable_auto_retry value: ${value}. Must be 'true' or 'false'`,
          );
        }
        break;
      case 'min_confidence_score':
        const score = parseFloat(value);
        if (isNaN(score) || score < 0 || score > 1) {
          throw new BadRequestException(
            `Invalid min_confidence_score value: ${value}. Must be between 0 and 1`,
          );
        }
        break;
      case 'fallback_enabled_recaptcha':
      case 'fallback_enabled_hcaptcha':
      case 'fallback_enabled_datadome':
      case 'fallback_enabled_funcaptcha':
        if (!['true', 'false'].includes(value.toLowerCase())) {
          throw new BadRequestException(
            `Invalid ${key} value: ${value}. Must be 'true' or 'false'`,
          );
        }
        break;
      default:
        // Allow custom configuration keys
        break;
    }
  }
}
