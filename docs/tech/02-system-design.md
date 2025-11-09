# System Design & Data Flow

## System Components

### Application Layer
- **REST API**: HTTP endpoints for job management
- **WebSocket Gateway**: Real-time job event notifications
- **Controllers**: Request handling and validation
- **Services**: Business logic and orchestration

### Processing Layer
- **Job Processor**: Polls database and executes jobs
- **Worker Manager**: Tracks worker status and health
- **Browser Pool**: Manages browser instance lifecycle

### Data Layer
- **PostgreSQL**: Job queue and persistent storage
- **TypeORM**: Database abstraction and migrations
- **File System**: Artifact storage (screenshots, PDFs)

## Job Lifecycle

```
┌─────────────┐
│   PENDING   │ ← Job created via API
└──────┬──────┘
       │
       │ Worker picks up job
       ▼
┌─────────────┐
│ PROCESSING  │ ← Browser automation executing
└──────┬──────┘
       │
       ├──► SUCCESS ──► COMPLETED
       │
       └──► FAILURE ──► RETRY (if retryable)
                          │
                          └──► FAILED (max retries)
```

## Job Processing Sequence

### 1. Job Creation
```typescript
POST /api/v1/jobs
  ├─► Validate API Key
  ├─► Check URL Policy
  ├─► Validate DTO
  ├─► Save to DB (status: pending)
  ├─► Emit WebSocket Event
  └─► Return Job ID
```

### 2. Job Polling
```typescript
JobProcessor.pollAndProcessJob()
  ├─► Query: SELECT * FROM automation_jobs
  │      WHERE status = 'pending'
  │      ORDER BY priority DESC, created_at ASC
  │      FOR UPDATE SKIP LOCKED
  │      LIMIT 1
  │
  ├─► Update: status = 'processing'
  ├─► Set: started_at = NOW()
  └─► Commit Transaction
```

### 3. Job Execution
```typescript
JobProcessor.executeJob()
  ├─► Acquire Browser from Pool
  ├─► Create Browser Context
  ├─► Create Page
  ├─► Navigate to URL
  │
  ├─► For each action:
  │   ├─► Get Handler from Factory
  │   ├─► Execute Handler
  │   └─► Store Result
  │
  ├─► Update: status = 'completed'
  ├─► Set: completed_at = NOW()
  ├─► Release Browser to Pool
  └─► Emit WebSocket Event
```

## Browser Pool Architecture

```
BrowserPoolService
  │
  ├─► BrowserPool (per browser type)
  │   │
  │   ├─► availableInstances: Browser[]
  │   ├─► activeInstances: Set<Browser>
  │   └─► idleTimers: Map<Browser, Timer>
  │
  └─► Pool Operations:
      ├─► acquire(): Get browser (create if needed)
      ├─► release(): Return browser to pool
      └─► cleanup(): Close all browsers
```

### Pool Lifecycle

1. **Initialization**: Create minSize browsers on startup
2. **Acquisition**: 
   - Return available browser if exists
   - Create new browser if under maxSize
   - Wait if at maxSize
3. **Release**: Return browser to available pool
4. **Cleanup**: Close idle browsers after timeout

## Action Handler System

### Handler Interface
```typescript
interface IActionHandler {
  execute(page: Page, config: ActionConfig, jobId: string): Promise<ActionResult>
}
```

### Handler Factory Pattern
```typescript
ActionHandlerFactory
  ├─► ScreenshotActionHandler
  ├─► FillActionHandler
  ├─► ClickActionHandler
  ├─► ScrollActionHandler
  └─► MoveCursorActionHandler
```

### Action Execution Flow
```
Action Request
  │
  ├─► Factory.getHandler(actionType)
  │
  ├─► Handler.execute(page, config, jobId)
  │   ├─► Locate Element (via locator-helper)
  │   ├─► Execute Playwright Operation
  │   ├─► Handle Artifacts (if needed)
  │   └─► Return ActionResult
  │
  └─► Store Result in Job
```

## Error Handling & Retries

### Error Categories
- **Retryable**: TimeoutError, NetworkError, BrowserError
- **Non-Retryable**: InvalidURLError, AuthenticationError

### Retry Strategy
```typescript
if (isRetryable && retryCount < maxRetries) {
  retryCount++
  status = 'pending'
  // Exponential backoff: retryCount² seconds
  delay = retryCount² * 1000
} else {
  status = 'failed'
  errorMessage = error.message
}
```

## Database Transaction Strategy

### Job Locking
Uses PostgreSQL's `FOR UPDATE SKIP LOCKED` to prevent:
- Multiple workers processing the same job
- Race conditions in job selection
- Deadlocks between concurrent workers

### Transaction Flow
```sql
BEGIN TRANSACTION;
  SELECT * FROM automation_jobs
  WHERE status = 'pending'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  
  UPDATE automation_jobs
  SET status = 'processing', started_at = NOW()
  WHERE id = :jobId;
COMMIT;
```

## WebSocket Events

### Event Types
- `job.created`: Job submitted
- `job.started`: Processing began
- `job.progress`: Action execution progress
- `job.completed`: Job finished successfully
- `job.failed`: Job failed permanently

### Event Structure
```typescript
interface JobEvent {
  type: string
  jobId: string
  status: JobStatus
  timestamp: Date
  data: any
}
```

## Resource Management

### Browser Cleanup
- **Idle Timeout**: Close browsers idle > 5 minutes
- **Periodic Cleanup**: Check every 60 seconds
- **Shutdown Cleanup**: Close all browsers on app stop

### Artifact Management
- **Storage**: Filesystem with job-specific directories
- **Database**: Metadata stored in `job_artifacts` table
- **Cleanup**: Configurable retention policy

### Worker Health
- **Heartbeat**: Workers update `last_heartbeat` timestamp
- **Status Tracking**: IDLE, BUSY, OFFLINE states
- **Health Checks**: Monitor worker availability

