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
  @IsEnum(['http', 'https', 'socks4', 'socks5'])
  @IsNotEmpty()
  type: 'http' | 'https' | 'socks4' | 'socks5';

  @IsString()
  @IsNotEmpty()
  host: string;

  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port: number;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class TestCaptchaDto {
  @IsEnum(CaptchaType)
  @IsNotEmpty()
  type: CaptchaType;

  @IsString()
  @IsOptional()
  sitekey?: string;

  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsEnum(RecaptchaVersion)
  @IsOptional()
  @ValidateIf((o) => o.type === CaptchaType.RECAPTCHA)
  version?: RecaptchaVersion;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.type === CaptchaType.RECAPTCHA && o.version === RecaptchaVersion.V3)
  action?: string;

  @IsOptional()
  proxy?: ProxyConfigDto;
}

