import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startTime = Date.now();
    const correlationId = req.headers['x-correlation-id'] as string;

    // Log request
    this.logger.log(
      `Incoming Request: ${method} ${originalUrl} [${correlationId}]`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const logLevel = statusCode >= 400 ? 'error' : 'log';

      this.logger[logLevel](
        `Request Completed: ${method} ${originalUrl} ${statusCode} ${duration}ms [${correlationId}]`,
      );
    });

    next();
  }
}

