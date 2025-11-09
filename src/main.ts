import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/services/logger.service';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Get config service
  const configService = app.get(ConfigService);

  // Set up custom logger
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  // Apply middleware for correlation ID and request logging
  app.use((req, res, next) => {
    const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    correlationIdMiddleware.use(req, res, next);
  });

  app.use((req, res, next) => {
    const loggingMiddleware = app.get(LoggingMiddleware);
    loggingMiddleware.use(req, res, next);
  });

  // Set global prefix
  const apiPrefix = configService.get('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      transform: true, // Automatically transform payloads to DTO instances
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transformOptions: {
        enableImplicitConversion: true, // Automatically convert types
      },
    }),
  );

  // Enable CORS if needed
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = configService.get('PORT', 3333);
  await app.listen(port);

  logger.log(
    `Application is running on: http://localhost:${port}/${apiPrefix}`,
    'Bootstrap',
  );
  logger.log(
    `Health check available at: http://localhost:${port}/health`,
    'Bootstrap',
  );
  logger.log(
    `Metrics available at: http://localhost:${port}/metrics`,
    'Bootstrap',
  );
}

bootstrap();
