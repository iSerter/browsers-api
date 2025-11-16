import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConfigDto {
  @ApiProperty({
    description: 'Configuration key to update',
    example: 'CAPTCHA_MIN_CONFIDENCE',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'New value for the configuration key',
    example: '0.7',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}
