import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey, ApiKeyStatus } from './entities/api-key.entity';
import { UrlPolicy, PolicyType } from './entities/url-policy.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateUrlPolicyDto } from './dto/create-url-policy.dto';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(UrlPolicy)
    private readonly urlPolicyRepository: Repository<UrlPolicy>,
  ) {}

  async generateApiKey(dto: CreateApiKeyDto): Promise<ApiKey> {
    // Generate cryptographically secure API key
    const key = crypto.randomBytes(32).toString('hex');

    const apiKey = this.apiKeyRepository.create({
      key,
      clientId: dto.clientId,
      name: dto.name,
      rateLimit: dto.rateLimit || 100,
      expiresAt: dto.expiresAt,
      status: ApiKeyStatus.ACTIVE,
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log(
      `Generated API key for client: ${dto.clientId} (${dto.name})`,
    );

    return saved;
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { key, isActive: true, status: ApiKeyStatus.ACTIVE },
    });

    if (!apiKey) {
      return null;
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      this.logger.warn(`API key ${apiKey.id} has expired`);
      return null;
    }

    // Update last used timestamp
    apiKey.lastUsedAt = new Date();
    await this.apiKeyRepository.save(apiKey);

    return apiKey;
  }

  async revokeApiKey(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    apiKey.isActive = false;
    apiKey.status = ApiKeyStatus.REVOKED;
    await this.apiKeyRepository.save(apiKey);

    this.logger.log(`Revoked API key: ${id}`);
  }

  async findAllApiKeys(): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findApiKeyById(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return apiKey;
  }

  async createUrlPolicy(dto: CreateUrlPolicyDto): Promise<UrlPolicy> {
    const policy = this.urlPolicyRepository.create({
      pattern: dto.pattern,
      type: dto.type || PolicyType.BLACKLIST,
      description: dto.description,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.urlPolicyRepository.save(policy);
    this.logger.log(`Created URL policy: ${dto.pattern} (${dto.type})`);

    return saved;
  }

  async findAllUrlPolicies(): Promise<UrlPolicy[]> {
    return this.urlPolicyRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findUrlPolicyById(id: string): Promise<UrlPolicy> {
    const policy = await this.urlPolicyRepository.findOne({ where: { id } });

    if (!policy) {
      throw new NotFoundException(`URL policy with ID ${id} not found`);
    }

    return policy;
  }

  async checkUrlAllowed(url: string): Promise<boolean> {
    const policies = await this.urlPolicyRepository.find({
      where: { isActive: true },
    });

    // Check blacklist first - if URL matches a blacklist pattern, it's blocked
    const blacklistPolicies = policies.filter(
      (p) => p.type === PolicyType.BLACKLIST,
    );
    for (const policy of blacklistPolicies) {
      if (this.matchesPattern(url, policy.pattern)) {
        this.logger.warn(`URL blocked by blacklist policy: ${policy.pattern}`);
        return false;
      }
    }

    // Check whitelist - if there are any whitelist policies, URL must match one
    const whitelistPolicies = policies.filter(
      (p) => p.type === PolicyType.WHITELIST,
    );
    if (whitelistPolicies.length > 0) {
      const isWhitelisted = whitelistPolicies.some((policy) =>
        this.matchesPattern(url, policy.pattern),
      );
      if (!isWhitelisted) {
        this.logger.warn(
          `URL not in whitelist: ${url} (allowed patterns: ${whitelistPolicies.map((p) => p.pattern).join(', ')})`,
        );
        return false;
      }
    }

    return true;
  }

  private matchesPattern(url: string, pattern: string): boolean {
    try {
      // Simple pattern matching
      const urlLower = url.toLowerCase();
      const patternLower = pattern.toLowerCase();

      // Support exact match, domain match, and wildcard
      if (pattern.includes('*')) {
        // Convert wildcard pattern to regex
        const regexPattern = patternLower.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(urlLower);
      }

      // Check if URL contains the pattern
      return (
        urlLower.includes(patternLower) || urlLower.startsWith(patternLower)
      );
    } catch (error) {
      this.logger.error(`Error matching pattern ${pattern}: ${error.message}`);
      return false;
    }
  }

  async deleteUrlPolicy(id: string): Promise<void> {
    const policy = await this.urlPolicyRepository.findOne({ where: { id } });

    if (!policy) {
      throw new NotFoundException(`URL policy with ID ${id} not found`);
    }

    await this.urlPolicyRepository.remove(policy);
    this.logger.log(`Deleted URL policy: ${id}`);
  }

  async deleteApiKey(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    await this.apiKeyRepository.remove(apiKey);
    this.logger.log(`Deleted API key: ${id}`);
  }
}
