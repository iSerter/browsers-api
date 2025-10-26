# Scroll Action Implementation Summary

## Overview
Implemented a new browser action `scroll` that provides human-like scrolling behavior, replacing robotic instant scrolling.

## Files Created

### 1. Human Scroll Utility
**File:** `src/modules/jobs/utils/human-scroll.ts`
- Implements sophisticated scrolling algorithms
- Creates natural, variable-speed scrolling with jitter and overshoot
- Supports configurable speed, variance, step size, and timing
- Functions:
  - `humanScroll()`: Main function for human-like scrolling

### 2. Scroll Action Handler
**File:** `src/modules/jobs/handlers/scroll-action.handler.ts`
- Implements `IActionHandler` interface
- Supports three scroll modes:
  1. **Scroll to specific Y position** using `targetY`
  2. **Scroll to element** using `target` + `getTargetBy`
  3. **Scroll to bottom** (no target specified)
- Configurable options:
  - `speed`: Base pixels per second (default 2500)
  - `variance`: Randomness factor 0–1 (default 0.35)
  - `stepMin` / `stepMax`: Step size range (default 60-180)
  - `pauseChance`: Probability to pause briefly (default 0.15)
- Comprehensive error handling
- Retry logic support for timeout errors

### 3. Unit Tests
**File:** `src/modules/jobs/handlers/scroll-action.handler.spec.ts`
- 13 test cases covering:
  - Scroll to specific Y position
  - Scroll to elements using different targeting methods
  - Custom option passing
  - Element position calculation
  - Scroll to bottom functionality
  - Error handling (missing fields, element not found, timeouts)
  - Data validation
  - Edge cases

## Integration

### 4. Action Handler Factory
**File:** `src/modules/jobs/factories/action-handler.factory.ts`
- Registered `scroll` handler
- Handler accessible via `actionHandlerFactory.getHandler('scroll')`

### 5. Jobs Module
**File:** `src/modules/jobs/jobs.module.ts`
- Added `ScrollActionHandler` to providers
- Handler available for dependency injection

### 6. README Documentation
**File:** `README.md`
- Updated with example usage of `scroll` action
- Added "Action Configuration Examples" section
- Included various scroll configuration examples

## Key Features

### Human-Like Scroll Algorithm
- **Variable Speed**: Base speed with randomness variance
- **Variable Steps**: Random step sizes within configurable range
- **Easing**: Uses ease-out quadratic for natural deceleration
- **Overshoot & Correction**: Slight overshoot followed by correction
- **Random Pauses**: Occasional brief pauses (150-400ms) for realism
- **Jitter**: Random deviation in scroll distance

### Scroll Modes

1. **Absolute Position:**
   ```json
   {"action": "scroll", "targetY": 2000}
   ```

2. **Scroll to Element:**
   ```json
   {"action": "scroll", "target": "Footer", "getTargetBy": "getByText"}
   ```

3. **Scroll to Bottom:**
   ```json
   {"action": "scroll"}
   ```

### Configuration Options

```typescript
interface ScrollConfig {
  targetY?: number;       // final scrollTop target
  target?: string;        // target element selector
  getTargetBy?: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder';
  speed?: number;         // base pixels per second (default: 2500)
  variance?: number;      // randomness factor 0–1 (default: 0.35)
  stepMin?: number;       // minimal pixels per step (default: 60)
  stepMax?: number;       // max pixels per step (default: 180)
  pauseChance?: number;   // probability to pause (default: 0.15)
}
```

## Usage Examples

### Basic Usage
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {"action": "scroll", "targetY": 1000},
    {"action": "screenshot", "fullPage": true}
  ]
}
```

### Scroll to Element
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {"action": "scroll", "target": "Contact Us", "getTargetBy": "getByText"},
    {"action": "screenshot"}
  ]
}
```

### Custom Scroll Speed
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {
      "action": "scroll",
      "target": "#footer",
      "getTargetBy": "getBySelector",
      "speed": 2000,
      "variance": 0.4,
      "stepMin": 80,
      "stepMax": 200
    }
  ]
}
```

### Combined with Other Actions
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {"action": "scroll", "target": "Submit", "getTargetBy": "getByText"},
    {"action": "moveCursor", "target": "Submit", "getTargetBy": "getByText"},
    {"action": "click", "target": "Submit", "getTargetBy": "getByText"}
  ]
}
```

## Testing

All tests passing:
- ✅ 13 unit tests for ScrollActionHandler
- ✅ 57 total action handler tests
- ✅ No linting errors
- ✅ Build successful
- ✅ Follows existing code patterns and conventions

## Benefits

1. **Natural Behavior**: Avoids bot detection with human-like scrolling
2. **Flexible**: Three scroll modes (absolute, element-based, bottom)
3. **Configurable**: Extensive customization options
4. **Robust**: Comprehensive error handling and retry logic
5. **Testable**: Full unit test coverage
6. **Maintainable**: Follows existing project patterns

## Integration with Existing Actions

The `scroll` action can be combined with other actions:
- Scroll before clicking elements (bring into view)
- Scroll to load lazy-loaded content
- Scroll between form fields for natural flow
- Scroll to specific sections before screenshot
- Combined with `moveCursor` and `click` for realistic interactions

## Technical Details

### Scroll Algorithm
1. Calculates current scroll position and document height
2. Determines scroll distance and direction
3. Creates variable-speed steps with jitter
4. Applies easing function for natural deceleration
5. Occasionally pauses for realism
6. Slight overshoot and correction at the end

### Element Positioning
- When scrolling to an element:
  - Finds element using target + getTargetBy
  - Calculates bounding box
  - Centers element in viewport
  - Scrolls to calculated Y position

### Performance Considerations
- Uses `behavior: 'auto'` for instant scrolling (animation handled by timing)
- Efficient step calculation
- Avoids unnecessary reflows
- Configurable step count based on distance

