import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiKeysSeeder } from './api-keys.seeder';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysSeeder', () => {
  let seeder: ApiKeysSeeder;
  let configService: { get: jest.Mock };
  let apiKeysService: { ensureApiKey: jest.Mock };

  const buildConfig = (vars: Record<string, string | undefined>) => ({
    get: jest.fn((name: string) => vars[name]),
  });

  const createSeeder = async (vars: Record<string, string | undefined>) => {
    configService = buildConfig(vars);
    apiKeysService = { ensureApiKey: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysSeeder,
        { provide: ConfigService, useValue: configService },
        { provide: ApiKeysService, useValue: apiKeysService },
      ],
    }).compile();

    seeder = module.get<ApiKeysSeeder>(ApiKeysSeeder);
  };

  it('seeds a credential when both SEED_CLIENT_ID and SEED_API_KEY are set', async () => {
    await createSeeder({
      SEED_CLIENT_ID: 'default-client',
      SEED_API_KEY: 'fixed-key-value',
    });
    apiKeysService.ensureApiKey.mockResolvedValue({ created: true });

    await seeder.onApplicationBootstrap();

    expect(apiKeysService.ensureApiKey).toHaveBeenCalledWith({
      clientId: 'default-client',
      key: 'fixed-key-value',
      name: 'Seeded default key',
    });
  });

  it('is idempotent when the key already exists', async () => {
    await createSeeder({
      SEED_CLIENT_ID: 'default-client',
      SEED_API_KEY: 'fixed-key-value',
    });
    apiKeysService.ensureApiKey.mockResolvedValue({ created: false });

    await seeder.onApplicationBootstrap();

    expect(apiKeysService.ensureApiKey).toHaveBeenCalledTimes(1);
  });

  it('skips seeding when neither var is set', async () => {
    await createSeeder({});

    await seeder.onApplicationBootstrap();

    expect(apiKeysService.ensureApiKey).not.toHaveBeenCalled();
  });

  it('skips seeding when only one var is set', async () => {
    await createSeeder({ SEED_CLIENT_ID: 'default-client' });

    await seeder.onApplicationBootstrap();

    expect(apiKeysService.ensureApiKey).not.toHaveBeenCalled();
  });

  it('swallows errors from the service so startup is not blocked', async () => {
    await createSeeder({
      SEED_CLIENT_ID: 'default-client',
      SEED_API_KEY: 'fixed-key-value',
    });
    apiKeysService.ensureApiKey.mockRejectedValue(new Error('db down'));

    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
