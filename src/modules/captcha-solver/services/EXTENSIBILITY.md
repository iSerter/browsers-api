# Adding New Anti-Bot Detection Systems

This guide explains how to add support for new anti-bot systems to the detection service using the extensible registry pattern.

## Architecture Overview

The detection service uses a **Strategy Pattern** with a **Registry** to manage detection strategies:

- **`IDetectionStrategy`**: Interface that all detection strategies must implement
- **`DetectionRegistryService`**: Registry that manages registered strategies
- **`DetectionService`**: Main service that uses the registry to find and execute strategies
- **`BaseDetectionStrategy`**: Abstract base class with common utilities (optional)

## Step-by-Step Guide

### Step 1: Add System Type to Enum

First, add your new anti-bot system to the `AntiBotSystemType` enum:

```typescript
// src/modules/captcha-solver/interfaces/detection.interface.ts
export enum AntiBotSystemType {
  // ... existing types
  NEW_SYSTEM = 'new-system',
  UNKNOWN = 'unknown',
}
```

### Step 2: Create Detection Strategy

Create a new strategy class that implements `IDetectionStrategy`:

**Option A: Using BaseDetectionStrategy (Recommended)**

```typescript
// src/modules/captcha-solver/services/strategies/new-system-detection.strategy.ts
import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';
import {
  AntiBotSystemType,
  DetectionContext,
  DetectionSignal,
  SignalStrength,
} from '../../interfaces';
import { BaseDetectionStrategy } from '../base-detection-strategy';
import { ConfidenceScoringService } from '../confidence-scoring.service';

@Injectable()
export class NewSystemDetectionStrategy extends BaseDetectionStrategy {
  readonly systemType = AntiBotSystemType.NEW_SYSTEM;

  constructor(confidenceScoring: ConfidenceScoringService) {
    super(confidenceScoring);
  }

  getName(): string {
    return 'new-system-detection-strategy';
  }

  async detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    const signals: DetectionSignal[] = [];

    // 1. Inspect DOM for system-specific elements
    const domData = await page.evaluate(() => {
      // Your DOM inspection logic here
      return {
        hasSystemElement: !!document.querySelector('.system-element'),
        scripts: [] as string[],
      };
    });

    // 2. Check cookies
    const systemCookies = context.cookies?.filter(
      (c) => c.name.includes('system'),
    ) || [];

    // 3. Check headers
    const hasSystemHeader = context.headers?.['x-system'] !== undefined;

    // 4. Build detection signals
    if (domData.hasSystemElement) {
      signals.push({
        type: 'dom-element',
        name: 'system-element',
        strength: SignalStrength.STRONG,
      });
    }

    if (systemCookies.length > 0) {
      signals.push({
        type: 'cookie',
        name: 'system-cookies',
        strength: SignalStrength.MODERATE,
        context: { count: systemCookies.length },
      });
    }

    if (hasSystemHeader) {
      signals.push({
        type: 'header',
        name: 'system-header',
        strength: SignalStrength.WEAK,
      });
    }

    // 5. Return detection result using base class helper
    return this.createDetectionResult(signals, {
      // Additional metadata
      metadata: {
        // Custom metadata here
      },
    });
  }
}
```

**Option B: Implementing IDetectionStrategy Directly**

```typescript
import { IDetectionStrategy } from '../detection-strategy.interface';
import { ConfidenceScoringService } from '../confidence-scoring.service';

export class NewSystemDetectionStrategy implements IDetectionStrategy {
  readonly systemType = AntiBotSystemType.NEW_SYSTEM;

  constructor(
    private readonly confidenceScoring: ConfidenceScoringService,
  ) {}

  getName(): string {
    return 'new-system-detection-strategy';
  }

  async detect(
    page: Page,
    context: DetectionContext,
  ): Promise<AntiBotDetectionResult> {
    // Your detection logic here
    // ...
    
    return {
      detected: true,
      type: AntiBotSystemType.NEW_SYSTEM,
      confidence: 0.8,
      details: { signals: [] },
      detectedAt: new Date(),
      durationMs: 0,
    };
  }
}
```

### Step 3: Register the Strategy

Register your strategy in your module's `onModuleInit` or in a service:

