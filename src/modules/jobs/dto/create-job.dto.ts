import {
  IsInt,
  IsString,
  IsUrl,
  IsArray,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WaitUntilOption } from '../entities/automation-job.entity';
import { ActionConfigDto } from './action-config.dto';

export class CreateJobDto {
  @IsInt()
  @Min(1)
  browserTypeId: number;

  @IsUrl({ require_protocol: true })
  @IsString()
  targetUrl: string;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => ActionConfigDto)
  @ValidateNested({ each: true })
  actions: ActionConfigDto[];

  @IsOptional()
  @IsEnum(WaitUntilOption)
  waitUntil?: WaitUntilOption;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;
}
