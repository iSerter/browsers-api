import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import {
  IActionHandler,
  ActionConfig,
  ActionResult,
} from '../interfaces/action-handler.interface';

interface ExecuteScriptActionConfig extends ActionConfig {
  script: string;
}

@Injectable()
export class ExecuteScriptActionHandler implements IActionHandler {
  private readonly logger = new Logger(ExecuteScriptActionHandler.name);

  constructor(private readonly configService: ConfigService) {}

  async execute(
    page: Page,
    config: ExecuteScriptActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    try {
      // Security check: Verify that executeScript is enabled
      const isEnabled = this.configService.get<boolean>(
        'ENABLE_EXECUTE_SCRIPT',
        false,
      );

      if (!isEnabled) {
        this.logger.warn(
          `Attempt to execute script for job ${jobId} when ENABLE_EXECUTE_SCRIPT is disabled`,
        );
        throw new ForbiddenException(
          'executeScript action is disabled. Set ENABLE_EXECUTE_SCRIPT=true to enable this feature.',
        );
      }

      const { script } = config;

      // Validate required fields
      if (!script || typeof script !== 'string') {
        throw new Error(
          'ExecuteScript action requires a valid script string',
        );
      }

      if (script.trim().length === 0) {
        throw new Error('Script cannot be empty');
      }

      this.logger.log(
        `Executing script for job ${jobId} (length: ${script.length} chars)`,
      );

      // Wrap script in a function if it's not already a function
      // This allows users to write scripts like "return document.title" 
      // instead of requiring "(function() { return document.title; })()"
      let wrappedScript = script.trim();
      
      // Check if script is already wrapped in a function (starts with function, =>, or (function)
      const isAlreadyFunction = 
        wrappedScript.startsWith('function') ||
        wrappedScript.startsWith('(') ||
        wrappedScript.startsWith('async') ||
        wrappedScript.startsWith('() =>') ||
        wrappedScript.startsWith('async () =>');
      
      if (!isAlreadyFunction) {
        // Wrap in an arrow function to allow return statements
        wrappedScript = `(() => { ${script} })()`;
      }

      // Execute the script in the page context
      const result = await page.evaluate(wrappedScript);

      this.logger.log(
        `Script execution completed successfully for job ${jobId}`,
      );

      return {
        success: true,
        data: {
          scriptLength: script.length,
          result: result,
        },
      };
    } catch (error) {
      // Handle ForbiddenException specially
      if (error instanceof ForbiddenException) {
        this.logger.error(
          `Script execution forbidden for job ${jobId}: ${error.message}`,
        );
        return {
          success: false,
          error: {
            message: error.message,
            code: 'SCRIPT_EXECUTION_DISABLED',
            retryable: false,
          },
        };
      }

      this.logger.error(
        `Script execution failed for job ${jobId}: ${error.message}`,
      );

      return {
        success: false,
        error: {
          message: error.message,
          code: this.getErrorCode(error),
          retryable: this.isRetryableError(error),
        },
      };
    }
  }

  private getErrorCode(error: any): string {
    if (error.name === 'TimeoutError') return 'SCRIPT_TIMEOUT';
    if (error.message?.includes('ReferenceError') || 
        error.message?.includes('SyntaxError') ||
        error.message?.includes('TypeError')) {
      return 'SCRIPT_EVALUATION_ERROR';
    }
    if (error.message?.includes('evaluate')) return 'SCRIPT_EVALUATION_ERROR';
    return 'SCRIPT_EXECUTION_ERROR';
  }

  private isRetryableError(error: any): boolean {
    // Network errors and timeouts are retryable
    if (error.name === 'TimeoutError') return true;
    if (error.message?.includes('Navigation')) return true;

    // Script errors are generally not retryable
    return false;
  }
}

