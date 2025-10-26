import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AppLoggerService } from './common/services/logger.service';

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
    JobsModule,
    BrowsersModule,
    WorkersModule,
    ActionsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppLoggerService,
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
