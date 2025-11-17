# Snapshots Feature - Technical Implementation Plan

## Overview

This document outlines the technical implementation plan for adding a "snapshot" action type that captures page state including HTML content, cookies, localStorage, and sessionStorage.

## Requirements Summary

- **Action Type**: `snapshot`
- **Default Behavior**: Always captures HTML page content and metadata (viewport, user-agent, etc.)
- **Optional Features**: 
  - `cookies`: Capture browser cookies (default: false)
  - `localStorage`: Capture localStorage data (default: false)
  - `sessionStorage`: Capture sessionStorage data (default: false)
- **Metadata**: Always included (viewport, userAgent, language, platform, timezone, title, url)
- **Artifact Creation**: Each snapshot creates one artifact containing all captured data
- **Multiple Usage**: Can be called multiple times within a single job's action flow

## Architecture Analysis

### Current Action Handler Pattern

The codebase follows a consistent pattern for action handlers:

1. **Handler Interface**: `IActionHandler` with `execute(page: Page, config: ActionConfig, jobId: string): Promise<ActionResult>`
2. **Handler Registration**: Handlers are registered in `ActionHandlerFactory`
3. **DTO Validation**: Action-specific fields are added to `ActionConfigDto` with validation decorators
4. **Artifact Storage**: Handlers use `ArtifactStorageService.saveArtifact()` to persist artifacts
5. **Module Registration**: Handlers are added as providers in `JobsModule`

### Current Artifact System

- **Entity**: `JobArtifact` with `ArtifactType` enum
- **Storage**: Filesystem + Database (dual storage)
- **Types**: Currently supports `SCREENSHOT`, `PDF`, `VIDEO`, `TRACE`, `DATA`
- **MIME Types**: Stored per artifact for proper content-type handling

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Update ArtifactType Enum
**File**: `src/modules/jobs/entities/job-artifact.entity.ts`

Add new artifact type:
```typescript
export enum ArtifactType {
  SCREENSHOT = 'screenshot',
  PDF = 'pdf',
  VIDEO = 'video',
  TRACE = 'trace',
  DATA = 'data',
  SNAPSHOT = 'snapshot',  // NEW
}
```

#### 1.2 Update ActionType Enum
**File**: `src/modules/jobs/dto/action-config.dto.ts`

Add snapshot to action types:
```typescript
export enum ActionType {
  CLICK = 'click',
  FILL = 'fill',
  SCROLL = 'scroll',
  MOVE_CURSOR = 'moveCursor',
  SCREENSHOT = 'screenshot',
  VISIT = 'visit',
  EXTRACT = 'extract',
  PDF = 'pdf',
  SNAPSHOT = 'snapshot',  // NEW
}
```

#### 1.3 Add Snapshot Configuration Fields to DTO
**File**: `src/modules/jobs/dto/action-config.dto.ts`

Add optional boolean fields for snapshot options:
```typescript
// Snapshot action fields
@IsOptional()
@IsBoolean()
cookies?: boolean;

@IsOptional()
@IsBoolean()
localStorage?: boolean;

@IsOptional()
@IsBoolean()
sessionStorage?: boolean;
```

### Phase 2: Snapshot Handler Implementation

#### 2.1 Create SnapshotActionHandler
**File**: `src/modules/jobs/handlers/snapshot-action.handler.ts`

**Key Responsibilities**:
- Capture HTML content (always)
- Conditionally capture cookies, localStorage, sessionStorage
- Package data into JSON format
- Create artifact(s) for the snapshot
- Handle errors gracefully

**Implementation Details**:

