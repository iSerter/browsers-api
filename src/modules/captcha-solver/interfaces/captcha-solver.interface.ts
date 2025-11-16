/**
 * Interface for captcha solver providers
 */
export interface ICaptchaSolver {
  /**
   * Solve a captcha challenge
   */
  solve(params: CaptchaParams): Promise<CaptchaSolution>;

  /**
   * Get the name of the solver provider
   */
  getName(): string;

  /**
   * Check if the solver is available (has valid API key)
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Parameters for captcha solving
 */
export interface CaptchaParams {
  type: 'recaptcha' | 'hcaptcha' | 'datadome' | 'funcaptcha';
  sitekey?: string;
  url: string;
  version?: 'v2' | 'v3'; // For reCAPTCHA
  action?: string; // For reCAPTCHA v3
  proxy?: ProxyConfig;
}

/**
 * Captcha solution result
 */
export interface CaptchaSolution {
  token: string;
  solvedAt: Date;
  solverId: string;
}

/**
 * Proxy configuration for captcha solving
 */
export interface ProxyConfig {
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/**
 * Anti-bot detection result
 */
export interface AntiBotDetection {
  detected: boolean;
  type: 'cloudflare' | 'datadome' | 'akamai' | 'imperva' | 'recaptcha' | 'hcaptcha' | 'unknown' | null;
  confidence: number; // 0-1 range
  details?: Record<string, any>;
}
