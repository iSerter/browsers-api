import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { BrowserWorker } from './entities/browser-worker.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BrowserWorker])],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService, TypeOrmModule],
})
export class WorkersModule {}
