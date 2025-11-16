import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';
import {
  ApiKeyHealthStatus,
  ApiKeyMetadata,
} from '../interfaces/captcha-config.interface';
import { ApiKeyValidationService } from './api-key-validation.service';

/**
 * Service for managing API keys with rotation and health tracking
 */
@Injectable()
export class ApiKeyManagerService implements OnModuleInit {
  private readonly logger = new Logger(ApiKeyManagerService.name);
  private readonly apiKeyMetadata: Map<string, ApiKeyMetadata[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CaptchaSolverApiKey)
    private readonly apiKeyRepository: Repository<CaptchaSolverApiKey>,
    private readonly validationService: ApiKeyValidationService,
  ) {}

  /**
   * Initialize and load all API keys on module init
   */
  async onModuleInit() {
    this.logger.log('Initializing API Key Manager...');
    await this.loadApiKeys();
    await this.validateAllApiKeys();
    this.logger.log('API Key Manager initialized');
  }

  /**
   * Load API keys from environment variables and database
   */
  private async loadApiKeys() {
    const providers = ['2captcha', 'anticaptcha'];

    for (const provider of providers) {
      const keys: ApiKeyMetadata[] = [];

      // Load from environment variables
      const envKeys = this.loadApiKeysFromEnv(provider);
      for (const key of envKeys) {
        keys.push({
          key,
          provider,
          healthStatus: ApiKeyHealthStatus.UNKNOWN,
          consecutiveFailures: 0,
          totalUses: 0,
          totalFailures: 0,
          source: 'environment',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Load from database
      const dbKeys = await this.loadApiKeysFromDatabase(provider);
      for (const dbKey of dbKeys) {
        keys.push({
          key: dbKey.apiKey,
          provider,
          healthStatus: dbKey.healthStatus,
          lastSuccessfulUse: dbKey.lastSuccessfulUse || undefined,
          lastFailure: dbKey.lastFailure || undefined,
          consecutiveFailures: dbKey.consecutiveFailures,
          totalUses: dbKey.totalUses,
          totalFailures: dbKey.totalFailures,
          lastValidationError: dbKey.lastValidationError || undefined,
          source: 'database',
          createdAt: dbKey.createdAt,
          updatedAt: dbKey.updatedAt,
        });
      }

      if (keys.length > 0) {
        this.apiKeyMetadata.set(provider, keys);
        this.logger.log(
          `Loaded ${keys.length} API key(s) for ${provider} (${envKeys.length} from env, ${dbKeys.length} from DB)`,
        );
      } else {
        this.logger.warn(`No API keys found for ${provider}`);
      }
    }
  }

  /**
   * Load API keys from environment variables
   */
  private loadApiKeysFromEnv(provider: string): string[] {
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
      // Support multiple keys separated by comma
      return apiKey.split(',').map((k) => k.trim()).filter((k) => k);
    }

    return [];
  }

  /**
   * Load API keys from database
   */
  private async loadApiKeysFromDatabase(
    provider: string,
  ): Promise<CaptchaSolverApiKey[]> {
    return this.apiKeyRepository.find({
      where: {
        provider,
        isActive: true,
      },
      order: {
        healthStatus: 'ASC', // Prefer healthy keys
        totalFailures: 'ASC', // Prefer keys with fewer failures
      },
    });
  }

  /**
   * Validate all API keys
   */
  private async validateAllApiKeys() {
    for (const [provider, keys] of this.apiKeyMetadata.entries()) {
      for (const keyMetadata of keys) {
        try {
          keyMetadata.healthStatus = ApiKeyHealthStatus.VALIDATING;
          const result = await this.validationService.validateApiKey(
            provider,
            keyMetadata.key,
          );

          if (result.isValid) {
            keyMetadata.healthStatus = ApiKeyHealthStatus.HEALTHY;
            keyMetadata.lastSuccessfulUse = new Date();
            keyMetadata.consecutiveFailures = 0;
            this.logger.log(
              `API key validated successfully for ${provider}`,
            );
          } else {
            keyMetadata.healthStatus = ApiKeyHealthStatus.UNHEALTHY;
            keyMetadata.lastFailure = new Date();
            keyMetadata.consecutiveFailures += 1;
            keyMetadata.lastValidationError = result.error;
            this.logger.warn(
              `API key validation failed for ${provider}: ${result.error}`,
            );
          }

          keyMetadata.updatedAt = new Date();

          // Update database if key is from database
          if (keyMetadata.source === 'database') {
            await this.updateApiKeyInDatabase(keyMetadata);
          }
        } catch (error: any) {
          this.logger.error(
            `Error validating API key for ${provider}: ${error.message}`,
          );
          keyMetadata.healthStatus = ApiKeyHealthStatus.UNHEALTHY;
          keyMetadata.lastFailure = new Date();
          keyMetadata.consecutiveFailures += 1;
          keyMetadata.lastValidationError = error.message;
        }
      }
    }
  }

  /**
   * Update API key metadata in database
   */
  private async updateApiKeyInDatabase(
    metadata: ApiKeyMetadata,
  ): Promise<void> {
    const dbKey = await this.apiKeyRepository.findOne({
      where: {
        provider: metadata.provider,
        apiKey: metadata.key,
      },
    });

    if (dbKey) {
      dbKey.healthStatus = metadata.healthStatus;
      dbKey.lastSuccessfulUse = metadata.lastSuccessfulUse || null;
      dbKey.lastFailure = metadata.lastFailure || null;
      dbKey.consecutiveFailures = metadata.consecutiveFailures;
      dbKey.totalUses = metadata.totalUses;
      dbKey.totalFailures = metadata.totalFailures;
      dbKey.lastValidationError = metadata.lastValidationError || null;
      dbKey.updatedAt = new Date();

      await this.apiKeyRepository.save(dbKey);
    }
  }

  /**
   * Get an API key for a provider with rotation and health tracking
   */
  getApiKey(provider: string): string | null {
    const keys = this.apiKeyMetadata.get(provider);
    if (!keys || keys.length === 0) {
      return null;
    }

    // Sort keys by health status priority: HEALTHY > UNKNOWN > UNHEALTHY
    // Then by failure count (fewer failures first)
    const sortedKeys = [...keys].sort((a, b) => {
      // First sort by health status
      const statusOrder = {
        [ApiKeyHealthStatus.HEALTHY]: 0,
        [ApiKeyHealthStatus.UNKNOWN]: 1,
        [ApiKeyHealthStatus.UNHEALTHY]: 2,
        [ApiKeyHealthStatus.VALIDATING]: 3,
      };
      const statusDiff = statusOrder[a.healthStatus] - statusOrder[b.healthStatus];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      // Then sort by failure count (fewer failures first)
      return a.totalFailures - b.totalFailures;
    });

    // Filter to available keys (healthy or unknown, or unhealthy if that's all we have)
    const availableKeys = sortedKeys.filter(
      (k) =>
        k.healthStatus === ApiKeyHealthStatus.HEALTHY ||
        k.healthStatus === ApiKeyHealthStatus.UNKNOWN ||
        (sortedKeys.every(
          (key) =>
            key.healthStatus === ApiKeyHealthStatus.UNHEALTHY ||
            key.healthStatus === ApiKeyHealthStatus.VALIDATING,
        ) &&
          k.healthStatus === ApiKeyHealthStatus.UNHEALTHY),
    );

    if (availableKeys.length === 0) {
      return null;
    }

    // Round-robin selection - rotate the original keys array
    // Find the selected key in the original array and rotate
    const selectedKey = availableKeys[0];
    selectedKey.totalUses += 1;
    selectedKey.updatedAt = new Date();

    // Rotate the original keys array to maintain rotation state
    const selectedIndex = keys.indexOf(selectedKey);
    if (selectedIndex !== -1) {
      // Move selected key to end for round-robin
      keys.splice(selectedIndex, 1);
      keys.push(selectedKey);
    }

    // Update database if needed
    if (selectedKey.source === 'database') {
      this.updateApiKeyInDatabase(selectedKey).catch((error) => {
        this.logger.error(
          `Failed to update API key usage in database: ${error.message}`,
        );
      });
    }

    return selectedKey.key;
  }

  /**
   * Record a successful API key usage
   */
  async recordSuccess(provider: string, apiKey: string): Promise<void> {
    const keys = this.apiKeyMetadata.get(provider);
    if (!keys) return;

    const keyMetadata = keys.find((k) => k.key === apiKey);
    if (keyMetadata) {
      keyMetadata.lastSuccessfulUse = new Date();
      keyMetadata.consecutiveFailures = 0;
      keyMetadata.healthStatus = ApiKeyHealthStatus.HEALTHY;
      keyMetadata.updatedAt = new Date();

      if (keyMetadata.source === 'database') {
        await this.updateApiKeyInDatabase(keyMetadata);
      }
    }
  }

  /**
   * Record a failed API key usage
   */
  async recordFailure(provider: string, apiKey: string, error?: string): Promise<void> {
    const keys = this.apiKeyMetadata.get(provider);
    if (!keys) return;

    const keyMetadata = keys.find((k) => k.key === apiKey);
    if (keyMetadata) {
      keyMetadata.lastFailure = new Date();
      keyMetadata.consecutiveFailures += 1;
      keyMetadata.totalFailures += 1;
      keyMetadata.lastValidationError = error;

      // Mark as unhealthy after 3 consecutive failures
      if (keyMetadata.consecutiveFailures >= 3) {
        keyMetadata.healthStatus = ApiKeyHealthStatus.UNHEALTHY;
      } else if (keyMetadata.consecutiveFailures === 1) {
        // First failure - mark as unknown if it was healthy
        if (keyMetadata.healthStatus === ApiKeyHealthStatus.HEALTHY) {
          keyMetadata.healthStatus = ApiKeyHealthStatus.UNKNOWN;
        }
      }

      keyMetadata.updatedAt = new Date();

      if (keyMetadata.source === 'database') {
        await this.updateApiKeyInDatabase(keyMetadata);
      }
    }
  }

  /**
   * Check if a provider is available (has at least one healthy or unknown key)
   */
  isProviderAvailable(provider: string): boolean {
    const keys = this.apiKeyMetadata.get(provider);
    if (!keys || keys.length === 0) {
      return false;
    }

    return keys.some(
      (k) =>
        k.healthStatus === ApiKeyHealthStatus.HEALTHY ||
        k.healthStatus === ApiKeyHealthStatus.UNKNOWN,
    );
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.apiKeyMetadata.keys()).filter((provider) =>
      this.isProviderAvailable(provider),
    );
  }

  /**
   * Get API key metadata for a provider
   */
  getApiKeyMetadata(provider: string): ApiKeyMetadata[] {
    return this.apiKeyMetadata.get(provider) || [];
  }
}

