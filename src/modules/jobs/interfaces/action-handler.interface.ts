import { BrowserContext } from 'playwright';

export interface ActionResult {
  success: boolean;
  artifactId?: string;
  data?: any;
  error?: {
    message: string;
    code: string;
    retryable: boolean;
  };
}

export interface ActionConfig {
  action: string;
  [key: string]: any;
}

export interface IActionHandler {
  execute(
    context: BrowserContext,
    config: ActionConfig,
    jobId: string,
  ): Promise<ActionResult>;
}
