import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaptchaSolverController } from './captcha-solver.controller';
import { CaptchaSolverService } from './captcha-solver.service';
import { DetectionService } from './services/detection.service';
import { ConfidenceScoringService } from './services/confidence-scoring.service';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { BrowsersModule } from '../browsers/browsers.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CaptchaSolverConfig]),
    BrowsersModule,
  ],
  controllers: [CaptchaSolverController],
  providers: [CaptchaSolverService, DetectionService, ConfidenceScoringService],
  exports: [CaptchaSolverService, DetectionService, ConfidenceScoringService],
})
export class CaptchaSolverModule {}
