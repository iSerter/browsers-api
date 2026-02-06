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
import {
  SolverUnavailableException,
  ValidationException,
  ProviderException,
  InternalException,
} from './exceptions';
import {
  captchaSolverConfigurationSchema,
  validateConfigKeyValue,
} from './config';

@Injectable()
export class CaptchaSolverService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaSolverService.name);
  private configuration: CaptchaSolverConfiguration = {};

  /** In-memory config cache with TTL */
  private configCache: { data: CaptchaSolverConfig[]; expiresAt: number } | null = null;
  private readonly CONFIG_CACHE_TTL_MS = 60000; // 60 seconds

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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to initialize Captcha Solver Service: ${errorMessage}`,
      );

      // In production, fail hard if no providers are available
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      // In development, allow app to start but log the error
      this.logger.warn(
        'Captcha Solver Service will be unavailable until API keys are configured',
      );
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
    // Validate configuration using Joi schema
    const { error } = captchaSolverConfigurationSchema.validate(this.configuration, { abortEarly: false });
    if (error) {
      const messages = error.details.map(d => d.message).join('; ');
      throw new BadRequestException(`Invalid captcha solver configuration: ${messages}`);
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
      throw new SolverUnavailableException(
        'No captcha solver providers are available. Please configure at least one API key.',
        'provider',
        'no_providers_configured',
        {
          preferredProvider: this.configuration.preferredProvider,
        },
      );
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
   * Get all configuration settings (uses in-memory cache with 60s TTL)
   */
  async getAllConfigs(): Promise<CaptchaSolverConfig[]> {
    const now = Date.now();
    if (this.configCache && now < this.configCache.expiresAt) {
      return this.configCache.data;
    }

    const configs = await this.configRepository.find();
    this.configCache = { data: configs, expiresAt: now + this.CONFIG_CACHE_TTL_MS };
    return configs;
  }

  /**
   * Invalidate the in-memory config cache
   */
  private invalidateConfigCache(): void {
    this.configCache = null;
  }

  /**
   * Get configuration value by key
   */
  async getConfigValue(key: string): Promise<string | null> {
    const configs = await this.getAllConfigs();
    const config = configs.find(c => c.key === key);
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
      throw new ValidationException(
        `Fallback is disabled for ${challengeType} challenge type`,
        [{ field: 'fallbackEnabled', message: `Fallback is disabled for ${challengeType}`, code: 'FALLBACK_DISABLED' }],
        { challengeType },
      );
    }

    // Get available providers
    const availableProviders = await this.providerRegistry.getAvailableProviders();
    if (availableProviders.length === 0) {
      throw new SolverUnavailableException(
        'No captcha solver providers are available',
        'provider',
        'no_providers_available',
        { challengeType },
      );
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
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Failed to solve with ${provider.getName()}: ${lastError.message}`,
        );
        // Continue to next provider
      }
    }

    // Determine if last error is a provider exception
    if (lastError instanceof ProviderException) {
      throw new ProviderException(
        `All providers failed to solve captcha: ${lastError.message}`,
        'all_providers',
        lastError.apiResponse,
        {
          challengeType,
          attemptedProviders: providersToTry.map(p => p.getName()),
          lastProviderError: lastError.providerName,
        },
      );
    }

    // If last error is a custom exception, rethrow it
    if (lastError instanceof SolverUnavailableException || 
        lastError instanceof ValidationException ||
        lastError instanceof InternalException) {
      throw lastError;
    }

    // Otherwise, wrap in provider exception
    throw new ProviderException(
      `All providers failed to solve captcha: ${lastError?.message || 'Unknown error'}`,
      'all_providers',
      undefined,
      {
        challengeType,
        attemptedProviders: providersToTry.map(p => p.getName()),
        originalError: lastError?.message,
      },
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

    // Invalidate cache and reload in-memory configuration
    this.invalidateConfigCache();
    await this.loadConfiguration();

    return savedConfig;
  }

  /**
   * Validate configuration key and value using Joi schemas
   */
  private validateConfigKey(key: string, value: string): void {
    try {
      validateConfigKeyValue(key, value);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      throw new BadRequestException(errorMessage);
    }
  }
}
