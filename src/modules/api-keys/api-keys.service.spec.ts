import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeysService } from './api-keys.service';
import { ApiKey, ApiKeyStatus } from './entities/api-key.entity';
import { UrlPolicy } from './entities/url-policy.entity';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let apiKeyRepository: jest.Mocked<Repository<ApiKey>>;

  const mockApiKeyRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUrlPolicyRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockApiKeyRepository,
        },
        {
          provide: getRepositoryToken(UrlPolicy),
          useValue: mockUrlPolicyRepository,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    apiKeyRepository = module.get(getRepositoryToken(ApiKey));
  });

  describe('ensureApiKey', () => {
    const params = { clientId: 'default-client', key: 'fixed-key-value' };

    it('creates a new API key when none exists', async () => {
      const entity = {
        ...params,
        name: 'Seeded default key',
        rateLimit: 100,
        status: ApiKeyStatus.ACTIVE,
        isActive: true,
      } as ApiKey;
      apiKeyRepository.findOne.mockResolvedValue(null);
      apiKeyRepository.create.mockReturnValue(entity);
      apiKeyRepository.save.mockResolvedValue({ ...entity, id: 'uuid' });

      const result = await service.ensureApiKey(params);

      expect(apiKeyRepository.findOne).toHaveBeenCalledWith({
        where: { key: params.key },
      });
      expect(apiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: params.key,
          clientId: params.clientId,
          name: 'Seeded default key',
          rateLimit: 100,
          status: ApiKeyStatus.ACTIVE,
          isActive: true,
        }),
      );
      expect(apiKeyRepository.save).toHaveBeenCalled();
      expect(result.created).toBe(true);
    });

    it('does not create a duplicate when the key already exists', async () => {
      const existing = { id: 'uuid', ...params } as ApiKey;
      apiKeyRepository.findOne.mockResolvedValue(existing);

      const result = await service.ensureApiKey(params);

      expect(apiKeyRepository.create).not.toHaveBeenCalled();
      expect(apiKeyRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual({ created: false, apiKey: existing });
    });
  });
});
