import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Protects administrative endpoints (e.g. API-key management) with a shared
 * admin password supplied via the `ADMIN_PASSWORD` environment variable.
 *
 * Fail-closed: if `ADMIN_PASSWORD` is unset/empty the admin API is considered
 * disabled and every request is rejected with 503. This prevents the
 * administrative surface from being accidentally exposed when unconfigured.
 *
 * The password may be sent as either:
 *   - `X-Admin-Password: <password>`
 *   - `Authorization: Bearer <password>`
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.configService.get<string>('ADMIN_PASSWORD');

    if (!configured) {
      this.logger.warn(
        'Admin API access attempted but ADMIN_PASSWORD is not configured — denying.',
      );
      throw new ServiceUnavailableException(
        'Admin API is disabled. Set ADMIN_PASSWORD to enable it.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.extractPassword(request);

    if (!provided || !this.safeEqual(provided, configured)) {
      this.logger.warn('Admin API access denied: missing or invalid password.');
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return true;
  }

  private extractPassword(request: Request): string | null {
    const headerValue = request.headers['x-admin-password'];
    if (typeof headerValue === 'string' && headerValue.length > 0) {
      return headerValue;
    }

    const authHeader = request.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
      }
    }

    return null;
  }

  /**
   * Constant-time comparison to avoid leaking the password via timing.
   */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still run a comparison to keep timing roughly constant.
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
