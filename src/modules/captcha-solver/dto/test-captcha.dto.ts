import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsUrl,
  ValidateIf,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CaptchaType {
  RECAPTCHA = 'recaptcha',
  HCAPTCHA = 'hcaptcha',
  DATADOME = 'datadome',
  FUNCAPTCHA = 'funcaptcha',
}

export enum RecaptchaVersion {
  V2 = 'v2',
  V3 = 'v3',
}

export class ProxyConfigDto {
  @ApiProperty({
    enum: ['http', 'https', 'socks4', 'socks5'],
    description: 'Proxy type',
    example: 'http',
  })
  @IsEnum(['http', 'https', 'socks4', 'socks5'])
  @IsNotEmpty()
  type: 'http' | 'https' | 'socks4' | 'socks5';

  @ApiProperty({
    description: 'Proxy host address',
    example: 'proxy.example.com',
  })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({
    description: 'Proxy port number',
    example: 8080,
    minimum: 1,
    maximum: 65535,
  })
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port: number;

  @ApiPropertyOptional({
    description: 'Proxy username for authentication',
    example: 'username',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description: 'Proxy password for authentication',
    example: 'password',
  })
  @IsString()
  @IsOptional()
  password?: string;
}

export class TestCaptchaDto {
  @ApiProperty({
    enum: CaptchaType,
    description: 'Type of captcha to solve',
    example: CaptchaType.RECAPTCHA,
  })
  @IsEnum(CaptchaType)
  @IsNotEmpty()
  type: CaptchaType;

  @ApiPropertyOptional({
    description: 'Captcha site key (required for reCAPTCHA and hCAPTCHA)',
    example: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
  })
  @IsString()
  @IsOptional()
  sitekey?: string;

  @ApiProperty({
    description: 'URL of the page containing the captcha',
    example: 'https://example.com/login',
  })
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    enum: RecaptchaVersion,
    description: 'reCAPTCHA version (v2 or v3). Required when type is recaptcha',
    example: RecaptchaVersion.V2,
  })
  @IsEnum(RecaptchaVersion)
  @IsOptional()
  @ValidateIf((o) => o.type === CaptchaType.RECAPTCHA)
  version?: RecaptchaVersion;

  @ApiPropertyOptional({
    description: 'Action name for reCAPTCHA v3. Required when type is recaptcha and version is v3',
    example: 'login',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.type === CaptchaType.RECAPTCHA && o.version === RecaptchaVersion.V3)
  action?: string;

  @ApiPropertyOptional({
    description: 'Proxy configuration for solving captcha through a proxy',
    type: ProxyConfigDto,
  })
  @IsOptional()
  proxy?: ProxyConfigDto;
}

