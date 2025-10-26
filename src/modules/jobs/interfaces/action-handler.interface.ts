import { Page } from 'playwright';

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
  target?: string; // The target to find (text, label, role, selector)
  getTargetBy?: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder'; // How to find the target
  value?: string; // Value for fill actions
  attribute?: string; // Attribute to extract for extract actions
  multiple?: boolean; // Extract multiple elements
  [key: string]: any;
}

export interface IActionHandler {
  execute(
    page: Page,
    config: ActionConfig,
    jobId: string,
  ): Promise<ActionResult>;
}
