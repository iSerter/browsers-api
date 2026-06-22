import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from './api-keys.service';

/**
 * Seeds a default API credential at application startup.
 *
 * When both `SEED_CLIENT_ID` and `SEED_API_KEY` are provided, an `ApiKey` record
 * is created the first time the app boots. The operation is idempotent: if a key
 * with the same value already exists, nothing is created. The key value is never
 * logged.
 */
@Injectable()
export class ApiKeysSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApiKeysSeeder.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const clientId = this.configService.get<string>('SEED_CLIENT_ID');
    const key = this.configService.get<string>('SEED_API_KEY');

    if (!clientId || !key) {
      if (clientId || key) {
        this.logger.warn(
          'Both SEED_CLIENT_ID and SEED_API_KEY must be set to seed a default credential — skipping.',
        );
      }
      return;
    }

    try {
      const { created } = await this.apiKeysService.ensureApiKey({
        clientId,
        key,
        name: 'Seeded default key',
      });

      this.logger.log(
        created
          ? `Seeded default API key for clientId="${clientId}".`
          : `Default API key for clientId="${clientId}" already exists — skipping.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to seed default API key for clientId="${clientId}": ${error.message}`,
      );
    }
  }
}
