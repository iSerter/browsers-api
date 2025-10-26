import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import { validationSchema } from './config/validation.schema';
import { JobsModule } from './modules/jobs/jobs.module';
import { BrowsersModule } from './modules/browsers/browsers.module';
import { WorkersModule } from './modules/workers/workers.module';
import { ActionsModule } from './modules/actions/actions.module';
import { HealthModule } from './modules/health/health.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AdminModule } from './modules/admin/admin.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AppLoggerService } from './common/services/logger.service';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { throttleConfig } from './modules/auth/config/throttle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      validationSchema,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        if (!dbConfig) {
          throw new Error('Database configuration not found');
        }
        return dbConfig;
      },
    }),
    ThrottlerModule.forRoot(throttleConfig),
    JobsModule,
    BrowsersModule,
    WorkersModule,
    ActionsModule,
    HealthModule,
    ApiKeysModule,
    MetricsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLoggerService,
    CorrelationIdMiddleware,
    LoggingMiddleware,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
