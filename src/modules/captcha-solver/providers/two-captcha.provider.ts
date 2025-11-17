import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BaseCaptchaProvider } from './base-captcha-provider';
import {
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { ApiKeyManagerService } from '../services/api-key-manager.service';
import {
  SolverUnavailableException,
  ValidationException,
  ProviderException,
  NetworkException,
} from '../exceptions';

/**
 * 2Captcha provider implementation
 * Supports reCAPTCHA v2/v3, hCAPTCHA, and DataDome
 */
@Injectable()
export class TwoCaptchaProvider extends BaseCaptchaProvider {
  private readonly baseUrl = 'https://2captcha.com';

  constructor(
    httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly apiKeyManager: ApiKeyManagerService,
  ) {
    super(httpService, 3, 60);
  }

  getName(): string {
    return '2captcha';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKeyManager.isProviderAvailable('2captcha');
  }

  protected async solveCaptcha(params: CaptchaParams): Promise<CaptchaSolution> {
    const apiKey = this.apiKeyManager.getApiKey('2captcha');
    if (!apiKey) {
      throw new SolverUnavailableException(
        '2Captcha API key not available',
        '2captcha',
        'api_key_not_configured',
        { provider: '2captcha' },
      );
    }

    // Submit captcha task
    const taskId = await this.submitTask(apiKey, params);

    // Poll for result
    const token = await this.getResult(apiKey, taskId);

    // Record success
    await this.apiKeyManager.recordSuccess('2captcha', apiKey);

    return {
      token,
      solvedAt: new Date(),
      solverId: `2captcha-${taskId}`,
    };
  }

  /**
   * Submit a captcha task to 2Captcha
   */
  private async submitTask(
    apiKey: string,
    params: CaptchaParams,
  ): Promise<string> {
    const method = this.getMethod(params.type);
    const requestData: any = {
      key: apiKey,
      method: method,
      json: 1,
    };

    // Add method-specific parameters
    switch (params.type) {
      case 'recaptcha':
        requestData.googlekey = params.sitekey;
        requestData.pageurl = params.url;
        if (params.version === 'v3') {
          requestData.version = 'v3';
          requestData.action = params.action || 'verify';
        } else {
          requestData.version = 'v2';
        }
        break;

      case 'hcaptcha':
        requestData.sitekey = params.sitekey;
        requestData.pageurl = params.url;
        break;

      case 'datadome':
        // DataDome requires cookie and user-agent
        requestData.pageurl = params.url;
        requestData.captcha_type = 'datadome';
        break;

      case 'funcaptcha':
        requestData.publickey = params.sitekey;
        requestData.pageurl = params.url;
        break;

      default:
        throw new ValidationException(
          `Unsupported captcha type: ${params.type}`,
          [{ field: 'type', message: `Unsupported captcha type: ${params.type}`, code: 'UNSUPPORTED_TYPE' }],
          { captchaType: params.type, provider: '2captcha' },
        );
    }

    // Add proxy if provided
    const proxy = this.formatProxy(params.proxy);
    if (proxy) {
      requestData.proxy = proxy;
      requestData.proxytype = params.proxy?.type || 'HTTP';
    }

    try {
      const response = await this.makeRequest(
        'POST',
        `${this.baseUrl}/in.php`,
        new URLSearchParams(requestData).toString(),
        {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      );

      if (response.status !== 1) {
        throw new ProviderException(
          `2Captcha error: ${response.request || response.error_text || 'Unknown error'}`,
          '2captcha',
          response,
          {
            captchaType: params.type,
            taskId: response.request,
          },
        );
      }

      return response.request;
    } catch (error: any) {
      await this.apiKeyManager.recordFailure('2captcha', apiKey, error.message);
      throw error;
    }
  }

  /**
   * Get the result of a captcha task
   */
  private async getResult(apiKey: string, taskId: string): Promise<string> {
    const maxAttempts = 120; // 2 minutes max (1 second intervals)
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await this.makeRequest(
          'GET',
          `${this.baseUrl}/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`,
        );

        if (response.status === 1) {
          return response.request;
        }

        if (response.request === 'CAPCHA_NOT_READY') {
          // Continue polling
          continue;
        }

        throw new ProviderException(
          `2Captcha error: ${response.request || response.error_text || 'Unknown error'}`,
          '2captcha',
          response,
          { taskId },
        );
      } catch (error: any) {
        if (attempt === maxAttempts - 1) {
          await this.apiKeyManager.recordFailure('2captcha', apiKey, error.message);
          if (error instanceof ProviderException || error instanceof NetworkException) {
            throw error;
          }
          throw new ProviderException(
            `Failed to get result from 2Captcha: ${error.message}`,
            '2captcha',
            undefined,
            { taskId, originalError: error.message },
          );
        }
        // Continue polling on transient errors
      }
    }

    throw new NetworkException(
      'Timeout waiting for 2Captcha result',
      undefined,
      {
        taskId,
        maxAttempts,
        pollInterval,
        provider: '2captcha',
      },
    );
  }

  /**
   * Get 2Captcha method name for captcha type
   */
  private getMethod(type: CaptchaParams['type']): string {
    switch (type) {
      case 'recaptcha':
        return 'userrecaptcha';
      case 'hcaptcha':
        return 'hcaptcha';
      case 'datadome':
        return 'datadome';
      case 'funcaptcha':
        return 'funcaptcha';
      default:
        throw new ValidationException(
          `Unsupported captcha type: ${type}`,
          [{ field: 'type', message: `Unsupported captcha type: ${type}`, code: 'UNSUPPORTED_TYPE' }],
          { captchaType: type, provider: '2captcha' },
        );
    }
  }
}

