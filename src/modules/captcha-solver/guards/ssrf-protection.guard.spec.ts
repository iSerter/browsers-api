import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { SsrfProtectionGuard } from './ssrf-protection.guard';

describe('SsrfProtectionGuard', () => {
  let guard: SsrfProtectionGuard;
  let configService: ConfigService;
  let mockExecutionContext: ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsrfProtectionGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'SSRF_ALLOWED_DOMAINS') {
                return defaultValue || '';
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<SsrfProtectionGuard>(SsrfProtectionGuard);
    configService = module.get<ConfigService>(ConfigService);

    // Mock execution context
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          body: {},
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'test-agent',
          },
        }),
      }),
    } as unknown as ExecutionContext;

    // Mock DNS lookup function
    guard['dnsLookup'] = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow requests without URL in body', async () => {
      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
    });

    it('should allow valid public URLs', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'https://example.com';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
    });

    it('should block localhost URLs', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://localhost:3000';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block private IP ranges (10.0.0.0/8)', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://10.0.0.1';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '10.0.0.1', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block private IP ranges (172.16.0.0/12)', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://172.16.0.1';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '172.16.0.1', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block private IP ranges (192.168.0.0/16)', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://192.168.1.1';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '192.168.1.1', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block metadata endpoints (169.254.169.254)', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://169.254.169.254';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '169.254.169.254', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block invalid URL format', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'not-a-url';

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block URLs without protocol', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'example.com';

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block non-http/https protocols', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'ftp://example.com';

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block DNS resolution failures', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'https://invalid-domain-xyz123.com';
      (guard['dnsLookup'] as jest.Mock).mockRejectedValue(new Error('DNS resolution failed'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should respect allowlist when configured', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SSRF_ALLOWED_DOMAINS') {
          return 'example.com,allowed-domain.com';
        }
        return undefined;
      });

      // Recreate guard with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SsrfProtectionGuard,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const guardWithAllowlist = module.get<SsrfProtectionGuard>(SsrfProtectionGuard);
      guardWithAllowlist['dnsLookup'] = jest.fn();

      // Allowed domain should pass
      mockExecutionContext.switchToHttp().getRequest().body.url = 'https://example.com';
      (guardWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      const result1 = await guardWithAllowlist.canActivate(mockExecutionContext);
      expect(result1).toBe(true);

      // Subdomain of allowed domain should pass
      mockExecutionContext.switchToHttp().getRequest().body.url = 'https://subdomain.example.com';
      (guardWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      const result2 = await guardWithAllowlist.canActivate(mockExecutionContext);
      expect(result2).toBe(true);

      // Non-allowed domain should fail
      mockExecutionContext.switchToHttp().getRequest().body.url = 'https://not-allowed.com';
      (guardWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      await expect(guardWithAllowlist.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should log blocked attempts', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'warn');
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://localhost';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (error) {
        // Expected to throw
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        'SSRF attempt blocked',
        expect.objectContaining({
          url: 'http://localhost',
          reason: expect.any(String),
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      );
    });

    it('should handle IP address in hostname correctly', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://8.8.8.8';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
    });

    it('should block IP address mismatch (DNS rebinding attempt)', async () => {
      mockExecutionContext.switchToHttp().getRequest().body.url = 'http://8.8.8.8';
      (guard['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

