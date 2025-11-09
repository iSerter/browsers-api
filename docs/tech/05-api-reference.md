# API Reference

## Base URL

```
http://localhost:3333/api/v1
```

## Authentication

All endpoints require API key authentication via the `X-API-Key` header:

```
X-API-Key: your-api-key-here
```

## Jobs API

### Create Job

Create a new browser automation job.

**Endpoint**: `POST /jobs`

**Headers**:
- `X-API-Key`: API key (required)
- `Content-Type`: application/json

**Request Body**:
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {
      "action": "fill",
      "target": "Email address",
      "getTargetBy": "getByLabel",
      "value": "user@example.com"
    },
    {
      "action": "click",
      "target": "Submit",
      "getTargetBy": "getByText",
      "waitForNavigation": true
    },
    {
      "action": "screenshot",
      "fullPage": true,
      "type": "png"
    }
  ],
  "waitUntil": "networkidle",
  "priority": 10,
  "timeoutMs": 30000,
  "maxRetries": 3
}
```

**Response**: `201 Created`
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2025-01-18T10:00:00Z"
}
```

**Validation**:
- `browserTypeId`: Integer, min 1
- `targetUrl`: Valid URL with protocol
- `actions`: Array, min 1 item
- `waitUntil`: Enum (load, domcontentloaded, networkidle)
- `priority`: Integer, 0-100
- `timeoutMs`: Integer, 1000-300000
- `maxRetries`: Integer, 0-10

### Get Job

Retrieve job details and status.

**Endpoint**: `GET /jobs/:id`

**Response**: `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "browserTypeId": 1,
  "browserType": {
    "id": 1,
    "name": "Chromium",
    "type": "chromium"
  },
  "targetUrl": "https://example.com",
  "status": "completed",
  "priority": 10,
  "retryCount": 0,
  "maxRetries": 3,
  "timeoutMs": 30000,
  "createdAt": "2025-01-18T10:00:00Z",
  "startedAt": "2025-01-18T10:00:01Z",
  "completedAt": "2025-01-18T10:00:05Z",
  "result": [
    {
      "success": true,
      "data": { "filled": true }
    },
    {
      "success": true,
      "data": { "clicked": true }
    },
    {
      "success": true,
      "artifactId": "artifact-uuid",
      "data": {
        "filePath": "/artifacts/job-id/screenshot.png"
      }
    }
  ],
  "artifacts": [
    {
      "id": "artifact-uuid",
      "artifactType": "screenshot",
      "filePath": "/artifacts/job-id/screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 123456,
      "createdAt": "2025-01-18T10:00:05Z"
    }
  ]
}
```

### List Jobs

List jobs with filtering and pagination.

**Endpoint**: `GET /jobs`

**Query Parameters**:
- `status`: Filter by status (pending, processing, completed, failed, cancelled)
- `browserTypeId`: Filter by browser type
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `createdAfter`: ISO timestamp
- `createdBefore`: ISO timestamp

**Example**: `GET /jobs?status=completed&page=1&limit=10`

**Response**: `200 OK`
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "targetUrl": "https://example.com",
      "createdAt": "2025-01-18T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

### Cancel Job

Cancel a pending or processing job.

**Endpoint**: `DELETE /jobs/:id`

**Response**: `204 No Content`

**Errors**:
- `404`: Job not found
- `400`: Job cannot be cancelled (already completed/failed)

### Get Job Artifacts

Retrieve artifacts for a job.

**Endpoint**: `GET /jobs/:id/artifacts`

**Response**: `200 OK`
```json
[
  {
    "id": "artifact-uuid",
    "artifactType": "screenshot",
    "filePath": "/artifacts/job-id/screenshot.png",
    "mimeType": "image/png",
    "sizeBytes": 123456,
    "createdAt": "2025-01-18T10:00:05Z"
  }
]
```

## Actions

### Available Actions

**Endpoint**: `GET /actions`

**Response**: `200 OK`
```json
{
  "actions": [
    {
      "type": "screenshot",
      "description": "Capture screenshot",
      "requiredFields": ["type"],
      "optionalFields": ["fullPage", "selector"]
    },
    {
      "type": "fill",
      "description": "Fill form field",
      "requiredFields": ["target", "getTargetBy", "value"],
      "optionalFields": []
    },
    {
      "type": "click",
      "description": "Click element",
      "requiredFields": ["target", "getTargetBy"],
      "optionalFields": ["button", "clickCount", "waitForNavigation"]
    },
    {
      "type": "scroll",
      "description": "Scroll page",
      "requiredFields": [],
      "optionalFields": ["target", "getTargetBy", "targetY", "speed", "variance"]
    },
    {
      "type": "moveCursor",
      "description": "Move cursor to element",
      "requiredFields": ["target", "getTargetBy"],
      "optionalFields": ["speed", "jitter", "overshoot"]
    }
  ]
}
```

## Action Configurations

### Screenshot Action

```json
{
  "action": "screenshot",
  "type": "png",
  "fullPage": true
}
```

**Options**:
- `type`: Image format (png, jpeg)
- `fullPage`: Capture full page (default: false)
- `selector`: CSS selector for element screenshot

