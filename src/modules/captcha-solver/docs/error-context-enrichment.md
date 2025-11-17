# Error Context Enrichment

This document describes the error context enrichment system implemented for the captcha solver module.

## Overview

The error context enrichment system provides:
- **Correlation IDs** for tracking requests across services
- **Timing information** for performance analysis
- **Solver metadata** for debugging
- **Error aggregation** for multi-attempt scenarios
- **Structured logging** with context

## Components

### 1. ErrorContext Interface

The `ErrorContext` interface defines the structure of error context:

```typescript
interface ErrorContext {
  correlationId: string;
  timestamp: number;
  solverType?: string;
  solverMetadata?: Record<string, any>;
  timings?: { start: number; end: number; duration: number };
  attemptNumber?: number;
  additionalContext?: Record<string, any>;
}
```

### 2. ErrorContextService

The `ErrorContextService` manages error context using `AsyncLocalStorage`, ensuring context is available throughout async operations:

```typescript
// Get current context
const context = errorContextService.getContext();

// Update context
errorContextService.setSolverMetadata('recaptcha-native', { version: '1.0' });
errorContextService.setAttemptNumber(2);
errorContextService.addTiming(startTime, endTime);
```

### 3. Error Context Interceptor

The `ErrorContextInterceptor` automatically sets up error context for each HTTP request:

```typescript
// Apply globally in app.module.ts
{
  provide: APP_INTERCEPTOR,
  useClass: ErrorContextInterceptor,
}
```

### 4. Exception Enrichment

All `CaptchaSolverException` instances can include error context:

```typescript
const exception = new ProviderException(
  'Provider error',
  '2captcha',
  undefined,
  { additionalData: 'value' },
  errorContext, // Optional error context
);
```

### 5. Timing Decorator

Use the `@Timing()` decorator to automatically track method execution time:

```typescript
class MySolver {
  @Timing()
  async solve(params: CaptchaParams): Promise<CaptchaSolution> {
    // Method implementation
  }
}
```

### 6. Error Aggregation

The `ErrorAggregationService` aggregates errors from multiple attempts:

```typescript
const aggregated = errorAggregationService.aggregateErrors([
  { attempt: 1, error: error1, timestamp: Date.now(), duration: 1000 },
  { attempt: 2, error: error2, timestamp: Date.now(), duration: 1500 },
]);

const summary = errorAggregationService.createSummary(aggregated);
const stats = errorAggregationService.getStatistics(aggregated);
```

### 7. Structured Logging

Use `StructuredLogger` for logging with automatic context inclusion:

```typescript
const structuredLogger = new StructuredLogger(logger, errorContextService);
structuredLogger.log('Solving captcha', { type: 'recaptcha' });
// Output: "Solving captcha [correlation-id] [recaptcha-native] [Attempt 1] [1000ms]"
```

## Usage Examples

### Example 1: Basic Exception with Context

```typescript
@Injectable()
export class MyService {
  constructor(
    private readonly errorContextService: ErrorContextService,
  ) {}

  async solve() {
    try {
      // Set solver metadata
      this.errorContextService.setSolverMetadata('my-solver', { version: '1.0' });
      
      const start = Date.now();
      const result = await this.performSolve();
      const end = Date.now();
      
      // Add timing
      this.errorContextService.addTiming(start, end);
      
      return result;
    } catch (error) {
      // Get current context
      const context = this.errorContextService.getContext();
      
      // Create exception with context
      throw new ProviderException(
        'Failed to solve',
        'my-solver',
        undefined,
        { additionalData: 'value' },
        context,
      );
    }
  }
}
```

### Example 2: Using Exception Factory

```typescript
@Injectable()
export class MyService {
  private readonly exceptionFactory: ExceptionFactory;

  constructor(
    private readonly errorContextService: ErrorContextService,
  ) {
    this.exceptionFactory = new ExceptionFactory(errorContextService);
  }

  async solve() {
    try {
      // ... solve logic
    } catch (error) {
      const exception = new ProviderException('Error', 'provider');
      
      // Enrich with context
      this.exceptionFactory.enrichException(exception);
      
      throw exception;
    }
  }
}
```

### Example 3: Error Aggregation in Retry Logic

```typescript
async solveWithRetries(params: CaptchaParams): Promise<CaptchaSolution> {
  const errors: Array<{
    attempt: number;
    error: CaptchaSolverException;
    timestamp: number;
    duration?: number;
  }> = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    this.errorContextService.setAttemptNumber(attempt);
    
    try {
      const result = await this.solve(params);
      return result;
    } catch (error) {
      const end = Date.now();
      const duration = end - start;
      
      errors.push({
        attempt,
        error: error as CaptchaSolverException,
        timestamp: Date.now(),
        duration,
      });
      
      if (attempt === maxRetries) {
        // Aggregate errors
        const aggregated = this.errorAggregationService.aggregateErrors(errors);
        const summary = this.errorAggregationService.createSummary(aggregated);
        
        throw new ProviderException(
          summary,
          'all-providers',
          undefined,
          { aggregatedErrors: aggregated },
        );
      }
    }
  }
}
```

## Integration

### Module Setup

The `CaptchaSolverModule` already includes:
- `ErrorContextService`
- `ErrorAggregationService`

### Global Interceptor (Optional)

To apply error context globally:

```typescript
// app.module.ts
{
  provide: APP_INTERCEPTOR,
  useClass: ErrorContextInterceptor,
}
```

### Controller-Level Interceptor

To apply only to captcha solver endpoints:

```typescript
@Controller('captcha')
@UseInterceptors(ErrorContextInterceptor)
export class CaptchaSolverController {
  // ...
}
```

## Best Practices

1. **Always set solver metadata** when starting a solve operation
2. **Use timing decorator** for automatic timing tracking
3. **Include error context** when creating exceptions
4. **Use structured logging** for consistent log format
5. **Aggregate errors** in multi-attempt scenarios
6. **Set attempt numbers** in retry loops

## Testing

When testing services that use error context:

```typescript
describe('MyService', () => {
  let service: MyService;
  let errorContextService: ErrorContextService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MyService,
        ErrorContextService,
        // ... other providers
      ],
    }).compile();

    service = module.get(MyService);
    errorContextService = module.get(ErrorContextService);
  });

  it('should include error context', async () => {
    await errorContextService.run('test-correlation-id', async () => {
      // Test code here
      // Error context will be available
    });
  });
});
```

