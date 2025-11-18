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
    },
    {
      "type": "snapshot",
      "description": "Capture page state including HTML, metadata, and optional storage data",
      "requiredFields": [],
      "optionalFields": ["snapshotConfig"]
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

### Snapshot Action

The SNAPSHOT action captures the current state of a web page, including HTML content, metadata, and optionally browser storage data (cookies, localStorage, sessionStorage). This is useful for debugging, state preservation, and archiving application states.

**Action Type Value**: `"snapshot"`

#### Overview

The SNAPSHOT action captures:
- **HTML content**: The complete HTML source of the current page
- **Metadata**: URL, title, timestamp, viewport dimensions, user agent, language, platform, and timezone
- **Optional storage data**: Cookies, localStorage, and sessionStorage (when enabled via configuration)

The captured data is saved as a JSON artifact that can be retrieved via the job artifacts endpoint.

#### Configuration Options

The snapshot action accepts an optional `snapshotConfig` object to control which browser state data is captured:

```json
{
  "action": "snapshot",
  "snapshotConfig": {
    "cookies": true,
    "localStorage": true,
    "sessionStorage": false
  }
}
```

**Configuration Fields**:

- `cookies` (boolean, optional, default: `false`): When `true`, captures all cookies from the browser context. Cookies are captured as an array of cookie objects with properties like `name`, `value`, `domain`, `path`, `expires`, etc.
- `localStorage` (boolean, optional, default: `false`): When `true`, captures all key-value pairs from the page's localStorage. Data is captured as a plain object where keys are localStorage keys and values are the stored strings.
- `sessionStorage` (boolean, optional, default: `false`): When `true`, captures all key-value pairs from the page's sessionStorage. Data is captured as a plain object where keys are sessionStorage keys and values are the stored strings.

**Note**: All configuration fields are optional. If `snapshotConfig` is omitted entirely, only HTML and metadata will be captured (no storage data).

#### Request Examples

**Basic Example** (HTML and metadata only):

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {
      "action": "snapshot"
    }
  ]
}
```

**Advanced Example** (with all storage data enabled):

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {
      "action": "visit",
      "target": "https://example.com/login"
    },
    {
      "action": "fill",
      "target": "Email",
      "getTargetBy": "getByLabel",
      "value": "user@example.com"
    },
    {
      "action": "fill",
      "target": "Password",
      "getTargetBy": "getByLabel",
      "value": "password123"
    },
    {
      "action": "click",
      "target": "Login",
      "getTargetBy": "getByText",
      "waitForNavigation": true
    },
    {
      "action": "snapshot",
      "snapshotConfig": {
        "cookies": true,
        "localStorage": true,
        "sessionStorage": true
      }
    }
  ]
}
```

#### Response/Artifact Structure

When a SNAPSHOT action completes successfully, it creates an artifact with:
- **Artifact Type**: `"snapshot"`
- **MIME Type**: `"application/json"`
- **File Format**: JSON file named `{timestamp}-snapshot.json`

The JSON artifact contains the following structure:

```json
{
  "html": "<!DOCTYPE html>...",
  "url": "https://example.com/page",
  "title": "Page Title",
  "timestamp": "2025-01-18T10:00:00.000Z",
  "metadata": {
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "userAgent": "Mozilla/5.0...",
    "language": "en-US",
    "platform": "MacIntel",
    "timezone": "America/New_York"
  },
  "cookies": [
    {
      "name": "sessionId",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "expires": 1737216000,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "localStorage": {
    "userId": "12345",
    "theme": "dark",
    "preferences": "{\"notifications\":true}"
  },
  "sessionStorage": {
    "tempData": "value"
  }
}
```

**Field Descriptions**:

- `html` (string, always present): The complete HTML source code of the page
- `url` (string, always present): The current URL of the page
- `title` (string, optional): The page title (may be `undefined` if unavailable)
- `timestamp` (string, always present): ISO 8601 timestamp of when the snapshot was taken
- `metadata` (object, always present): Browser and environment metadata
  - `viewport` (object | null): Viewport dimensions (width, height) or `null` if unavailable
  - `userAgent` (string, optional): Browser user agent string
  - `language` (string, optional): Browser language setting
  - `platform` (string, optional): Operating system platform
  - `timezone` (string, optional): Timezone identifier (e.g., "America/New_York")
- `cookies` (array, optional): Array of cookie objects (only present if `cookies: true` in config). Each cookie object follows the Playwright cookie format.
- `localStorage` (object, optional): Key-value pairs from localStorage (only present if `localStorage: true` in config). Values are always strings.
- `sessionStorage` (object, optional): Key-value pairs from sessionStorage (only present if `sessionStorage: true` in config). Values are always strings.

**Note**: If storage capture fails for any reason, the corresponding field will be set to `null` rather than omitted.

#### Use Cases

1. **Capturing Page State for Debugging**: Take snapshots at various points during automation to inspect the exact state of the page, including HTML structure and metadata.

2. **Preserving Authentication State**: Capture cookies after login to understand session management and authentication tokens.

3. **Archiving Application State**: Save complete application state including localStorage and sessionStorage for later analysis or restoration.

4. **Compliance and Auditing**: Create point-in-time records of page state for compliance requirements or audit trails.

5. **Testing State Transitions**: Capture state before and after actions to verify expected state changes.

#### Browser Compatibility

- Supported in all browser types (Chromium, Firefox, WebKit)
- Storage capture (cookies, localStorage, sessionStorage) works across all supported browsers
- Metadata capture may vary slightly between browsers (e.g., user agent strings)

#### Security Considerations

- **Sensitive Data**: Be aware that snapshots may contain sensitive information including authentication tokens, session IDs, and user data stored in cookies or storage.
- **Storage Access**: Capturing localStorage and sessionStorage requires JavaScript execution in the page context, which may be blocked by Content Security Policy (CSP) in some cases.
- **Cookie Access**: Cookies are captured from the browser context and may include HttpOnly cookies that are not accessible via JavaScript.

#### Performance Implications

- **HTML Capture**: Capturing full HTML content can be memory-intensive for large pages. Consider the page size when using snapshots.
- **Storage Capture**: Reading localStorage and sessionStorage requires JavaScript evaluation, which adds minimal overhead.
- **File Size**: Snapshot artifacts can be large, especially for pages with extensive HTML or significant storage data. Monitor artifact storage usage.

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

