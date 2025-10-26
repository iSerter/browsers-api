import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const environment = this.configService.get<string>('NODE_ENV', 'development');
    const isDevelopment = environment === 'development';

    this.logger = winston.createLogger({
      level: isDevelopment ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        isDevelopment
          ? winston.format.colorize()
          : winston.format.uncolorize(),
        winston.format.splat(),
        isDevelopment
          ? winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
              const contextStr = context ? `[${context}]` : '';
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} ${level} ${contextStr} ${message} ${metaStr}`;
            })
          : winston.format.json(),
      ),
      defaultMeta: {
        service: 'browsers-api',
      },
      transports: [
        new winston.transports.Console({
          stderrLevels: ['error'],
        }),
      ],
    });
  }

  log(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.info(message, { context, ...metadata });
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logger.error(message, { context, trace, ...metadata });
  }

  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.warn(message, { context, ...metadata });
  }

  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.debug(message, { context, ...metadata });
  }

  verbose(message: string, context?: string, metadata?: Record<string, any>): void {
    this.logger.verbose(message, { context, ...metadata });
  }

  getLogger(): winston.Logger {
    return this.logger;
  }
}

