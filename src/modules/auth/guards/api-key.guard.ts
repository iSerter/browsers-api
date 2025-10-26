import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard extends AuthGuard('api-key') {
  private readonly logger = new Logger(ApiKeyGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    // Try to extract API key from headers
    const apiKey = this.extractApiKeyFromHeader(request);

    if (!apiKey) {
      this.logger.warn('No API key provided in request');
      throw new UnauthorizedException('API key is required');
    }

    // Set the API key as the token for Passport
    request.headers.authorization = `Bearer ${apiKey}`;

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      this.logger.warn(
        `API key validation failed: ${info?.message || err?.message}`,
      );
      throw err || new UnauthorizedException('Invalid or expired API key');
    }

    return user;
  }

  private extractApiKeyFromHeader(request: Request): string | null {
    // Try X-API-Key header first
    const apiKeyHeader = request.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Try Authorization header with Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
      }
    }

    return null;
  }
}
