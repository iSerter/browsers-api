import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { ApiKeysService } from '../../api-keys/api-keys.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super();
  }

  async validate(token: string): Promise<any> {
    const apiKey = await this.apiKeysService.validateApiKey(token);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Return user object with API key info
    return {
      apiKeyId: apiKey.id,
      clientId: apiKey.clientId,
      name: apiKey.name,
      rateLimit: apiKey.rateLimit,
    };
  }
}

