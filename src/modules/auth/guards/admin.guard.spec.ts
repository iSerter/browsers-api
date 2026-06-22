import {
  ServiceUnavailableException,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const buildContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  const buildGuard = (adminPassword?: string) => {
    const configService = {
      get: jest.fn(() => adminPassword),
    } as unknown as ConfigService;
    return new AdminGuard(configService);
  };

  it('throws 503 when ADMIN_PASSWORD is not configured (fail-closed)', () => {
    const guard = buildGuard(undefined);
    expect(() =>
      guard.canActivate(buildContext({ 'x-admin-password': 'anything' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('throws 503 when ADMIN_PASSWORD is an empty string', () => {
    const guard = buildGuard('');
    expect(() =>
      guard.canActivate(buildContext({ 'x-admin-password': '' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('allows the request with a correct X-Admin-Password header', () => {
    const guard = buildGuard('s3cret');
    expect(
      guard.canActivate(buildContext({ 'x-admin-password': 's3cret' })),
    ).toBe(true);
  });

  it('allows the request with a correct Authorization: Bearer header', () => {
    const guard = buildGuard('s3cret');
    expect(
      guard.canActivate(buildContext({ authorization: 'Bearer s3cret' })),
    ).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const guard = buildGuard('s3cret');
    expect(() =>
      guard.canActivate(buildContext({ 'x-admin-password': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects when no password is provided', () => {
    const guard = buildGuard('s3cret');
    expect(() => guard.canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a password of different length without throwing', () => {
    const guard = buildGuard('s3cret');
    expect(() =>
      guard.canActivate(buildContext({ 'x-admin-password': 'longer-value' })),
    ).toThrow(UnauthorizedException);
  });
});
