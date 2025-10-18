# Browser Automation API - Comprehensive Design Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Core Modules](#core-modules)
7. [Browser Worker System](#browser-worker-system)
8. [Request Processing Flow](#request-processing-flow)
9. [Configuration](#configuration)
10. [Security Considerations](#security-considerations)
11. [Error Handling](#error-handling)
12. [Monitoring & Logging](#monitoring--logging)
13. [Scalability Considerations](#scalability-considerations)

---

## Overview

The Browser Automation API is a scalable Nest.js application that provides HTTP endpoints for browser automation tasks using Playwright. The system follows a producer-consumer pattern where API requests are queued in PostgreSQL and processed asynchronously by browser workers.

### Key Features
- RESTful API for browser automation operations
- Support for multiple browser types (Chromium, Firefox, WebKit, Mobile variants)
- Asynchronous job processing with background workers
- Result storage and retrieval
- Browser pool management for optimal resource utilization
- Comprehensive error handling and retry mechanisms

---

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│   API Client    │
└────────┬────────┘
         │ HTTP Request
         ▼
┌─────────────────────────────────────┐
│         Nest.js API Layer           │
│  ┌──────────────────────────────┐   │
│  │   Controllers & Services     │   │
│  └──────────────┬───────────────┘   │
└─────────────────┼───────────────────┘
                  │ Write Job
                  ▼
         ┌─────────────────┐
         │   PostgreSQL    │
         │   Job Queue     │
         └────────┬────────┘
                  │ Poll Jobs
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│ Browser Worker  │ │ Browser Worker  │
│   (Chromium)    │ │   (Firefox)     │
└────────┬────────┘ └────────┬────────┘
         │                    │
         │ Update Results     │
         └────────┬───────────┘
                  ▼
         ┌─────────────────┐
         │   PostgreSQL    │
         │  Results Store  │
         └─────────────────┘
```

### Component Layers

1. **API Layer**: Handles HTTP requests, validation, and response formatting
2. **Service Layer**: Business logic and orchestration
3. **Data Layer**: Database operations and entities
4. **Worker Layer**: Background job processing with Playwright
5. **Browser Pool**: Manages browser instances for efficient resource usage

---

## Technology Stack

### Core Dependencies
- **Framework**: Nest.js (v10.x)
- **Runtime**: Node.js (v20.x LTS)
- **Database**: PostgreSQL (v15.x)
- **ORM**: TypeORM
- **Automation**: Playwright (v1.40+)
- **Validation**: class-validator, class-transformer
- **Queue Management**: Bull (Redis-based) or custom PostgreSQL queue
- **Configuration**: @nestjs/config

### Additional Libraries
- **Logging**: Winston or Pino
- **Documentation**: Swagger (@nestjs/swagger)
- **Testing**: Jest, Supertest
- **Monitoring**: Prometheus metrics (optional)

---

## Database Schema

### Tables

#### 1. `browser_types`
Stores available browser configurations.

```sql
CREATE TABLE browser_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'chromium', 'firefox', 'webkit'
  device_type VARCHAR(20) DEFAULT 'desktop', -- 'desktop', 'mobile'
  user_agent TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sample data
INSERT INTO browser_types (name, type, device_type, viewport_width, viewport_height) VALUES
  ('Chromium', 'chromium', 'desktop', 1920, 1080),
  ('Firefox', 'firefox', 'desktop', 1920, 1080),
  ('WebKit', 'webkit', 'desktop', 1920, 1080),
  ('Mobile Chrome', 'chromium', 'mobile', 375, 667),
  ('Mobile Firefox', 'firefox', 'mobile', 375, 667);
```

#### 2. `automation_jobs`
Stores all automation requests and their status.

```sql
CREATE TABLE automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_type_id INTEGER REFERENCES browser_types(id),
  target_url TEXT NOT NULL, -- URL to visit first
  actions JSONB NOT NULL, -- Array of actions to perform: [{"action": "fill", "target": "email", "getTargetBy": "getByLabel", "value": "test@example.com"}]
  wait_until VARCHAR(20) DEFAULT 'networkidle', -- 'load', 'domcontentloaded', 'networkidle'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  result JSONB,
  CONSTRAINT actions_is_array CHECK (jsonb_typeof(actions) = 'array')
);

CREATE INDEX idx_jobs_status ON automation_jobs(status);
CREATE INDEX idx_jobs_browser_type ON automation_jobs(browser_type_id);
CREATE INDEX idx_jobs_created_at ON automation_jobs(created_at);
CREATE INDEX idx_jobs_priority_created ON automation_jobs(priority DESC, created_at ASC) WHERE status = 'pending';

-- Example data structure for actions column:
-- [
--   {"action": "fill", "target": "Your e-mail address", "getTargetBy": "getByLabel", "value": "user@example.com"},
--   {"action": "fill", "target": "#password", "getTargetBy": "getBySelector", "value": "secret123"},
--   {"action": "click", "target": "Submit", "getTargetBy": "getByText"},
--   {"action": "screenshot", "fullPage": true, "format": "png"},
--   {"action": "extract", "target": "h1", "getTargetBy": "getBySelector", "attribute": "textContent"},
--   {"action": "wait", "milliseconds": 2000}
-- ]
```

#### 3. `job_artifacts`
Stores screenshots, PDFs, and other binary artifacts.

```sql
CREATE TABLE job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
  artifact_type VARCHAR(50) NOT NULL, -- 'screenshot', 'pdf', 'video', 'trace'
  file_path TEXT, -- If stored on disk
  file_data BYTEA, -- If stored in database (for small files)
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_artifacts_job_id ON job_artifacts(job_id);
```

#### 4. `browser_workers`
Tracks active browser workers.

```sql
CREATE TABLE browser_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_type_id INTEGER REFERENCES browser_types(id),
  status VARCHAR(20) DEFAULT 'idle', -- 'idle', 'busy', 'offline'
  current_job_id UUID REFERENCES automation_jobs(id),
  last_heartbeat TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB -- Additional worker info
);

CREATE INDEX idx_workers_status ON browser_workers(status);
CREATE INDEX idx_workers_browser_type ON browser_workers(browser_type_id);
```

#### 5. `job_logs`
Detailed execution logs for debugging.

```sql
CREATE TABLE job_logs (
  id SERIAL PRIMARY KEY,
  job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
  level VARCHAR(20), -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_logs_job_id ON job_logs(job_id);
CREATE INDEX idx_logs_created_at ON job_logs(created_at);
```

---

## API Endpoints

### 1. Browser Types

#### `GET /api/v1/browsers`
List all available browser types.

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Chromium",
      "type": "chromium",
      "deviceType": "desktop",
      "viewport": { "width": 1920, "height": 1080 },
      "isActive": true
    }
  ]
}
```

#### `GET /api/v1/browsers/:id`
Get specific browser type details.

---

### 2. Job Management

#### `POST /api/v1/jobs`
Create a new automation job.

**Request Body:**
```json
{
  "browserTypeId": 1,
  "actionType": "screenshot",
  "payload": {
    "url": "https://example.com",
    "fullPage": true,
    "waitUntil": "networkidle"
  },
  "priority": 0,
  "timeoutMs": 30000
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2025-10-18T10:00:00Z"
}
```

#### `GET /api/v1/jobs/:jobId`
Get job status and results.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "actionType": "screenshot",
  "result": {
    "screenshotUrl": "/api/v1/jobs/550e8400.../artifacts/screenshot.png",
    "duration": 2500
  },
  "createdAt": "2025-10-18T10:00:00Z",
  "completedAt": "2025-10-18T10:00:03Z"
}
```

#### `GET /api/v1/jobs`
List jobs with filtering and pagination.

**Query Parameters:**
- `status`: Filter by status
- `browserTypeId`: Filter by browser type
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

#### `DELETE /api/v1/jobs/:jobId`
Cancel a pending job.

#### `GET /api/v1/jobs/:jobId/artifacts/:artifactId`
Download job artifact (screenshot, PDF, etc.).

#### `GET /api/v1/jobs/:jobId/logs`
Get detailed execution logs for a job.

---

### 3. Action-Specific Endpoints

#### `POST /api/v1/actions/visit`
Navigate to a URL.

**Payload:**
```json
{
  "url": "https://example.com",
  "waitUntil": "networkidle",
  "timeout": 30000
}
```

#### `POST /api/v1/actions/screenshot`
Take a screenshot.

**Payload:**
```json
{
  "url": "https://example.com",
  "fullPage": true,
  "selector": "#content",
  "format": "png",
  "quality": 90
}
```

#### `POST /api/v1/actions/form-fill`
Fill form and optionally submit.

**Payload:**
```json
{
  "url": "https://example.com/form",
  "actions": [
    { "type": "fill", "selector": "#email", "value": "user@example.com" },
    { "type": "fill", "selector": "#password", "value": "secret" },
    { "type": "click", "selector": "#submit" }
  ],
  "waitForNavigation": true
}
```

#### `POST /api/v1/actions/extract`
Extract data from a page.

**Payload:**
```json
{
  "url": "https://example.com",
  "extractors": [
    { "name": "title", "selector": "h1", "attribute": "textContent" },
    { "name": "links", "selector": "a", "attribute": "href", "multiple": true }
  ]
}
```

#### `POST /api/v1/actions/pdf`
Generate PDF of a page.

**Payload:**
```json
{
  "url": "https://example.com",
  "format": "A4",
  "printBackground": true,
  "margin": { "top": "1cm", "right": "1cm", "bottom": "1cm", "left": "1cm" }
}
```

---

### 4. Worker Management

#### `GET /api/v1/workers`
List active workers and their status.

#### `GET /api/v1/workers/stats`
Get worker pool statistics.

**Response:**
```json
{
  "totalWorkers": 10,
  "idleWorkers": 7,
  "busyWorkers": 3,
  "byBrowserType": {
    "Chromium": { "total": 5, "idle": 3, "busy": 2 },
    "Firefox": { "total": 5, "idle": 4, "busy": 1 }
  }
}
```

---

## Core Modules

### Module Structure

```
src/
├── app.module.ts
├── main.ts
├── config/
│   ├── database.config.ts
│   ├── playwright.config.ts
│   └── worker.config.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── modules/
│   ├── browsers/
│   │   ├── browsers.module.ts
│   │   ├── browsers.controller.ts
│   │   ├── browsers.service.ts
│   │   ├── entities/browser-type.entity.ts
│   │   └── dto/
│   ├── jobs/
│   │   ├── jobs.module.ts
│   │   ├── jobs.controller.ts
│   │   ├── jobs.service.ts
│   │   ├── jobs.gateway.ts (WebSocket for real-time updates)
│   │   ├── entities/
│   │   │   ├── job.entity.ts
│   │   │   ├── job-artifact.entity.ts
│   │   │   └── job-log.entity.ts
│   │   └── dto/
│   ├── actions/
│   │   ├── actions.module.ts
│   │   ├── actions.controller.ts
│   │   ├── actions.service.ts
│   │   └── dto/
│   └── workers/
│       ├── workers.module.ts
│       ├── workers.controller.ts
│       ├── workers.service.ts
│       ├── browser-pool.service.ts
│       ├── job-processor.service.ts
│       ├── worker-manager.service.ts
│       ├── entities/worker.entity.ts
│       └── handlers/
│           ├── visit.handler.ts
│           ├── screenshot.handler.ts
│           ├── form-fill.handler.ts
│           ├── extract.handler.ts
│           └── pdf.handler.ts
└── shared/
    ├── interfaces/
    ├── types/
    └── utils/
```

---

### Key Module Descriptions

#### 1. **BrowsersModule**
Manages browser type configurations.

**Responsibilities:**
- CRUD operations for browser types
- Browser capability validation
- Browser configuration management

**Key Services:**
- `BrowsersService`: Business logic for browser management

#### 2. **JobsModule**
Handles job lifecycle management.

**Responsibilities:**
- Job creation and validation
- Status tracking and updates
- Result retrieval
- Job cancellation
- Real-time status updates via WebSocket

**Key Services:**
- `JobsService`: Job CRUD operations
- `JobQueueService`: Queue management
- `JobsGateway`: WebSocket events

#### 3. **ActionsModule**
Provides action-specific endpoints and validation.

**Responsibilities:**
- Action-specific request handling
- Payload validation for each action type
- Action orchestration

**Key Services:**
- `ActionsService`: Action routing and validation

#### 4. **WorkersModule**
Core worker system for job processing.

**Responsibilities:**
- Browser pool management
- Job polling and execution
- Worker lifecycle management
- Heartbeat monitoring
- Action handler execution

**Key Services:**
- `BrowserPoolService`: Manages browser instances
- `JobProcessorService`: Executes jobs
- `WorkerManagerService`: Worker coordination
- Action Handlers: Implement specific automation logic

---

## Browser Worker System

### Worker Architecture

#### Browser Pool Service

```typescript
@Injectable()
export class BrowserPoolService {
  private pools: Map<number, BrowserPool>;

  async initializePool(browserTypeId: number, poolSize: number) {
    // Initialize browser instances
  }

  async acquireBrowser(browserTypeId: number): Promise<Browser> {
    // Get available browser from pool
  }

  async releaseBrowser(browserTypeId: number, browser: Browser) {
    // Return browser to pool
  }

  async closePool(browserTypeId: number) {
    // Clean shutdown
  }
}
```

**Pool Configuration:**
- Minimum pool size: 1 per browser type
- Maximum pool size: Configurable (default: 5)
- Idle timeout: 5 minutes
- Browser reuse: Max 100 pages per browser instance

#### Job Processor Service

```typescript
@Injectable()
export class JobProcessorService implements OnModuleInit {
  async onModuleInit() {
    // Start worker loops for each browser type
    this.startWorkers();
  }

  private async startWorkers() {
    for (const browserType of this.browserTypes) {
      for (let i = 0; i < browserType.workerCount; i++) {
        this.startWorker(browserType);
      }
    }
  }

  private async startWorker(browserType: BrowserType) {
    while (true) {
      const job = await this.pollNextJob(browserType.id);
      if (job) {
        await this.processJob(job);
      } else {
        await this.sleep(1000); // Poll interval
      }
    }
  }

  private async processJob(job: AutomationJob) {
    const handler = this.getHandler(job.actionType);
    const browser = await this.browserPool.acquireBrowser(job.browserTypeId);
    
    try {
      const result = await handler.execute(browser, job.payload);
      await this.jobsService.completeJob(job.id, result);
    } catch (error) {
      await this.handleJobError(job, error);
    } finally {
      await this.browserPool.releaseBrowser(job.browserTypeId, browser);
    }
  }
}
```

### Action Handlers

Each action type has a dedicated handler implementing the `ActionHandler` interface:

```typescript
interface ActionHandler {
  execute(browser: Browser, payload: any): Promise<any>;
}

@Injectable()
export class ScreenshotHandler implements ActionHandler {
  async execute(browser: Browser, payload: ScreenshotPayload) {
    const context = await browser.newContext({
      viewport: payload.viewport
    });
    const page = await context.newPage();
    
    await page.goto(payload.url, {
      waitUntil: payload.waitUntil || 'networkidle'
    });
    
    const screenshot = await page.screenshot({
      fullPage: payload.fullPage,
      type: payload.format || 'png'
    });
    
    await context.close();
    
    return {
      screenshot: screenshot.toString('base64'),
      url: payload.url
    };
  }
}
```

---

## Request Processing Flow

### Flow Diagram

```
1. Client Request
   ↓
2. Controller (Validation)
   ↓
3. Service Layer (Business Logic)
   ↓
4. Create Job Record (status=pending)
   ↓
5. Return Job ID to Client
   ↓
[Asynchronous Processing]
   ↓
6. Worker Polls Job Queue
   ↓
7. Update Job (status=processing)
   ↓
8. Acquire Browser from Pool
   ↓
9. Execute Action Handler
   ↓
10. Store Results/Artifacts
   ↓
11. Update Job (status=completed/failed)
   ↓
12. Release Browser to Pool
   ↓
13. Client Polls/WebSocket for Results
```

### Polling Strategy

**Database Polling Query:**
```sql
SELECT * FROM automation_jobs
WHERE status = 'pending'
  AND browser_type_id = $1
  AND (retry_count < max_retries OR retry_count IS NULL)
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

**Benefits of SKIP LOCKED:**
- Prevents multiple workers from grabbing the same job
- Non-blocking for high concurrency
- Efficient row-level locking

---

## Configuration

### Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=automation_user
DB_PASSWORD=secure_password
DB_DATABASE=browser_automation

# Worker Configuration
WORKER_POLL_INTERVAL_MS=1000
WORKER_MAX_CONCURRENT_JOBS=10
BROWSER_POOL_MIN_SIZE=1
BROWSER_POOL_MAX_SIZE=5
BROWSER_IDLE_TIMEOUT_MS=300000

# Job Configuration
DEFAULT_JOB_TIMEOUT_MS=30000
MAX_JOB_RETRIES=3
JOB_CLEANUP_AFTER_DAYS=7

# Storage
ARTIFACT_STORAGE_TYPE=filesystem # or 'database', 's3'
ARTIFACT_STORAGE_PATH=/var/app/artifacts
MAX_ARTIFACT_SIZE_MB=50

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=30000
PLAYWRIGHT_SCREENSHOTS_DIR=/var/app/screenshots

# Security
API_KEY_HEADER=X-API-Key
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
LOG_LEVEL=info
```

---

## Security Considerations

### 1. **Input Validation**
- Strict DTO validation using class-validator
- URL whitelist/blacklist for allowed domains
- Payload size limits
- SQL injection prevention via parameterized queries

### 2. **Authentication & Authorization**
```typescript
@Controller('api/v1/jobs')
@UseGuards(ApiKeyGuard)
export class JobsController {
  // Protected endpoints
}
```

**Implementation Options:**
- API Key authentication
- JWT tokens
- OAuth 2.0 for user-based access
- Rate limiting per API key

### 3. **Resource Limits**
- Maximum concurrent jobs per client
- Timeout enforcement
- Memory limits per browser context
- CPU throttling for intensive operations

### 4. **Sandboxing**
- Run browsers in isolated contexts
- Disable unnecessary browser features
- Network request filtering
- File system access restrictions

### 5. **Secrets Management**
- Environment-based configuration
- Never log sensitive payloads
- Encrypted credential storage for form fills

---

## Error Handling

### Error Types and Retry Strategy

```typescript
enum JobErrorType {
  TIMEOUT = 'timeout',
  NAVIGATION_FAILED = 'navigation_failed',
  SELECTOR_NOT_FOUND = 'selector_not_found',
  BROWSER_CRASHED = 'browser_crashed',
  VALIDATION_ERROR = 'validation_error'
}

interface RetryPolicy {
  retryableErrors: JobErrorType[];
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential';
}
```

**Retry Logic:**
- Transient errors (timeout, network): Retry with exponential backoff
- Permanent errors (validation, selector): No retry
- Browser crashes: Retry with new browser instance

**Error Response Format:**
```json
{
  "statusCode": 500,
  "error": "JobExecutionError",
  "message": "Failed to take screenshot",
  "details": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "errorType": "TIMEOUT",
    "retryCount": 2,
    "canRetry": true
  }
}
```

---

## Monitoring & Logging

### Metrics to Track

1. **Job Metrics:**
   - Jobs created per minute
   - Job completion rate
   - Average job duration by action type
   - Job failure rate by error type
   - Queue depth

2. **Worker Metrics:**
   - Active workers
   - Worker utilization rate
   - Browser pool usage
   - Browser instance recycling rate

3. **Performance Metrics:**
   - API response times
   - Database query performance
   - Memory usage per browser
   - CPU usage

### Logging Strategy

```typescript
// Structured logging
this.logger.log('Job started', {
  jobId: job.id,
  actionType: job.actionType,
  browserType: job.browserType.name,
  timestamp: new Date().toISOString()
});

// Log levels
- ERROR: Job failures, system errors
- WARN: Retries, timeouts, deprecated usage
- INFO: Job lifecycle events, worker status changes
- DEBUG: Detailed execution steps, payload data
```

### Health Checks

```typescript
@Controller('health')
export class HealthController {
  @Get()
  async check() {
    return {
      status: 'ok',
      database: await this.checkDatabase(),
      workers: await this.checkWorkers(),
      browserPool: await this.checkBrowserPool()
    };
  }
}
```

---

## Scalability Considerations

### Horizontal Scaling

**Multi-Instance Deployment:**
- Stateless API servers (scale independently)
- Worker nodes can run on separate machines
- Shared PostgreSQL database
- Load balancer for API traffic

**Database Optimization:**
- Connection pooling (pg-pool)
- Read replicas for job status queries
- Partitioning `automation_jobs` by date
- Archiving old completed jobs

### Vertical Scaling

**Resource Allocation:**
- 2GB RAM per browser instance (minimum)
- CPU cores: 1 core per 2-3 concurrent browsers
- Disk: SSD for artifact storage
- Network: Low latency to database

### Alternative Queue Systems

**For Higher Throughput:**
Consider replacing PostgreSQL queue with:
- **Bull/BullMQ**: Redis-based, built-in retries, job priorities
- **RabbitMQ**: Message durability, advanced routing
- **AWS SQS**: Managed service, infinite scaling

**Trade-offs:**
- PostgreSQL: Simpler architecture, transactional consistency
- External Queue: Better performance, more complexity

### Caching Strategy

```typescript
// Cache browser configurations
@Cacheable('browser-types', 3600)
async findAllBrowserTypes() {
  return this.browserTypeRepository.find();
}

// Cache job results (for idempotent operations)
@Cacheable('job-results', 300)
async getJobResult(jobId: string) {
  return this.jobRepository.findOne(jobId);
}
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Set up Nest.js project with TypeORM
- [ ] Design and create database schema
- [ ] Implement browser types CRUD
- [ ] Set up Playwright with basic browser pool

### Phase 2: Job Management
- [ ] Implement job creation API
- [ ] Build job queue system
- [ ] Add job status endpoints
- [ ] Implement artifact storage

### Phase 3: Worker System
- [ ] Create browser pool service
- [ ] Implement job processor
- [ ] Build action handlers (visit, screenshot, form-fill)
- [ ] Add error handling and retry logic

### Phase 4: Advanced Features
- [ ] WebSocket support for real-time updates
- [ ] Worker monitoring and statistics
- [ ] Advanced actions (PDF, extract, complex flows)
- [ ] Rate limiting and authentication

### Phase 5: Production Readiness
- [ ] Comprehensive logging
- [ ] Metrics and monitoring
- [ ] Performance optimization
- [ ] Security hardening
- [ ] API documentation (Swagger)
- [ ] Load testing

---

## Example Usage

### Creating a Screenshot Job

```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "browserTypeId": 1,
    "actionType": "screenshot",
    "payload": {
      "url": "https://example.com",
      "fullPage": true,
      "format": "png"
    }
  }'
```

### Polling Job Status

```bash
curl http://localhost:3000/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-api-key"
```

### Downloading Screenshot

```bash
curl http://localhost:3000/api/v1/jobs/550e8400.../artifacts/screenshot.png \
  -H "X-API-Key: your-api-key" \
  --output screenshot.png
```

---

## Conclusion

This design provides a robust, scalable foundation for a browser automation API. The architecture separates concerns clearly, allows for horizontal scaling, and provides comprehensive error handling and monitoring capabilities. The PostgreSQL-based queue is simple to start with, but the modular design allows for easy migration to more sophisticated queueing systems as needs grow.