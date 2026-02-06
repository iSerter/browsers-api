import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CaptchaSolverController } from './captcha-solver.controller';
import { CaptchaSolverService } from './captcha-solver.service';
import { DetectionService } from './services/detection.service';
import { ConfidenceScoringService } from './services/confidence-scoring.service';
import { DetectionRegistryService } from './services/detection-registry.service';
import { HumanBehaviorSimulationService } from './services/human-behavior-simulation.service';
import { CaptchaWidgetInteractionService } from './services/captcha-widget-interaction.service';
import { AudioCaptchaProcessingService } from './services/audio-captcha-processing.service';
import { ApiKeyValidationService } from './services/api-key-validation.service';
import { ApiKeyManagerService } from './services/api-key-manager.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { CostTrackingService } from './services/cost-tracking.service';
import { SolverOrchestrationService } from './services/solver-orchestration.service';
import { CaptchaSolverConfig } from './entities/captcha-solver-config.entity';
import { CaptchaSolverApiKey } from './entities/api-key.entity';
import { BrowsersModule } from '../browsers/browsers.module';
import {
  SolverRegistry,
  SolverFactory,
  SolverHealthChecker,
  SolverPerformanceTracker,
} from './factories';
import { NativeSolverRegistryService } from './services/native-solver-registry.service';
import { WinstonLoggerService } from '../../common/services/winston-logger.service';
import { CaptchaLoggingService } from './services/captcha-logging.service';
import { CaptchaSolverConfigService } from './config';
import { SolverCircuitBreakerService } from './services/solver-circuit-breaker.service';
import { DetectionCacheService } from './services/detection-cache.service';
import { ErrorContextService } from './services/error-context.service';
import { ErrorAggregationService } from './services/error-aggregation.service';
import { SsrfProtectionGuard } from './guards/ssrf-protection.guard';
import { SsrfUrlValidationPipe } from './pipes/ssrf-url-validation.pipe';
import { CaptchaMetricsService } from './metrics/captcha-metrics.service';
import { CapMonsterProvider } from './providers';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([CaptchaSolverConfig, CaptchaSolverApiKey]),
    BrowsersModule,
  ],
  controllers: [CaptchaSolverController],
  providers: [
    CaptchaSolverService,
    DetectionService,
    {
      provide: ConfidenceScoringService,
      useFactory: () => new ConfidenceScoringService(),
    },
    DetectionRegistryService,
    HumanBehaviorSimulationService,
    CaptchaWidgetInteractionService,
    AudioCaptchaProcessingService,
    ApiKeyValidationService,
    ApiKeyManagerService,
    ProviderRegistryService,
    CostTrackingService,
    SolverOrchestrationService,
    SolverRegistry,
    SolverFactory,
    SolverHealthChecker,
    {
      provide: SolverPerformanceTracker,
      useFactory: () => new SolverPerformanceTracker(),
    },
    NativeSolverRegistryService,
    WinstonLoggerService,
    CaptchaLoggingService,
    CaptchaSolverConfigService,
    SolverCircuitBreakerService,
    DetectionCacheService,
    ErrorContextService,
    ErrorAggregationService,
    SsrfProtectionGuard,
    SsrfUrlValidationPipe,
    CaptchaMetricsService,
    CapMonsterProvider,
  ],
  exports: [
    CaptchaSolverService,
    DetectionService,
    ConfidenceScoringService,
    DetectionRegistryService,
    HumanBehaviorSimulationService,
    CaptchaWidgetInteractionService,
    AudioCaptchaProcessingService,
    ApiKeyManagerService,
    ProviderRegistryService,
    CostTrackingService,
    SolverOrchestrationService,
    SolverRegistry,
    SolverFactory,
    SolverHealthChecker,
    SolverPerformanceTracker,
    CaptchaLoggingService,
    CaptchaSolverConfigService,
    SolverCircuitBreakerService,
    DetectionCacheService,
    ErrorContextService,
    ErrorAggregationService,
    CaptchaMetricsService,
    CapMonsterProvider,
  ],
})
export class CaptchaSolverModule {}
