import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostTrackingService } from './cost-tracking.service';
import { CaptchaSolverApiKey } from '../entities/api-key.entity';

describe('CostTrackingService', () => {
  let service: CostTrackingService;
  let apiKeyRepository: jest.Mocked<Repository<CaptchaSolverApiKey>>;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostTrackingService,
        {
          provide: getRepositoryToken(CaptchaSolverApiKey),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CostTrackingService>(CostTrackingService);
    apiKeyRepository = module.get(getRepositoryToken(CaptchaSolverApiKey));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize successfully', async () => {
      await service.onModuleInit();
      expect(service).toBeDefined();
    });
  });

  describe('recordSuccess', () => {
    it('should record a successful solve with correct cost', () => {
      const provider = '2captcha';
      const challengeType = 'recaptcha';
      const taskId = 'test-task-123';

      service.recordSuccess(provider, challengeType, taskId);

      const stats = service.getUsageStatistics(provider);
      expect(stats.totalUses).toBe(1);
      expect(stats.totalCost).toBe(0.002);
      expect(stats.byChallengeType[challengeType].count).toBe(1);
      expect(stats.byChallengeType[challengeType].cost).toBe(0.002);
    });

    it('should use default cost for unknown challenge type', () => {
      const provider = '2captcha';
      const challengeType = 'unknown-type';

      service.recordSuccess(provider, challengeType);

      const stats = service.getUsageStatistics(provider);
      expect(stats.totalCost).toBe(0.002); // Default cost
    });

    it('should use default cost for unknown provider', () => {
      const provider = 'unknown-provider';
      const challengeType = 'recaptcha';

      service.recordSuccess(provider, challengeType);

      const stats = service.getUsageStatistics(provider);
      expect(stats.totalCost).toBe(0.002); // Default cost
    });

    it('should limit in-memory entries to maxInMemoryEntries', () => {
      const provider = '2captcha';
      const challengeType = 'recaptcha';

      // Add more entries than maxInMemoryEntries (1000)
      for (let i = 0; i < 1001; i++) {
        service.recordSuccess(provider, challengeType, `task-${i}`);
      }

      const stats = service.getUsageStatistics(provider);
      // Should only keep the last 1000 entries
      expect(stats.totalUses).toBe(1000);
    });

    it('should record timestamp correctly', () => {
      const provider = 'anticaptcha';
      const challengeType = 'hcaptcha';
      const beforeTime = new Date();

      service.recordSuccess(provider, challengeType);

      const afterTime = new Date();
      const stats = service.getUsageStatistics(provider);
      expect(stats.lastUsed).toBeDefined();
      expect(stats.lastUsed!.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(stats.lastUsed!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('getUsageStatistics', () => {
    it('should return correct statistics for a provider', () => {
      const provider = '2captcha';

      service.recordSuccess(provider, 'recaptcha', 'task-1');
      service.recordSuccess(provider, 'recaptcha', 'task-2');
      service.recordSuccess(provider, 'hcaptcha', 'task-3');

      const stats = service.getUsageStatistics(provider);

      expect(stats.provider).toBe(provider);
      expect(stats.totalUses).toBe(3);
      expect(stats.totalCost).toBe(0.006); // 3 * 0.002
      expect(stats.successCount).toBe(3);
      expect(stats.failureCount).toBe(0);
      expect(stats.byChallengeType['recaptcha'].count).toBe(2);
      expect(stats.byChallengeType['hcaptcha'].count).toBe(1);
    });

    it('should return empty statistics for provider with no entries', () => {
      const stats = service.getUsageStatistics('unknown-provider');

      expect(stats.provider).toBe('unknown-provider');
      expect(stats.totalUses).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(Object.keys(stats.byChallengeType)).toHaveLength(0);
    });

    it('should calculate lastUsed correctly', () => {
      const provider = 'anticaptcha';

      service.recordSuccess(provider, 'recaptcha');
      // Wait a bit to ensure different timestamps
      const laterTime = new Date();
      laterTime.setMilliseconds(laterTime.getMilliseconds() + 10);

      service.recordSuccess(provider, 'hcaptcha');

      const stats = service.getUsageStatistics(provider);
      expect(stats.lastUsed).toBeDefined();
    });

    it('should aggregate costs by challenge type', () => {
      const provider = '2captcha';

      service.recordSuccess(provider, 'recaptcha');
      service.recordSuccess(provider, 'recaptcha');
      service.recordSuccess(provider, 'datadome'); // Different cost

      const stats = service.getUsageStatistics(provider);

      expect(stats.byChallengeType['recaptcha'].count).toBe(2);
      expect(stats.byChallengeType['recaptcha'].cost).toBe(0.004); // 2 * 0.002
      expect(stats.byChallengeType['datadome'].count).toBe(1);
      expect(stats.byChallengeType['datadome'].cost).toBe(0.003); // 1 * 0.003
    });
  });

  describe('getAllUsageStatistics', () => {
    it('should return statistics for all providers', () => {
      service.recordSuccess('2captcha', 'recaptcha');
      service.recordSuccess('anticaptcha', 'hcaptcha');
      service.recordSuccess('2captcha', 'datadome');

      const allStats = service.getAllUsageStatistics();

      expect(allStats).toHaveLength(2);
      expect(allStats.find((s) => s.provider === '2captcha')).toBeDefined();
      expect(allStats.find((s) => s.provider === 'anticaptcha')).toBeDefined();
    });

    it('should return empty array when no entries exist', () => {
      const allStats = service.getAllUsageStatistics();
      expect(allStats).toEqual([]);
    });
  });

  describe('getTotalCost', () => {
    it('should return total cost across all providers', () => {
      service.recordSuccess('2captcha', 'recaptcha'); // 0.002
      service.recordSuccess('anticaptcha', 'hcaptcha'); // 0.001
      service.recordSuccess('2captcha', 'datadome'); // 0.003

      const totalCost = service.getTotalCost();
      expect(totalCost).toBe(0.006); // 0.002 + 0.001 + 0.003
    });

    it('should return 0 when no entries exist', () => {
      const totalCost = service.getTotalCost();
      expect(totalCost).toBe(0);
    });
  });

  describe('getCostForPeriod', () => {
    it('should return cost for entries within date range', () => {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 2);

      service.recordSuccess('2captcha', 'recaptcha');

      const endDate = new Date();
      endDate.setHours(endDate.getHours() + 1);

      const cost = service.getCostForPeriod(startDate, endDate);
      expect(cost).toBe(0.002);
    });

    it('should exclude entries outside date range', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 5);

      // Manually add entry with old timestamp (simulating old entry)
      const serviceAny = service as any;
      serviceAny.costTracking.push({
        provider: '2captcha',
        challengeType: 'recaptcha',
        cost: 0.002,
        timestamp: oldDate,
      });

      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 2);
      const endDate = new Date();

      const cost = service.getCostForPeriod(startDate, endDate);
      expect(cost).toBe(0); // Old entry excluded
    });

    it('should handle empty date range', () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      service.recordSuccess('2captcha', 'recaptcha');

      const cost = service.getCostForPeriod(futureDate, futureDate);
      expect(cost).toBe(0);
    });
  });

  describe('clearOldEntries', () => {
    it('should clear entries older than specified days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago

      // Manually add old entry
      const serviceAny = service as any;
      serviceAny.costTracking.push({
        provider: '2captcha',
        challengeType: 'recaptcha',
        cost: 0.002,
        timestamp: oldDate,
      });

      // Add recent entry
      service.recordSuccess('anticaptcha', 'hcaptcha');

      service.clearOldEntries(30); // Keep last 30 days

      const allStats = service.getAllUsageStatistics();
      expect(allStats).toHaveLength(1);
      expect(allStats[0].provider).toBe('anticaptcha');
    });

    it('should keep entries within the retention period', () => {
      service.recordSuccess('2captcha', 'recaptcha');
      service.recordSuccess('anticaptcha', 'hcaptcha');

      service.clearOldEntries(30);

      const allStats = service.getAllUsageStatistics();
      expect(allStats).toHaveLength(2);
    });

    it('should use default retention period of 30 days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      const serviceAny = service as any;
      serviceAny.costTracking.push({
        provider: '2captcha',
        challengeType: 'recaptcha',
        cost: 0.002,
        timestamp: oldDate,
      });

      service.recordSuccess('anticaptcha', 'hcaptcha');

      service.clearOldEntries(); // Default 30 days

      const allStats = service.getAllUsageStatistics();
      expect(allStats).toHaveLength(1);
    });

    it('should not log when no entries are cleared', () => {
      service.recordSuccess('2captcha', 'recaptcha');

      const logSpy = jest.spyOn(service['logger'], 'log');
      service.clearOldEntries(30);

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('Provider cost calculations', () => {
    it('should use correct cost for 2captcha recaptcha', () => {
      service.recordSuccess('2captcha', 'recaptcha');
      const stats = service.getUsageStatistics('2captcha');
      expect(stats.totalCost).toBe(0.002);
    });

    it('should use correct cost for 2captcha datadome', () => {
      service.recordSuccess('2captcha', 'datadome');
      const stats = service.getUsageStatistics('2captcha');
      expect(stats.totalCost).toBe(0.003);
    });

    it('should use correct cost for anticaptcha recaptcha', () => {
      service.recordSuccess('anticaptcha', 'recaptcha');
      const stats = service.getUsageStatistics('anticaptcha');
      expect(stats.totalCost).toBe(0.001);
    });

    it('should use correct cost for anticaptcha hcaptcha', () => {
      service.recordSuccess('anticaptcha', 'hcaptcha');
      const stats = service.getUsageStatistics('anticaptcha');
      expect(stats.totalCost).toBe(0.001);
    });
  });
});

