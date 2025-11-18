import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isURL } from 'validator';
import * as dns from 'dns';

/**
 * SSRF Protection Guard
 * 
 * Prevents Server-Side Request Forgery attacks by:
 * - Validating URL format
 * - Blocking private IP ranges
 * - Blocking localhost and metadata endpoints
 * - Performing DNS resolution checks to prevent DNS rebinding
 * - Supporting allowlist for permitted domains
 */
@Injectable()
export class SsrfProtectionGuard implements CanActivate {
  private readonly logger = new Logger(SsrfProtectionGuard.name);

  // Private IP ranges (CIDR notation)
  private readonly privateIpRanges: Array<{ start: number; end: number }> = [
    { start: this.ipToNumber('10.0.0.0')!, end: this.ipToNumber('10.255.255.255')! }, // 10.0.0.0/8
    { start: this.ipToNumber('172.16.0.0')!, end: this.ipToNumber('172.31.255.255')! }, // 172.16.0.0/12
    { start: this.ipToNumber('192.168.0.0')!, end: this.ipToNumber('192.168.255.255')! }, // 192.168.0.0/16
    { start: this.ipToNumber('127.0.0.0')!, end: this.ipToNumber('127.255.255.255')! }, // 127.0.0.0/8
  ];

  // Blocked hostnames
  private readonly blockedHostnames = [
    'localhost',
    '0.0.0.0',
    '127.0.0.1',
    '::1',
    'metadata.google.internal',
    '169.254.169.254', // AWS/GCP metadata endpoint
  ];

  // Blocked IP addresses
  private readonly blockedIps = [
    '0.0.0.0',
    '127.0.0.1',
    '::1',
    '169.254.169.254', // AWS/GCP metadata endpoint
  ];

  private readonly allowedDomains: string[];

  constructor(private readonly configService: ConfigService) {
    // Load allowed domains from configuration
    const allowedDomainsEnv = this.configService.get<string>(
      'SSRF_ALLOWED_DOMAINS',
      '',
    );
    this.allowedDomains = allowedDomainsEnv
      ? allowedDomainsEnv.split(',').map((d) => d.trim().toLowerCase())
      : [];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;

    // Extract URL from request body
    const url = body?.url;
    if (!url) {
      // No URL in request, allow through (other validators will catch missing URL)
      return true;
    }

    try {
      await this.validateUrl(url);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Invalid URL';
      
      // Log blocked attempt for security monitoring
      this.logger.warn('SSRF attempt blocked', {
        url,
        reason: errorMessage,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      throw new BadRequestException(
        `URL validation failed: ${errorMessage}`,
      );
    }
  }

  /**
   * Validates a URL for SSRF protection
   */
  private async validateUrl(url: string): Promise<void> {
    // Step 1: Validate URL format
    if (!isURL(url, { require_protocol: true, protocols: ['http', 'https'] })) {
      throw new Error('Invalid URL format. Only http and https protocols are allowed.');
    }

    // Step 2: Parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error('Failed to parse URL');
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Step 3: Check allowlist (if configured)
    if (this.allowedDomains.length > 0) {
      const isAllowed = this.allowedDomains.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });

      if (!isAllowed) {
        throw new Error(
          `Domain not in allowlist. Allowed domains: ${this.allowedDomains.join(', ')}`,
        );
      }
    }

    // Step 4: Check blocked hostnames
    if (this.blockedHostnames.includes(hostname)) {
      throw new Error(`Blocked hostname: ${hostname}`);
    }

    // Step 5: Resolve DNS to get actual IP address (prevents DNS rebinding)
    let resolvedIp: string;
    try {
      const lookupResult = await dns.promises.lookup(hostname, { family: 4 });
      resolvedIp = lookupResult.address;
    } catch (error) {
      // If DNS lookup fails, we can't verify the IP, so block it for safety
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }

    // Step 6: Check blocked IPs
    if (this.blockedIps.includes(resolvedIp)) {
      throw new Error(`Blocked IP address: ${resolvedIp}`);
    }

    // Step 7: Check private IP ranges
    if (this.isPrivateIp(resolvedIp)) {
      throw new Error(
        `Private IP address not allowed: ${resolvedIp}`,
      );
    }

    // Step 8: Additional check - ensure resolved IP matches hostname if hostname is an IP
    if (this.isIpAddress(hostname)) {
      if (hostname !== resolvedIp) {
        throw new Error(
          `IP address mismatch: hostname ${hostname} resolved to ${resolvedIp}`,
        );
      }
    }
  }

  /**
   * Checks if an IP address is in a private range
   */
  private isPrivateIp(ip: string): boolean {
    const ipNum = this.ipToNumber(ip);
    if (ipNum === null) {
      return false; // Invalid IP, let other validators handle it
    }

    return this.privateIpRanges.some(
      (range) => ipNum >= range.start && ipNum <= range.end,
    );
  }

  /**
   * Converts an IP address string to a number for range comparison
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    const nums = parts.map((part) => parseInt(part, 10));
    if (nums.some((num) => isNaN(num) || num < 0 || num > 255)) {
      return null;
    }

    return nums[0] * 256 * 256 * 256 + nums[1] * 256 * 256 + nums[2] * 256 + nums[3];
  }

  /**
   * Checks if a string is an IP address
   */
  private isIpAddress(str: string): boolean {
    const parts = str.split('.');
    if (parts.length !== 4) {
      return false;
    }

    return parts.every(
      (part) => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255;
      },
    );
  }
}

