import { IsOptional, IsBoolean, IsString, IsArray, IsNumber, Min, Max } from 'class-validator';

/**
 * Configuration for captcha solving in a job
 */
export class CaptchaConfigDto {
  /**
   * Enable captcha solving for this job
   * @default false
   */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /**
   * Preferred captcha solver provider (e.g., '2captcha', 'anticaptcha', 'native')
   * If not specified, uses default priority order
   */
  @IsOptional()
  @IsString()
  preferredProvider?: string;

  /**
   * Priority order for solver types
   * @default ['native', '2captcha', 'anticaptcha']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  solverPriority?: string[];

  /**
   * Enable 3rd party provider fallback
   * @default true
   */
  @IsOptional()
  @IsBoolean()
  enableThirdPartyFallback?: boolean;

  /**
   * Minimum confidence threshold for detection (0-1)
   * @default 0.5
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  /**
   * Maximum retry attempts per solver type
   * @default { recaptcha: 3, hcaptcha: 3, datadome: 3, funcaptcha: 3 }
   */
  @IsOptional()
  maxRetries?: Record<string, number>;

  /**
   * Timeout durations per solver type (in milliseconds)
   * @default { recaptcha: 30000, hcaptcha: 30000, datadome: 45000, funcaptcha: 30000 }
   */
  @IsOptional()
  timeouts?: Record<string, number>;
}



