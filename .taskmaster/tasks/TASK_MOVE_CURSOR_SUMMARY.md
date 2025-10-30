# MoveCursor Action Implementation Summary

## Overview
Implemented a new browser action `moveCursor` that moves the cursor to an element using human-like mouse movement, replacing robotic cursor behavior.

## Files Created

### 1. Human Mouse Utility
**File:** `src/modules/jobs/utils/human-mouse.ts`
- Implements sophisticated mouse movement algorithms
- Creates natural, curved cursor paths with jitter and overshoot
- Supports configurable speed, timing, and movement parameters
- Functions:
  - `moveMouseHuman()`: Main function for human-like cursor movement
  - `moveToElementAndClick()`: Combined movement and click

### 2. MoveCursor Action Handler
**File:** `src/modules/jobs/handlers/move-cursor-action.handler.ts`
- Implements `IActionHandler` interface
- Supports all target methods: `getByLabel`, `getByText`, `getByRole`, `getBySelector`, `getByPlaceholder`
- Configurable options:
  - `speed`: Movement speed in pixels per second (default ~1200)
  - `jitter`: Random deviation in pixels (default 0.6)
  - `overshoot`: Overshoot fraction (default 0.03)
  - `minPauseMs` / `maxPauseMs`: Random pause timing (default 8-35ms)
  - `stepsMin` / `stepsMax`: Step range for movement (default 18-38)
  - `padding`: Element padding offset (default 4px)
- Comprehensive error handling
- Retry logic support for timeout errors

### 3. Unit Tests
**File:** `src/modules/jobs/handlers/move-cursor-action.handler.spec.ts`
- 11 test cases covering:
  - Successful cursor movement with different targeting methods
  - Custom option passing
  - Error handling (missing fields, element not found, timeouts)
  - Data validation
  - Edge cases

## Integration

### 4. Action Handler Factory
**File:** `src/modules/jobs/factories/action-handler.factory.ts`
- Registered `moveCursor` handler
- Handler accessible via `actionHandlerFactory.getHandler('moveCursor')`

### 5. Jobs Module
**File:** `src/modules/jobs/jobs.module.ts`
- Added `MoveCursorActionHandler` to providers
- Handler available for dependency injection

### 6. README Documentation
**File:** `README.md`
- Updated with example usage of `moveCursor` action
- Added "Available Actions" section documenting all action types

## Key Features

### Human-Like Movement Algorithm
- **Curved Paths**: Uses quadratic Bézier curves for natural movement
- **Jitter**: Random micro-deviations to avoid robotic patterns
- **Overshoot**: Slight overshoot before correction, mimicking human behavior
- **Variable Speed**: Faster in the middle, slower at start/end
- **Random Pauses**: Occasional small pauses (8-35ms) for realism

### Usage Example

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {
      "action": "moveCursor",
      "target": "Submit",
      "getTargetBy": "getByText",
      "speed": 1000,
      "jitter": 0.5,
      "overshoot": 0.05
    },
    {
      "action": "click",
      "target": "Submit",
      "getTargetBy": "getByText"
    }
  ]
}
```

### Configuration Options

```typescript
interface MoveCursorConfig {
  target: string;
  getTargetBy: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder';
  speed?: number;        // avg pixels per second (default: 1200)
  jitter?: number;       // max per-step jitter in px (default: 0.6)
  overshoot?: number;    // fraction to overshoot (default: 0.03)
  minPauseMs?: number;   // minimal pause window (default: 8)
  maxPauseMs?: number;   // maximal pause window (default: 35)
  stepsMin?: number;     // lower bound base steps (default: 18)
  stepsMax?: number;     // upper bound base steps (default: 38)
  padding?: number;      // element padding (default: 4)
}
```

## Testing

All tests passing:
- ✅ 11 unit tests for MoveCursorActionHandler
- ✅ 44 total action handler tests
- ✅ No linting errors
- ✅ Follows existing code patterns and conventions

## Benefits

1. **Natural Behavior**: Avoids bot detection with human-like movement
2. **Flexible**: Highly configurable for different use cases
3. **Robust**: Comprehensive error handling and retry logic
4. **Testable**: Full unit test coverage
5. **Maintainable**: Follows existing project patterns

## Integration with Existing Actions

The `moveCursor` action can be combined with other actions:
- Move cursor before clicking (more realistic)
- Move cursor to verify element visibility
- Combined with other actions for sophisticated workflows

