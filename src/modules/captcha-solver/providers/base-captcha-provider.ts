import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  ICaptchaSolver,
  CaptchaParams,
  CaptchaSolution,
} from '../interfaces/captcha-solver.interface';
import {
  NetworkException,
  ProviderException,
} from '../exceptions';
import { retryWithBackoff } from '../utils';
import { formatError } from '../utils/error-formatter.util';

/**
 * Base class for captcha solver providers
 * Implements common functionality like retry logic, timeout handling, and error management
 */
@Injectable()
export abstract class BaseCaptchaProvider implements ICaptchaSolver {
  protected readonly logger: Logger;
  protected readonly httpService: HttpService;
  protected readonly maxRetries: number;
  protected readonly timeoutSeconds: number;

  constructor(
    httpService: HttpService,
    maxRetries: number = 3,
    timeoutSeconds: number = 60,
  ) {
    this.httpService = httpService;
    this.maxRetries = maxRetries;
    this.timeoutSeconds = timeoutSeconds;
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Solve a captcha challenge with retry logic
   */
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    try {
      return await retryWithBackoff(
        async () => {
          const solution = await this.solveCaptcha(params);
          this.logger.log(
            `Successfully solved ${params.type} captcha`,
          );
          return solution;
        },
        {
          maxAttempts: this.maxRetries,
          backoffMs: 1000,
          maxBackoffMs: 10000,
          shouldRetry: (error) => !this.shouldNotRetry(error),
          onRetry: (attempt, error, delay) => {
            this.logger.debug(
              `Attempt ${attempt}/${this.maxRetries} to solve ${params.type} captcha failed, retrying in ${delay}ms: ${formatError(error)}`,
            );
          },
        },
      );
    } catch (error: any) {
      // If last error is already a custom exception, rethrow it
      if (error instanceof ProviderException || 
          error instanceof NetworkException) {
        throw error;
      }

      // Wrap in provider exception with context
      throw new ProviderException(
        `Failed to solve captcha after ${this.maxRetries} attempts: ${formatError(error)}`,
        this.getName(),
        undefined,
        {
          maxRetries: this.maxRetries,
          attempts: this.maxRetries,
          originalError: formatError(error),
          captchaType: params.type,
        },
      );
    }
  }

  /**
   * Abstract method to be implemented by specific providers
   */
  protected abstract solveCaptcha(params: CaptchaParams): Promise<CaptchaSolution>;

  /**
   * Check if the provider is available (has valid API key)
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get the name of the provider
   */
  abstract getName(): string;

  /**
   * Determine if an error should not trigger a retry
   */
  protected shouldNotRetry(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.response?.status || error?.code;

    // Don't retry on authentication errors
    if (errorCode === 401 || errorCode === 403) {
      return true;
    }

    // Don't retry on invalid parameter errors
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('required')
    ) {
      return true;
    }

    // Don't retry on insufficient balance
    if (errorMessage.includes('balance') || errorMessage.includes('funds')) {
      return true;
    }

    return false;
  }


  /**
   * Make HTTP request with timeout
   */
  protected async makeRequest(
    method: 'GET' | 'POST',
    url: string,
    data?: any,
    headers?: Record<string, string>,
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.timeoutSeconds * 1000,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url,
          data,
          headers,
          signal: controller.signal,
        }),
      );
      clearTimeout(timeoutId);
      return response.data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        throw new NetworkException(
          `Request timeout after ${this.timeoutSeconds} seconds`,
          error,
          {
            url,
            method,
            timeoutSeconds: this.timeoutSeconds,
            provider: this.getName(),
          },
        );
      }
      
      // If it's a network-related error, wrap in NetworkException
      if (error.code === 'ECONNREFUSED' || 
          error.code === 'ENOTFOUND' || 
          error.code === 'ETIMEDOUT' ||
          error.response?.status >= 500) {
        throw new NetworkException(
          `Network error during request: ${error.message}`,
          error,
          {
            url,
            method,
            statusCode: error.response?.status,
            provider: this.getName(),
          },
        );
      }
      
      // If it's already a custom exception, rethrow it
      if (error instanceof ProviderException || 
          error instanceof NetworkException) {
        throw error;
      }
      
      // Otherwise, wrap in ProviderException
      throw new ProviderException(
        `Provider request failed: ${error.message}`,
        this.getName(),
        error.response?.data,
        {
          url,
          method,
          statusCode: error.response?.status,
          originalError: error.message,
        },
      );
    }
  }

  /**
   * Format proxy configuration for provider API
   */
  protected formatProxy(proxy?: CaptchaParams['proxy']): string | undefined {
    if (!proxy) {
      return undefined;
    }

    if (proxy.username && proxy.password) {
      return `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }

    return `${proxy.type}://${proxy.host}:${proxy.port}`;
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