```typescript
interface SnapshotActionConfig extends ActionConfig {
  cookies?: boolean;
  localStorage?: boolean;
  sessionStorage?: boolean;
}

@Injectable()
export class SnapshotActionHandler implements IActionHandler {
  constructor(
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  async execute(
    page: Page,
    config: SnapshotActionConfig,
    jobId: string,
  ): Promise<ActionResult> {
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
    } = config;

    // 1. Always capture HTML content
    const htmlContent = await page.content();

    // 2. Capture metadata (always included)
    const context = page.context();
    const viewport = page.viewportSize();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const title = await page.title().catch(() => undefined);
    const url = page.url();

    // 3. Build snapshot data object
    const snapshotData: any = {
      html: htmlContent,
      url,
      title,
      timestamp: new Date().toISOString(),
      metadata: {
        viewport: viewport ? {
          width: viewport.width,
          height: viewport.height,
        } : null,
        userAgent,
        language: await page.evaluate(() => navigator.language).catch(() => undefined),
        platform: await page.evaluate(() => navigator.platform).catch(() => undefined),
        timezone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => undefined),
      },
    };

    // 4. Conditionally capture cookies
    if (cookies) {
      const contextCookies = await context.cookies();
      snapshotData.cookies = contextCookies;
    }

    // 5. Conditionally capture localStorage
    if (localStorage) {
      try {
        const localStorageData = await page.evaluate(() => {
          const storage: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              storage[key] = window.localStorage.getItem(key) || '';
            }
          }
          return storage;
        });
        snapshotData.localStorage = localStorageData;
      } catch (error) {
        this.logger.warn(`Failed to capture localStorage: ${error.message}`);
        snapshotData.localStorage = null;
      }
    }

    // 6. Conditionally capture sessionStorage
    if (sessionStorage) {
      try {
        const sessionStorageData = await page.evaluate(() => {
          const storage: Record<string, string> = {};
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            if (key) {
              storage[key] = window.sessionStorage.getItem(key) || '';
            }
          }
          return storage;
        });
        snapshotData.sessionStorage = sessionStorageData;
      } catch (error) {
        this.logger.warn(`Failed to capture sessionStorage: ${error.message}`);
        snapshotData.sessionStorage = null;
      }
    }

    // 7. Convert to JSON buffer
    const jsonBuffer = Buffer.from(JSON.stringify(snapshotData, null, 2), 'utf-8');

    // 8. Generate filename with timestamp
    const timestamp = Date.now();
    const filename = `${timestamp}-snapshot.json`;

    // 9. Save artifact
    const filePath = await this.artifactStorageService.saveArtifact(
      jsonBuffer,
      jobId,
      filename,
      ArtifactType.SNAPSHOT,
      'application/json',
    );

    return {
      success: true,
      artifactId: filePath,
      data: {
        filePath,
        size: jsonBuffer.length,
        mimeType: 'application/json',
        includes: {
          html: true,
          metadata: true,
          cookies,
          localStorage,
          sessionStorage,
        },
      },
    };
  }
}
```

**Error Handling**:
- Wrap each data capture in try-catch
- Log warnings for optional data (cookies, localStorage, sessionStorage) but don't fail the entire snapshot
- Only fail if HTML content cannot be captured
- Metadata capture failures should be logged but not fail the snapshot (set to null if unavailable)

#### 2.2 Register Handler in Factory
**File**: `src/modules/jobs/factories/action-handler.factory.ts`

Add to constructor:
```typescript
constructor(
  private readonly screenshotHandler: ScreenshotActionHandler,
  private readonly fillHandler: FillActionHandler,
  private readonly clickHandler: ClickActionHandler,
  private readonly moveCursorHandler: MoveCursorActionHandler,
  private readonly scrollHandler: ScrollActionHandler,
  private readonly snapshotHandler: SnapshotActionHandler,  // NEW
) {
  this.handlers.set('screenshot', this.screenshotHandler);
  this.handlers.set('fill', this.fillHandler);
  this.handlers.set('click', this.clickHandler);
  this.handlers.set('moveCursor', this.moveCursorHandler);
  this.handlers.set('scroll', this.scrollHandler);
  this.handlers.set('snapshot', this.snapshotHandler);  // NEW
}
```

#### 2.3 Register Handler in Module
**File**: `src/modules/jobs/jobs.module.ts`

Add to imports and providers:
```typescript
import { SnapshotActionHandler } from './handlers/snapshot-action.handler';

@Module({
  // ...
  providers: [
    // ... existing handlers
    SnapshotActionHandler,  // NEW
    // ...
  ],
})
```

### Phase 3: Testing

