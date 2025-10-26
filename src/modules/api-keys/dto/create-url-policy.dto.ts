import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { PolicyType } from '../entities/url-policy.entity';

export class CreateUrlPolicyDto {
  @IsString()
  @IsNotEmpty()
  pattern: string;

  @IsEnum(PolicyType)
  @IsOptional()
  type?: PolicyType = PolicyType.BLACKLIST;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
