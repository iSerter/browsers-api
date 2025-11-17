import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { SsrfUrlValidationPipe } from './ssrf-url-validation.pipe';

describe('SsrfUrlValidationPipe', () => {
  let pipe: SsrfUrlValidationPipe;
  let configService: ConfigService;
  let mockArgumentMetadata: ArgumentMetadata;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsrfUrlValidationPipe,
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

    pipe = module.get<SsrfUrlValidationPipe>(SsrfUrlValidationPipe);
    configService = module.get<ConfigService>(ConfigService);

    mockArgumentMetadata = {
      type: 'body',
      metatype: String,
      data: 'url',
    };

    // Mock DNS lookup function
    pipe['dnsLookup'] = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transform', () => {
    it('should return empty value without validation', async () => {
      const result = await pipe.transform('', mockArgumentMetadata);
      expect(result).toBe('');
    });

    it('should allow valid public URLs', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      const result = await pipe.transform('https://example.com', mockArgumentMetadata);
      expect(result).toBe('https://example.com');
    });

    it('should block localhost URLs', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      await expect(
        pipe.transform('http://localhost:3000', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block private IP ranges (10.0.0.0/8)', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '10.0.0.1', family: 4 });

      await expect(
        pipe.transform('http://10.0.0.1', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block private IP ranges (172.16.0.0/12)', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '172.16.0.1', family: 4 });

      await expect(
        pipe.transform('http://172.16.0.1', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block private IP ranges (192.168.0.0/16)', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '192.168.1.1', family: 4 });

      await expect(
        pipe.transform('http://192.168.1.1', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block metadata endpoints (169.254.169.254)', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '169.254.169.254', family: 4 });

      await expect(
        pipe.transform('http://169.254.169.254', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block invalid URL format', async () => {
      await expect(
        pipe.transform('not-a-url', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block URLs without protocol', async () => {
      await expect(
        pipe.transform('example.com', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block non-http/https protocols', async () => {
      await expect(
        pipe.transform('ftp://example.com', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block DNS resolution failures', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockRejectedValue(new Error('DNS resolution failed'));

      await expect(
        pipe.transform('https://invalid-domain-xyz123.com', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should respect allowlist when configured', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SSRF_ALLOWED_DOMAINS') {
          return 'example.com,allowed-domain.com';
        }
        return undefined;
      });

      // Recreate pipe with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SsrfUrlValidationPipe,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const pipeWithAllowlist = module.get<SsrfUrlValidationPipe>(SsrfUrlValidationPipe);
      pipeWithAllowlist['dnsLookup'] = jest.fn();

      // Allowed domain should pass
      (pipeWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });

      const result1 = await pipeWithAllowlist.transform(
        'https://example.com',
        mockArgumentMetadata,
      );
      expect(result1).toBe('https://example.com');

      // Subdomain of allowed domain should pass
      (pipeWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });
      const result2 = await pipeWithAllowlist.transform(
        'https://subdomain.example.com',
        mockArgumentMetadata,
      );
      expect(result2).toBe('https://subdomain.example.com');

      // Non-allowed domain should fail
      (pipeWithAllowlist['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '93.184.216.34', family: 4 });
      await expect(
        pipeWithAllowlist.transform('https://not-allowed.com', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log blocked attempts', async () => {
      const loggerSpy = jest.spyOn(pipe['logger'], 'warn');
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      try {
        await pipe.transform('http://localhost', mockArgumentMetadata);
      } catch (error) {
        // Expected to throw
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        'SSRF attempt blocked via pipe',
        expect.objectContaining({
          url: 'http://localhost',
          reason: expect.any(String),
        }),
      );
    });

    it('should handle IP address in hostname correctly', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });

      const result = await pipe.transform('http://8.8.8.8', mockArgumentMetadata);
      expect(result).toBe('http://8.8.8.8');
    });

    it('should block IP address mismatch (DNS rebinding attempt)', async () => {
      (pipe['dnsLookup'] as jest.Mock).mockResolvedValue({ address: '127.0.0.1', family: 4 });

      await expect(
        pipe.transform('http://8.8.8.8', mockArgumentMetadata),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

