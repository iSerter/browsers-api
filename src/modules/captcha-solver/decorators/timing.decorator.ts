import { ErrorContextService } from '../services/error-context.service';

/**
 * Decorator to automatically track timing for solver methods.
 * Records start, end, and duration in the error context.
 *
 * @example
 * ```typescript
 * class MySolver {
 *   @Timing()
 *   async solve(params: CaptchaParams): Promise<CaptchaSolution> {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function Timing() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const errorContextService: ErrorContextService | undefined =
        (this as any).errorContextService;

      if (!errorContextService) {
        // If ErrorContextService is not available, just call the original method
        return originalMethod.apply(this, args);
      }

      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const end = Date.now();
        errorContextService.addTiming(start, end);
        return result;
      } catch (error) {
        const end = Date.now();
        errorContextService.addTiming(start, end);
        throw error;
      }
    };

    return descriptor;
  };
}