### Fill Action

```json
{
  "action": "fill",
  "target": "Email address",
  "getTargetBy": "getByLabel",
  "value": "user@example.com"
}
```

**Target Methods**:
- `getByLabel`: Find by label text
- `getByText`: Find by visible text
- `getByRole`: Find by ARIA role
- `getBySelector`: Find by CSS selector
- `getByPlaceholder`: Find by placeholder text

### Click Action

```json
{
  "action": "click",
  "target": "Submit",
  "getTargetBy": "getByText",
  "button": "left",
  "clickCount": 1,
  "waitForNavigation": true
}
```

**Options**:
- `button`: Mouse button (left, right, middle)
- `clickCount`: Number of clicks (default: 1)
- `waitForNavigation`: Wait for navigation after click

### Scroll Action

```json
{
  "action": "scroll",
  "target": "#footer",
  "getTargetBy": "getBySelector",
  "speed": 2000,
  "variance": 0.4
}
```

**Options**:
- `targetY`: Scroll to specific Y position
- `target`: Element to scroll to
- `getTargetBy`: How to find target element
- `speed`: Scroll speed in milliseconds
- `variance`: Randomness factor (0-1)

### Move Cursor Action

```json
{
  "action": "moveCursor",
  "target": "Submit",
  "getTargetBy": "getByText",
  "speed": 1000,
  "jitter": 0.1,
  "overshoot": 0.2
}
```

**Options**:
- `speed`: Movement speed in milliseconds
- `jitter`: Random movement factor (0-1)
- `overshoot`: Overshoot factor (0-1)

## Workers API

### List Workers

**Endpoint**: `GET /workers`

**Response**: `200 OK`
```json
[
  {
    "id": "worker-uuid",
    "browserType": {
      "id": 1,
      "name": "Chromium"
    },
    "status": "idle",
    "currentJobId": null,
    "lastHeartbeat": "2025-01-18T10:00:00Z",
    "startedAt": "2025-01-18T09:00:00Z"
  }
]
```

### Get Worker Stats

**Endpoint**: `GET /workers/stats`

**Response**: `200 OK`
```json
{
  "totalWorkers": 5,
  "idleWorkers": 3,
  "busyWorkers": 2,
  "offlineWorkers": 0,
  "byBrowserType": {
    "Chromium": {
      "total": 3,
      "idle": 2,
      "busy": 1
    },
    "Firefox": {
      "total": 2,
      "idle": 1,
      "busy": 1
    }
  }
}
```

## Browsers API

### List Browser Types

**Endpoint**: `GET /browsers`

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "name": "Chromium",
    "type": "chromium",
    "deviceType": "desktop",
    "viewportWidth": 1920,
    "viewportHeight": 1080,
    "isActive": true
  }
]
```

### Get Browser Type

**Endpoint**: `GET /browsers/:id`

**Response**: `200 OK`
```json
{
  "id": 1,
  "name": "Chromium",
  "type": "chromium",
  "deviceType": "desktop",
  "viewportWidth": 1920,
  "viewportHeight": 1080,
  "isActive": true,
  "createdAt": "2025-01-18T00:00:00Z",
  "updatedAt": "2025-01-18T00:00:00Z"
}
```

## Health API

### Health Check

**Endpoint**: `GET /health`

**Response**: `200 OK`
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "browserPool": { "status": "up" },
    "workers": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "browserPool": { "status": "up" },
    "workers": { "status": "up" }
  }
}
```

## Metrics API

### Prometheus Metrics

**Endpoint**: `GET /metrics`

**Response**: `200 OK` (Prometheus format)
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/api/v1/jobs"} 100

# HELP jobs_total Total number of jobs
# TYPE jobs_total counter
jobs_total{status="completed"} 50
jobs_total{status="failed"} 5
```

## WebSocket Events

### Connection

Connect to job events:

```javascript
const socket = io('http://localhost:3333', {
  path: '/api/v1/ws'
});

socket.on('job.created', (event) => {
  console.log('Job created:', event);
});

socket.on('job.started', (event) => {
  console.log('Job started:', event);
});

socket.on('job.progress', (event) => {
  console.log('Progress:', event.data.progress);
});

socket.on('job.completed', (event) => {
  console.log('Job completed:', event);
});

socket.on('job.failed', (event) => {
  console.log('Job failed:', event);
});
```

### Event Structure

```typescript
interface JobEvent {
  type: 'job.created' | 'job.started' | 'job.progress' | 'job.completed' | 'job.failed'
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  timestamp: Date
  data: any
}
```

## Error Responses

### Standard Error Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2025-01-18T10:00:00Z",
  "path": "/api/v1/jobs",
  "correlationId": "correlation-uuid"
}
```

### Common Status Codes

- `200 OK`: Success
- `201 Created`: Resource created
- `204 No Content`: Success (no body)
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing/invalid API key
- `403 Forbidden`: URL policy violation
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Rate Limiting

Rate limits are applied per API key:
- Default: 100 requests per minute
- Configurable per API key
- Headers returned:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

