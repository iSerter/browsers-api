import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, headers, ip } = req;

    // Extract client info
    const clientId = headers['x-api-key'] ? 'api-key-user' : 'anonymous';
    const userAgent = headers['user-agent'] || 'unknown';

    // Log request start
    this.logger.log(
      `${method} ${originalUrl} - ${clientId} - ${userAgent} - ${ip}`,
    );

    // Log request completion (middleware can't intercept response easily)
    // This will be handled by the response interceptor if needed
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.logger.log(
        `${method} ${originalUrl} ${res.statusCode} ${duration}ms`,
      );
    });

    next();
  }
}
