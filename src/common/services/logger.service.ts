import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

@Injectable()
export class AppLoggerService implements NestLoggerService {
  log(message: string, context?: string) {
    this.formatLog('INFO', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.formatLog('ERROR', message, context, { trace });
  }

  warn(message: string, context?: string) {
    this.formatLog('WARN', message, context);
  }

  debug(message: string, context?: string) {
    if (process.env.LOG_LEVEL === 'debug') {
      this.formatLog('DEBUG', message, context);
    }
  }

  verbose(message: string, context?: string) {
    if (process.env.LOG_LEVEL === 'debug') {
      this.formatLog('VERBOSE', message, context);
    }
  }

  private formatLog(
    level: string,
    message: string,
    context?: string,
    metadata?: any,
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context || 'Application',
      message,
      ...(metadata && { metadata }),
      ...(process.env.NODE_ENV !== 'production' && {
        pid: process.pid,
      }),
    };

    const formattedLog = JSON.stringify(logEntry);

    switch (level) {
      case 'ERROR':
        console.error(formattedLog);
        break;
      case 'WARN':
        console.warn(formattedLog);
        break;
      case 'DEBUG':
      case 'VERBOSE':
        console.debug(formattedLog);
        break;
      default:
        console.log(formattedLog);
    }
  }
}