#### 3.1 Unit Tests
**File**: `src/modules/jobs/handlers/snapshot-action.handler.spec.ts`

**Test Cases**:
1. ✅ Snapshot with only HTML (default) - should include metadata
2. ✅ Snapshot with HTML + cookies
3. ✅ Snapshot with HTML + localStorage
4. ✅ Snapshot with HTML + sessionStorage
5. ✅ Snapshot with all options enabled
6. ✅ Metadata is always included (viewport, userAgent, etc.)
7. ✅ Error handling when HTML capture fails
8. ✅ Error handling when optional data capture fails (should not fail entire snapshot)
9. ✅ Error handling when metadata capture fails (should not fail entire snapshot)
10. ✅ Artifact creation verification
11. ✅ JSON structure validation
12. ✅ Multiple snapshots in same job

#### 3.2 Integration Tests
**File**: `test/jobs.e2e-spec.ts` or new `test/snapshot-action.e2e-spec.ts`

**Test Scenarios**:
1. Create job with single snapshot action
2. Create job with multiple snapshot actions at different stages
3. Verify artifacts are created and accessible via API
4. Verify snapshot JSON structure and content
5. Test with cookies, localStorage, sessionStorage enabled
6. Test snapshot after page navigation
7. Test snapshot after form interactions

### Phase 4: Documentation Updates

#### 4.1 Update README.md
**File**: `README.md`

Add snapshot to available actions list:
```markdown
#### Available Actions

- **fill**: Fill form fields with values
- **click**: Click on elements with various targeting options
- **moveCursor**: Move cursor to element using human-like movement
- **scroll**: Scroll the page with human-like behavior
- **screenshot**: Capture screenshots of the page or specific elements
- **snapshot**: Capture page state (HTML, cookies, localStorage, sessionStorage)
```

Add snapshot example to action configuration:
```markdown
**Snapshot action:**
```json
{"action": "snapshot"}
```

**Snapshot with all options:**
```json
{"action": "snapshot", "cookies": true, "localStorage": true, "sessionStorage": true}
```
```

#### 4.2 Update API Documentation
**File**: `docs/tech/05-api-reference.md` (if exists)

Add snapshot action documentation section.

#### 4.3 Update Technical Documentation
**File**: `docs/tech/07-browser-pool-actions.md` (if exists)

Add snapshot handler documentation following the existing pattern.

### Phase 5: Database Migration (if needed)

**Note**: No database schema changes are required. The existing `ArtifactType` enum in the entity will be updated, but TypeORM handles enum changes without requiring a migration if the database column is already `varchar` (which it is).

However, if you want to be explicit about the new artifact type, you could create an optional migration:

**File**: `src/database/migrations/[timestamp]-AddSnapshotArtifactType.ts`

```typescript
// Optional: Add comment or constraint for snapshot artifact type
// The enum change in code is sufficient for TypeORM
```

## Implementation Details

### Data Structure

The snapshot artifact will be a JSON file with the following structure:

```json
{
  "html": "<!DOCTYPE html>...",
  "url": "https://example.com/page",
  "title": "Page Title",
  "timestamp": "2025-01-18T10:30:00.000Z",
  "metadata": {
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
    "language": "en-US",
    "platform": "Win32",
    "timezone": "America/New_York"
  },
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "expires": 1234567890,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "localStorage": {
    "key1": "value1",
    "key2": "value2"
  },
  "sessionStorage": {
    "key1": "value1"
  }
}
```

**Note**: The `metadata` object is always included. The `cookies`, `localStorage`, and `sessionStorage` fields are only included when their respective flags are enabled.

### Playwright APIs Used

1. **HTML Content**: `page.content()` - Returns the full HTML source
2. **Metadata**:
   - `page.viewportSize()` - Returns viewport dimensions
   - `page.evaluate(() => navigator.userAgent)` - Returns user agent string
   - `page.evaluate(() => navigator.language)` - Returns browser language
   - `page.evaluate(() => navigator.platform)` - Returns platform information
   - `page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)` - Returns timezone
   - `page.title()` - Returns page title
   - `page.url()` - Returns current URL
