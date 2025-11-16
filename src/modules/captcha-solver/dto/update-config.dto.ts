import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateConfigDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}
