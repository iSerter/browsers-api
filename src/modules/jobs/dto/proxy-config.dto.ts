import { IsString, IsOptional, ValidateIf, Matches } from 'class-validator';

export class ProxyConfigDto {
  @Matches(/^(https?|socks5):\/\/.+/, {
    message: 'proxy.server must be a valid URL with protocol (http://, https://, or socks5://)',
  })
  @IsString()
  server: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.username !== undefined)
  password?: string;
}