3. **Cookies**: `page.context().cookies()` - Returns array of cookie objects
4. **localStorage**: `page.evaluate(() => { /* access localStorage */ })` - Browser context evaluation
5. **sessionStorage**: `page.evaluate(() => { /* access sessionStorage */ })` - Browser context evaluation

### Error Handling Strategy

- **HTML Capture Failure**: Critical error - return failure result
- **Metadata Capture Failure**: Warning logged, individual metadata fields set to null if unavailable, snapshot continues
- **Cookie Capture Failure**: Warning logged, snapshot continues without cookies
- **localStorage Capture Failure**: Warning logged, snapshot continues without localStorage (set to null)
- **sessionStorage Capture Failure**: Warning logged, snapshot continues without sessionStorage (set to null)
- **Artifact Save Failure**: Critical error - return failure result

### Performance Considerations

- **Large HTML Pages**: JSON serialization of large HTML can be memory-intensive. Consider:
  - Streaming for very large pages (future enhancement)
  - Compression option (future enhancement)
- **Multiple Snapshots**: Each snapshot creates a separate artifact file, which is expected behavior
- **Storage**: Snapshots are stored both on filesystem and in database (bytea column)

## Testing Strategy

### Unit Tests
- Mock Playwright Page object
- Mock ArtifactStorageService
- Test all configuration combinations
- Test error scenarios

### Integration Tests
- Real browser automation
- Verify artifact creation
- Verify artifact retrieval via API
- Test with actual cookies/localStorage/sessionStorage

### Edge Cases
- Empty localStorage/sessionStorage
- No cookies present
- Very large HTML pages
- Special characters in storage keys/values
- Multiple snapshots in rapid succession

## Rollout Plan

1. **Phase 1**: Core infrastructure (ArtifactType, ActionType, DTO)
2. **Phase 2**: Handler implementation
3. **Phase 3**: Unit tests
4. **Phase 4**: Integration tests
5. **Phase 5**: Documentation updates
6. **Phase 6**: Code review
7. **Phase 7**: Merge and deploy

## Future Enhancements (Out of Scope)

- **Compression**: Gzip compression for large snapshots
- **Selective HTML**: Option to capture only specific DOM elements
- **Incremental Snapshots**: Only capture changes since last snapshot
- **Snapshot Comparison**: Diff tool for comparing snapshots
- **Snapshot Restoration**: Ability to restore page state from snapshot
- **IndexedDB Support**: Capture IndexedDB data
- **Network Requests**: Capture network request/response data
- **Performance Metrics**: Include performance timing data

## Dependencies

- **Existing**: All dependencies are already in place
  - Playwright (for page access)
  - ArtifactStorageService (for artifact persistence)
  - TypeORM (for database operations)
  - NestJS validation (for DTO validation)

## Risk Assessment

### Low Risk
- ✅ Follows existing patterns
- ✅ No database schema changes required
- ✅ Backward compatible (new action type)
- ✅ Well-isolated implementation

### Medium Risk
- ⚠️ Large HTML pages may cause memory issues (mitigated by existing artifact storage)
- ⚠️ JSON serialization of complex data structures

### Mitigation
- Monitor artifact sizes in production
- Consider compression for large snapshots (future enhancement)
- Add size limits if needed

## Success Criteria

1. ✅ Snapshot action can be used in job actions array
2. ✅ HTML content is always captured
3. ✅ Metadata (viewport, userAgent, etc.) is always captured
4. ✅ Optional data (cookies, localStorage, sessionStorage) is captured when enabled
5. ✅ Artifacts are created and accessible via API
6. ✅ Multiple snapshots can be used in a single job
7. ✅ Error handling works correctly (metadata failures don't break snapshot)
8. ✅ Unit tests pass with >80% coverage
9. ✅ Integration tests pass
10. ✅ Documentation is updated

## Timeline Estimate

- **Phase 1**: 1-2 hours (infrastructure updates)
- **Phase 2**: 3-4 hours (handler implementation)
- **Phase 3**: 2-3 hours (unit tests)
- **Phase 4**: 2-3 hours (integration tests)
- **Phase 5**: 1 hour (documentation)
- **Total**: ~10-13 hours

