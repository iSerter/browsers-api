import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CookieDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsBoolean()
  httpOnly?: boolean;

  @IsOptional()
  @IsNumber()
  expires?: number; // Unix timestamp

  @IsOptional()
  @IsEnum(['Strict', 'Lax', 'None'])
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class BrowserStorageDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CookieDto)
  cookies?: CookieDto[];

  @IsOptional()
  @IsObject()
  localStorage?: Record<string, string>;

  @IsOptional()
  @IsObject()
  sessionStorage?: Record<string, string>;
}

