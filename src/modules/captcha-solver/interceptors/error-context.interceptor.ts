import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { ErrorContextService } from '../services/error-context.service';

/**
 * Interceptor that sets up error context for each request.
 * Creates an AsyncLocalStorage context with correlation ID from the request.
 * 
 * Note: This interceptor should be applied at the controller level or globally.
 * The AsyncLocalStorage context will be available throughout the request lifecycle.
 */
@Injectable()
export class ErrorContextInterceptor implements NestInterceptor {
  constructor(private readonly errorContextService: ErrorContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const correlationId =
      (request as any).correlationId ||
      request.headers['x-correlation-id'] ||
      undefined;

    // Set up error context for this request using AsyncLocalStorage
    // The context will be available in all async operations within this request
    return new Observable((subscriber) => {
      // Run the handler within the error context scope
      this.errorContextService.run(correlationId, async () => {
        try {
          const observable = next.handle();
          observable.subscribe({
            next: (value) => {
              subscriber.next(value);
            },
            error: (error) => {
              subscriber.error(error);
            },
            complete: () => {
              subscriber.complete();
            },
          });
        } catch (error) {
          subscriber.error(error);
        }
      });
    });
  }
}

