import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowsersController } from './browsers.controller';
import { BrowsersService } from './browsers.service';
import { BrowserType } from './entities/browser-type.entity';
import { BrowserPoolService } from './services/browser-pool.service';
import { BrowserContextManagerService } from './services/browser-context-manager.service';

@Module({
  imports: [TypeOrmModule.forFeature([BrowserType])],
  controllers: [BrowsersController],
  providers: [
    BrowsersService,
    BrowserPoolService,
    BrowserContextManagerService,
  ],
  exports: [BrowsersService, BrowserPoolService, BrowserContextManagerService],
})
export class BrowsersModule {}

