import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BaseCaptchaProvider } from './base-captcha-provider';
import {
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import { ApiKeyManagerService } from '../services/api-key-manager.service';

/**
 * Anti-Captcha provider implementation
 * Supports reCAPTCHA v2/v3, hCAPTCHA, and DataDome
 */
@Injectable()
export class AntiCaptchaProvider extends BaseCaptchaProvider {
  private readonly baseUrl = 'https://api.anti-captcha.com';

  constructor(
    httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly apiKeyManager: ApiKeyManagerService,
  ) {
    super(httpService, 3, 60);
  }

  getName(): string {
    return 'anticaptcha';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKeyManager.isProviderAvailable('anticaptcha');
  }

  protected async solveCaptcha(params: CaptchaParams): Promise<CaptchaSolution> {
    const apiKey = this.apiKeyManager.getApiKey('anticaptcha');
    if (!apiKey) {
      throw new Error('Anti-Captcha API key not available');
    }

    // Create task
    const taskId = await this.createTask(apiKey, params);

    // Wait for task completion
    await this.waitForTask(apiKey, taskId);

    // Get result
    const token = await this.getTaskResult(apiKey, taskId);

    // Record success
    await this.apiKeyManager.recordSuccess('anticaptcha', apiKey);

    return {
      token,
      solvedAt: new Date(),
      solverId: `anticaptcha-${taskId}`,
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
        throw new Error(`Unsupported captcha type: ${params.type}`);
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
        throw new Error(
          `Anti-Captcha error: ${response.errorCode} - ${response.errorDescription}`,
        );
      }

      return response.taskId;
    } catch (error: any) {
      await this.apiKeyManager.recordFailure('anticaptcha', apiKey, error.message);
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
            `Anti-Captcha error: ${response.errorCode} - ${response.errorDescription}`,
          );
        }

        if (response.status === 'ready') {
          return;
        }

        if (response.status === 'processing') {
          // Continue polling
          continue;
        }

        throw new Error(`Unexpected task status: ${response.status}`);
      } catch (error: any) {
        if (attempt === maxAttempts - 1) {
          await this.apiKeyManager.recordFailure('anticaptcha', apiKey, error.message);
          throw new Error(`Failed to wait for Anti-Captcha task: ${error.message}`);
        }
        // Continue polling on transient errors
      }
    }

    throw new Error('Timeout waiting for Anti-Captcha task');
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
      throw new Error(
        `Anti-Captcha error: ${response.errorCode} - ${response.errorDescription}`,
      );
    }

    if (response.status !== 'ready') {
      throw new Error(`Task not ready: ${response.status}`);
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

    throw new Error('Unable to extract token from Anti-Captcha response');
  }

  /**
   * Get Anti-Captcha task type
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
        throw new Error(`Unsupported captcha type: ${type}`);
    }
  }
}

