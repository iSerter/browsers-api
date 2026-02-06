import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiKeyValidationResult } from '../interfaces/captcha-config.interface';

/**
 * Service for validating API keys with actual HTTP requests to providers
 */
@Injectable()
export class ApiKeyValidationService {
  private readonly logger = new Logger(ApiKeyValidationService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Validate a 2Captcha API key
   */
  async validate2CaptchaKey(apiKey: string): Promise<ApiKeyValidationResult> {
    try {
      // 2Captcha balance endpoint - lightweight way to validate key
      const response = await firstValueFrom(
        this.httpService.get('https://2captcha.com/res.php', {
          params: {
            key: apiKey,
            action: 'getbalance',
            json: 1,
          },
          timeout: 10000, // 10 second timeout
        }),
      );

      const data = response.data;

      if (data.status === 1) {
        // Valid key - balance returned
        return {
          isValid: true,
          data: { balance: data.request },
          validatedAt: new Date(),
        };
      } else if (data.request === 'ERROR_WRONG_USER_KEY') {
        return {
          isValid: false,
          error: 'Invalid API key',
          validatedAt: new Date(),
        };
      } else {
        return {
          isValid: false,
          error: data.request || 'Unknown error',
          validatedAt: new Date(),
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error validating 2Captcha key: ${errorMessage}`);
      return {
        isValid: false,
        error: errorMessage || 'Network error during validation',
        validatedAt: new Date(),
      };
    }
  }

  /**
   * Validate an Anti-Captcha API key
   */
  async validateAntiCaptchaKey(apiKey: string): Promise<ApiKeyValidationResult> {
    try {
      // Anti-Captcha getBalance endpoint
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.anti-captcha.com/getBalance',
          {
            clientKey: apiKey,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        ),
      );

      const data = response.data;

      if (data.errorId === 0) {
        // Valid key
        return {
          isValid: true,
          data: { balance: data.balance },
          validatedAt: new Date(),
        };
      } else {
        return {
          isValid: false,
          error: data.errorDescription || `Error ID: ${data.errorId}`,
          validatedAt: new Date(),
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error validating Anti-Captcha key: ${errorMessage}`);
      return {
        isValid: false,
        error: errorMessage || 'Network error during validation',
        validatedAt: new Date(),
      };
    }
  }

  /**
   * Validate an API key for a specific provider
   */
  async validateApiKey(
    provider: string,
    apiKey: string,
  ): Promise<ApiKeyValidationResult> {
    this.logger.debug(`Validating API key for provider: ${provider}`);

    switch (provider.toLowerCase()) {
      case '2captcha':
        return this.validate2CaptchaKey(apiKey);
      case 'anticaptcha':
        return this.validateAntiCaptchaKey(apiKey);
      default:
        this.logger.warn(`Unknown provider for validation: ${provider}`);
        return {
          isValid: false,
          error: `Unknown provider: ${provider}`,
          validatedAt: new Date(),
        };
    }
  }
}

