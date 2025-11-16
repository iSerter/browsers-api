import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';

/**
 * Cost tracking entry
 */
export interface CostTrackingEntry {
  provider: string;
  challengeType: string;
  cost: number;
  timestamp: Date;
  taskId?: string;
}

/**
 * Usage statistics
 */
export interface UsageStatistics {
  provider: string;
  totalUses: number;
  totalCost: number;
  successCount: number;
  failureCount: number;
  byChallengeType: Record<string, {
    count: number;
    cost: number;
  }>;
  lastUsed?: Date;
}

/**
 * Service for tracking costs and usage of captcha solver providers
 */
@Injectable()
export class CostTrackingService implements OnModuleInit {
  private readonly logger = new Logger(CostTrackingService.name);
  private readonly costTracking: CostTrackingEntry[] = [];
  private readonly maxInMemoryEntries = 1000;

  // Provider cost per challenge type (in USD)
  private readonly providerCosts: Record<string, Record<string, number>> = {
    '2captcha': {
      recaptcha: 0.002, // $2.00 per 1000
      hcaptcha: 0.002,
      datadome: 0.003,
      funcaptcha: 0.002,
    },
    anticaptcha: {
      recaptcha: 0.001, // $1.00 per 1000
      hcaptcha: 0.001,
      datadome: 0.002,
      funcaptcha: 0.001,
    },
  };

  constructor(
    @InjectRepository(CaptchaSolverApiKey)
    private readonly apiKeyRepository: Repository<CaptchaSolverApiKey>,
  ) {}

  async onModuleInit() {
    this.logger.log('Cost Tracking Service initialized');
  }

  /**
   * Record a successful captcha solve
   */
  recordSuccess(
    provider: string,
    challengeType: string,
    taskId?: string,
  ): void {
    const cost = this.getCost(provider, challengeType);
    const entry: CostTrackingEntry = {
      provider,
      challengeType,
      cost,
      timestamp: new Date(),
      taskId,
    };

    this.costTracking.push(entry);

    // Keep only recent entries in memory
    if (this.costTracking.length > this.maxInMemoryEntries) {
      this.costTracking.shift();
    }

    this.logger.debug(
      `Recorded ${provider} solve for ${challengeType}: $${cost.toFixed(4)}`,
    );
  }

  /**
   * Get cost for a provider and challenge type
   */
  private getCost(provider: string, challengeType: string): number {
    return (
      this.providerCosts[provider]?.[challengeType] ||
      this.providerCosts[provider]?.['recaptcha'] ||
      0.002
    );
  }

  /**
   * Get usage statistics for a provider
   */
  getUsageStatistics(provider: string): UsageStatistics {
    const entries = this.costTracking.filter((e) => e.provider === provider);
    const byChallengeType: Record<string, { count: number; cost: number }> = {};

    let totalCost = 0;
    let lastUsed: Date | undefined;

    for (const entry of entries) {
      totalCost += entry.cost;
      if (!lastUsed || entry.timestamp > lastUsed) {
        lastUsed = entry.timestamp;
      }

      if (!byChallengeType[entry.challengeType]) {
        byChallengeType[entry.challengeType] = { count: 0, cost: 0 };
      }
      byChallengeType[entry.challengeType].count += 1;
      byChallengeType[entry.challengeType].cost += entry.cost;
    }

    // Get success/failure counts from API key repository
    // This is a simplified version - in production, you might want to track this separately
    const successCount = entries.length;
    const failureCount = 0; // Would need separate tracking

    return {
      provider,
      totalUses: entries.length,
      totalCost,
      successCount,
      failureCount,
      byChallengeType,
      lastUsed,
    };
  }

  /**
   * Get usage statistics for all providers
   */
  getAllUsageStatistics(): UsageStatistics[] {
    const providers = new Set(this.costTracking.map((e) => e.provider));
    return Array.from(providers).map((provider) =>
      this.getUsageStatistics(provider),
    );
  }

  /**
   * Get total cost across all providers
   */
  getTotalCost(): number {
    return this.costTracking.reduce((sum, entry) => sum + entry.cost, 0);
  }

  /**
   * Get cost for a specific time period
   */
  getCostForPeriod(startDate: Date, endDate: Date): number {
    return this.costTracking
      .filter(
        (entry) =>
          entry.timestamp >= startDate && entry.timestamp <= endDate,
      )
      .reduce((sum, entry) => sum + entry.cost, 0);
  }

  /**
   * Clear old tracking entries (older than specified days)
   */
  clearOldEntries(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialLength = this.costTracking.length;
    const filtered = this.costTracking.filter(
      (entry) => entry.timestamp >= cutoffDate,
    );

    this.costTracking.length = 0;
    this.costTracking.push(...filtered);

    const removed = initialLength - this.costTracking.length;
    if (removed > 0) {
      this.logger.log(`Cleared ${removed} old cost tracking entries`);
    }
  }
}