```typescript
// In your module or service
import { Module, OnModuleInit } from '@nestjs/common';
import { DetectionService } from './services/detection.service';
import { NewSystemDetectionStrategy } from './services/strategies/new-system-detection.strategy';
import { ConfidenceScoringService } from './services/confidence-scoring.service';

@Module({
  // ... module config
})
export class YourModule implements OnModuleInit {
  constructor(
    private readonly detectionService: DetectionService,
    private readonly confidenceScoring: ConfidenceScoringService,
  ) {}

  onModuleInit() {
    // Register your custom strategy
    const strategy = new NewSystemDetectionStrategy(this.confidenceScoring);
    this.detectionService.registerStrategy(strategy);
  }
}
```

Or register directly via the registry:

```typescript
import { DetectionRegistryService } from './services/detection-registry.service';

constructor(
  private readonly registry: DetectionRegistryService,
  private readonly confidenceScoring: ConfidenceScoringService,
) {}

onModuleInit() {
  const strategy = new NewSystemDetectionStrategy(this.confidenceScoring);
  this.registry.register(strategy);
}
```

### Step 4: Test Your Strategy

Create unit tests for your strategy:

```typescript
// new-system-detection.strategy.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NewSystemDetectionStrategy } from './new-system-detection.strategy';
import { ConfidenceScoringService } from '../confidence-scoring.service';
import { AntiBotSystemType } from '../../interfaces';

describe('NewSystemDetectionStrategy', () => {
  let strategy: NewSystemDetectionStrategy;
  let mockPage: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NewSystemDetectionStrategy, ConfidenceScoringService],
    }).compile();

    strategy = module.get<NewSystemDetectionStrategy>(
      NewSystemDetectionStrategy,
    );

    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      evaluate: jest.fn(),
    };
  });

  it('should detect new system', async () => {
    mockPage.evaluate.mockResolvedValue({
      hasSystemElement: true,
    });

    const result = await strategy.detect(mockPage, {
      url: 'https://example.com',
      cookies: [{ name: 'system-cookie', value: 'test', domain: '.example.com' }],
    });

    expect(result.detected).toBe(true);
    expect(result.type).toBe(AntiBotSystemType.NEW_SYSTEM);
    expect(result.confidence).toBeGreaterThan(0);
  });
});
```

## Best Practices

### Signal Strength Classification

Use appropriate signal strengths:

- **STRONG**: Definitive indicators (challenge forms, widgets, specific scripts)
- **MODERATE**: Supporting evidence (cookies, related scripts)
- **WEAK**: Generic indicators (common headers, generic patterns)

### Error Handling

Always wrap `page.evaluate()` calls in try-catch:

```typescript
let data: any;
try {
  data = await page.evaluate(() => {
    // Your logic
  });
} catch (error) {
  // Return empty/default data structure
  data = { /* defaults */ };
}
```

### Confidence Scoring

The `BaseDetectionStrategy` automatically calculates confidence scores using the `ConfidenceScoringService`. If implementing `IDetectionStrategy` directly, you can inject and use the service:

```typescript
const confidence = this.confidenceScoring.calculateConfidence(
  signals,
  AntiBotSystemType.NEW_SYSTEM,
);
```

### Context Usage

Use the `DetectionContext` parameter to access:
- `url`: Current page URL
- `title`: Page title (may be undefined)
- `cookies`: Array of cookies
- `headers`: Response headers (may be undefined)

## Example: Complete Custom Strategy

See `src/modules/captcha-solver/services/strategies/cloudflare-detection.strategy.ts` for a complete example of a detection strategy implementation.

## Advanced: Overriding Built-in Strategies

You can override built-in strategies by registering a new strategy with the same `systemType`:

```typescript
// This will replace the built-in Cloudflare detection
const customCloudflareStrategy = new CustomCloudflareStrategy();
detectionService.registerStrategy(customCloudflareStrategy);
```

The registry will log a warning when overwriting existing strategies.

## Troubleshooting

### Strategy Not Being Used

1. Check that the strategy is registered before `detectAll()` is called
2. Verify the `systemType` matches exactly (case-sensitive)
3. Check module initialization order - use `onModuleInit` to ensure registration happens at startup

### Type Errors

Make sure to:
- Import `IDetectionStrategy` from the correct path
- Use the correct `AntiBotSystemType` enum value
- Return `AntiBotDetectionResult` with all required fields

### Testing Issues

- Mock the `Page` object properly
- Provide a valid `DetectionContext` with at least a `url` field
- Mock `page.evaluate()` to return expected data structures

## Related Files

- `detection-strategy.interface.ts` - Strategy interface definition
- `detection-registry.service.ts` - Registry service
- `base-detection-strategy.ts` - Base class with utilities
- `detection.service.ts` - Main detection service
- `detection.interface.ts` - Type definitions and enums

