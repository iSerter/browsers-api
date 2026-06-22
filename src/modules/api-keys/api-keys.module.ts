import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysSeeder } from './api-keys.seeder';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ApiKey } from './entities/api-key.entity';
import { UrlPolicy } from './entities/url-policy.entity';
import { ApiKeyStrategy } from '../auth/strategies/api-key.strategy';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, UrlPolicy]), PassportModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyStrategy, ApiKeysSeeder, AdminGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
