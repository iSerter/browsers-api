import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowsersController } from './browsers.controller';
import { BrowsersService } from './browsers.service';
import { BrowserType } from './entities/browser-type.entity';
import { BrowserPoolService } from './services/browser-pool.service';
import { BrowserContextManagerService } from './services/browser-context-manager.service';
import { StealthService } from './services/stealth.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BrowserType]),
  ],
  controllers: [BrowsersController],
  providers: [
    BrowsersService,
    BrowserPoolService,
    BrowserContextManagerService,
    StealthService,
  ],
  exports: [
    BrowsersService,
    BrowserPoolService,
    BrowserContextManagerService,
    StealthService,
  ],
})
export class BrowsersModule {}
