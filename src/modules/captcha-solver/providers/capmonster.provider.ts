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
import { CaptchaSolverConfigService } from '../config';

/**
 * CapMonster provider implementation
 * Uses the same API format as Anti-Captcha but with a different base URL
 * Supports reCAPTCHA v2/v3, hCAPTCHA, and DataDome
 */
@Injectable()
export class CapMonsterProvider extends BaseCaptchaProvider {
  private readonly baseUrl = 'https://api.capmonster.cloud';

  constructor(
    httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly apiKeyManager: ApiKeyManagerService,
    private readonly captchaConfig: CaptchaSolverConfigService,
  ) {
    const providerConfig = captchaConfig.getProviderConfig();
    super(httpService, providerConfig.maxRetries, providerConfig.timeoutSeconds);
  }

  getName(): string {
    return 'capmonster';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKeyManager.isProviderAvailable('capmonster');
  }

  protected async solveCaptcha(params: CaptchaParams): Promise<CaptchaSolution> {
    const apiKey = this.apiKeyManager.getApiKey('capmonster');
    if (!apiKey) {
      throw new SolverUnavailableException(
        'CapMonster API key not available',
        'capmonster',
        'api_key_not_configured',
        { provider: 'capmonster' },
      );
    }

    // Create task
    const taskId = await this.createTask(apiKey, params);

    // Wait for task completion
    await this.waitForTask(apiKey, taskId);

    // Get result
    const token = await this.getTaskResult(apiKey, taskId);

    // Record success
    await this.apiKeyManager.recordSuccess('capmonster', apiKey);

    return {
      token,
      solvedAt: new Date(),
      solverId: `capmonster-${taskId}`,
    };
  }

  /**
   * Create a captcha task
   */
  private async createTask(
    apiKey: string,
    params: CaptchaParams,
  ): Promise<number> {
    const taskType = this.getTaskType(params.type);
    const taskData: any = {
      websiteURL: params.url,
    };

    // Add type-specific parameters
    switch (params.type) {
      case 'recaptcha':
        taskData.websiteKey = params.sitekey;
        if (params.version === 'v3') {
          taskData.type = 'RecaptchaV3TaskProxyless';
          taskData.minScore = 0.3;
          taskData.action = params.action || 'verify';
        } else {
          taskData.type = 'RecaptchaV2TaskProxyless';
        }
        break;

      case 'hcaptcha':
        taskData.type = 'HCaptchaTaskProxyless';
        taskData.websiteKey = params.sitekey;
        break;

      case 'datadome':
        taskData.type = 'DataDomeSliderTask';
        break;

      case 'funcaptcha':
        taskData.type = 'FunCaptchaTaskProxyless';
        taskData.websitePublicKey = params.sitekey;
        break;

      default:
        throw new ValidationException(
          `Unsupported captcha type: ${params.type}`,
          [{ field: 'type', message: `Unsupported captcha type: ${params.type}`, code: 'UNSUPPORTED_TYPE' }],
          { captchaType: params.type, provider: 'capmonster' },
        );
    }

    // Add proxy if provided
    const proxy = params.proxy;
    if (proxy && taskData.type.includes('Proxyless')) {
      // Replace Proxyless with Proxy version
      taskData.type = taskData.type.replace('Proxyless', '');
      taskData.proxyType = proxy.type;
      taskData.proxyAddress = proxy.host;
      taskData.proxyPort = proxy.port;
      if (proxy.username && proxy.password) {
        taskData.proxyLogin = proxy.username;
        taskData.proxyPassword = proxy.password;
      }
    }

    const requestData = {
      clientKey: apiKey,
      task: taskData,
    };

    try {
      const response = await this.makeRequest(
        'POST',
        `${this.baseUrl}/createTask`,
        requestData,
        {
          'Content-Type': 'application/json',
        },
      );

      if (response.errorId !== 0) {
        throw new ProviderException(
          `CapMonster error: ${response.errorCode} - ${response.errorDescription}`,
          'capmonster',
          response,
          {
            errorCode: response.errorCode,
            errorDescription: response.errorDescription,
            captchaType: params.type,
          },
        );
      }

      return response.taskId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.apiKeyManager.recordFailure('capmonster', apiKey, errorMessage);
      throw error;
    }
  }

  /**
   * Wait for task to complete
   */
  private async waitForTask(apiKey: string, taskId: number): Promise<void> {
    const maxAttempts = 120; // 2 minutes max
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await this.makeRequest(
          'POST',
          `${this.baseUrl}/getTaskResult`,
          {
            clientKey: apiKey,
            taskId: taskId,
          },
          {
            'Content-Type': 'application/json',
          },
        );

        if (response.errorId !== 0) {
          throw new Error(
            `CapMonster error: ${response.errorCode} - ${response.errorDescription}`,
          );
        }

        if (response.status === 'ready') {
          return;
        }

        if (response.status === 'processing') {
          // Continue polling
          continue;
        }

        throw new ProviderException(
          `Unexpected task status: ${response.status}`,
          'capmonster',
          response,
          { taskId },
        );
      } catch (error: unknown) {
        if (attempt === maxAttempts - 1) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.apiKeyManager.recordFailure('capmonster', apiKey, errorMessage);
          if (error instanceof ProviderException || error instanceof NetworkException) {
            throw error;
          }
          throw new ProviderException(
            `Failed to wait for CapMonster task: ${errorMessage}`,
            'capmonster',
            undefined,
            { taskId, originalError: errorMessage },
          );
        }
        // Continue polling on transient errors
      }
    }

    throw new NetworkException(
      'Timeout waiting for CapMonster task',
      undefined,
      {
        taskId,
        maxAttempts,
        pollInterval,
        provider: 'capmonster',
      },
    );
  }

  /**
   * Get task result
   */
  private async getTaskResult(apiKey: string, taskId: number): Promise<string> {
    const response = await this.makeRequest(
      'POST',
      `${this.baseUrl}/getTaskResult`,
      {
        clientKey: apiKey,
        taskId: taskId,
      },
      {
        'Content-Type': 'application/json',
      },
    );

    if (response.errorId !== 0) {
      throw new ProviderException(
        `CapMonster error: ${response.errorCode} - ${response.errorDescription}`,
        'capmonster',
        response,
        {
          errorCode: response.errorCode,
          errorDescription: response.errorDescription,
          taskId,
        },
      );
    }

    if (response.status !== 'ready') {
      throw new ProviderException(
        `Task not ready: ${response.status}`,
        'capmonster',
        response,
        { taskId },
      );
    }

    // Extract token based on task type
    const solution = response.solution;
    if (solution.gRecaptchaResponse) {
      return solution.gRecaptchaResponse;
    }
    if (solution.token) {
      return solution.token;
    }
    if (solution.cookie) {
      return solution.cookie;
    }

    throw new ProviderException(
      'Unable to extract token from CapMonster response',
      'capmonster',
      response,
      { taskId, solution },
    );
  }

  /**
   * Get CapMonster task type
   */
  private getTaskType(type: CaptchaParams['type']): string {
    switch (type) {
      case 'recaptcha':
        return 'RecaptchaV2TaskProxyless';
      case 'hcaptcha':
        return 'HCaptchaTaskProxyless';
      case 'datadome':
        return 'DataDomeSliderTask';
      case 'funcaptcha':
        return 'FunCaptchaTaskProxyless';
      default:
        throw new ValidationException(
          `Unsupported captcha type: ${type}`,
          [{ field: 'type', message: `Unsupported captcha type: ${type}`, code: 'UNSUPPORTED_TYPE' }],
          { captchaType: type, provider: 'capmonster' },
        );
    }
  }
}
