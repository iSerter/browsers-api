# Job Processing & Worker System

## Job Processing Architecture

The job processing system uses a **polling-based worker pattern** where background workers continuously poll the database for pending jobs and execute them.

## Worker Lifecycle

```
┌─────────────┐
│   IDLE      │ ← Worker ready, no active job
└──────┬──────┘
       │
       │ Job acquired
       ▼
┌─────────────┐
│    BUSY     │ ← Processing job
└──────┬──────┘
       │
       ├──► Job completed ──► IDLE
       │
       └──► Worker stopped ──► OFFLINE
```

## Job Processor Service

### Initialization

The `JobProcessorService` starts automatically when the application boots:

```typescript
async onModuleInit() {
  await this.start();
}
```

### Polling Mechanism

Workers poll the database every 1 second (configurable):

```typescript
setInterval(async () => {
  if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
    return; // Skip if at capacity
  }
  await this.pollAndProcessJob();
}, 1000);
```

### Job Selection

Uses PostgreSQL's `FOR UPDATE SKIP LOCKED` to prevent race conditions:

```sql
SELECT * FROM automation_jobs
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

**Benefits**:
- Prevents multiple workers from picking the same job
- No deadlocks between concurrent workers
- Efficient job distribution

### Job Execution Flow

```
1. Poll Database
   │
   ├─► Find Pending Job (FOR UPDATE SKIP LOCKED)
   │
   ├─► Update Status: pending → processing
   │
   ├─► Set started_at = NOW()
   │
   ├─► Commit Transaction
   │
   ├─► Emit WebSocket Event (job.started)
   │
2. Acquire Browser
   │
   ├─► Get Browser Type from Database
   │
   ├─► BrowserPoolService.acquire(browserType)
   │
   └─► Browser Instance Retrieved
   │
3. Create Browser Context
   │
   ├─► BrowserContextManager.createContext()
   │
   ├─► Set Viewport (1920x1080 default)
   │
   └─► Context Created
   │
4. Navigate to URL
   │
   ├─► page.goto(targetUrl, { waitUntil, timeout })
   │
   └─► Page Loaded
   │
5. Execute Actions
   │
   ├─► For each action:
   │   ├─► Get Handler from Factory
   │   ├─► Execute Handler
   │   ├─► Store Result
   │   └─► Emit Progress Event
   │
6. Complete Job
   │
   ├─► Update Status: processing → completed
   │
   ├─► Set completed_at = NOW()
   │
   ├─► Store Results in result JSONB
   │
   ├─► Release Browser to Pool
   │
   └─► Emit WebSocket Event (job.completed)
```

## Concurrency Control

### Active Job Limit

Workers respect a maximum concurrent job limit (default: 5):

```typescript
if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
  return; // Skip polling
}
```

### Browser Pool Limits

Browser pools have configurable min/max sizes:
- **Min Size**: Pre-warmed browsers (default: 1)
- **Max Size**: Maximum concurrent browsers (default: 5)

If pool is at max capacity, workers wait for available browsers.

## Error Handling

### Error Categorization

Errors are categorized for retry logic:

```typescript
Retryable:
  - TimeoutError
  - NetworkError
  - BrowserError

Non-Retryable:
  - InvalidURLError
  - AuthenticationError
```

### Retry Strategy

```typescript
if (isRetryable && retryCount < maxRetries) {
  retryCount++
  status = 'pending'
  startedAt = null
  // Exponential backoff: retryCount² seconds
} else {
  status = 'failed'
  errorMessage = error.message
  completedAt = NOW()
}
```

### Retry Flow

```
Job Execution Fails
    │
    ├─► Categorize Error
    │
    ├─► Is Retryable?
    │   │
    │   ├─► YES
    │   │   ├─► retryCount++
    │   │   ├─► status = 'pending'
    │   │   ├─► Calculate Backoff Delay
    │   │   └─► Job Re-queued
    │   │
    │   └─► NO
    │       ├─► status = 'failed'
    │       ├─► errorMessage = error.message
    │       └─► Emit job.failed Event
```

## Worker Management

### Worker Status Tracking

Workers maintain status in `browser_workers` table:

- **IDLE**: Ready to process jobs
- **BUSY**: Currently processing a job
- **OFFLINE**: Worker stopped or unhealthy

### Heartbeat System

Workers update `last_heartbeat` timestamp:

```typescript
await this.workerManagerService.setWorkerStatus(WorkerStatus.BUSY);
await this.workerManagerService.setCurrentJob(jobId);
```

Health checks monitor heartbeat timestamps to detect offline workers.

### Worker Registration

Workers are automatically registered when `JobProcessorService` starts:

```typescript
async onModuleInit() {
  await this.workerManagerService.registerWorker();
  await this.start();
}
```

## Job Logging

### Log Levels

- **DEBUG**: Detailed execution information
- **INFO**: Important events (job start, completion)
- **WARN**: Retry attempts, recoverable issues
- **ERROR**: Failures, exceptions

### Log Storage

Logs are stored in `job_logs` table with:
- Job ID reference
- Log level
- Message
- Metadata (JSONB)
- Timestamp

### Log Examples

```typescript
// Job started
await jobLogService.logJobEvent(
  jobId,
  LogLevel.INFO,
  'Job processing started',
  { targetUrl: job.targetUrl }
);

// Action execution
await jobLogService.logJobEvent(
  jobId,
  LogLevel.DEBUG,
  'Executing action: click',
  { action: 'click', target: 'Submit' }
);

// Error
await jobLogService.logJobEvent(
  jobId,
  LogLevel.ERROR,
  error.message,
  { errorName: error.name, stack: error.stack }
);
```

## Shutdown Handling

### Graceful Shutdown

On application shutdown:

```typescript
async onModuleDestroy() {
  await this.stop();
}

async stop() {
  this.isRunning = false;
  // Stop polling
  clearInterval(this.pollingInterval);
  // Wait for active jobs (max 60s)
  await this.waitForActiveJobs(60000);
}
```

### Active Job Completion

Workers wait for active jobs to complete before shutting down:
- Maximum wait: 60 seconds
- Logs warning if timeout exceeded
- Active job IDs logged for debugging

## Performance Considerations

### Database Connection Pooling

TypeORM manages database connections:
- Default pool size: 10
- Configurable via database config
- Prevents connection exhaustion

### Browser Reuse

Browser instances are reused across jobs:
- Reduces startup overhead
- Improves throughput
- Manages resource consumption

### Indexing Strategy

Database indexes optimize job selection:
- `idx_jobs_priority_created`: Fast pending job queries
- `idx_jobs_status`: Status filtering
- `idx_jobs_browser_type`: Browser type filtering

## Monitoring

### Worker Statistics

Track worker health and performance:
- Total workers
- Idle/Busy/Offline counts
- Per-browser-type breakdown

### Job Metrics

Monitor job processing:
- Jobs by status
- Average processing time
- Retry rates
- Error rates

### Health Checks

Health endpoints verify:
- Worker availability
- Browser pool status
- Database connectivity

