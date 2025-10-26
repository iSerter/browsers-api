import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowsersController } from './browsers.controller';
import { BrowsersService } from './browsers.service';
import { BrowserType } from './entities/browser-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BrowserType])],
  controllers: [BrowsersController],
  providers: [BrowsersService],
  exports: [BrowsersService],
})
export class BrowsersModule {}

