
For now, it's just my playground. 

I'm experimenting with task-master and Github Speckit. 


# Browsers API

Browser Automation API that provides HTTP endpoints for browser tasks using Playwright. The system follows a producer-consumer pattern where API requests are queued in PostgreSQL and processed asynchronously by browser workers.

## Quick Start

### Docker Compose (Development)

```bash
# Start the full stack (PostgreSQL + API)
./scripts/docker-dev.sh start

# Run migrations and seeds
./scripts/docker-dev.sh migrate
./scripts/docker-dev.sh seed

# API will be available at http://localhost:3333
```

For detailed Docker setup and deployment instructions, see [docs/DOCKER.md](docs/DOCKER.md).

### Kubernetes (Production)

```bash
# Deploy to Kubernetes
./scripts/k8s/deploy.sh all

# Monitor deployment
./scripts/k8s/monitor.sh

# Access via LoadBalancer or port-forward
kubectl port-forward -n browsers-api service/browsers-api 3333:80
```

For detailed Kubernetes setup and deployment instructions, see [docs/KUBERNETES.md](docs/KUBERNETES.md).

#### `POST /api/v1/jobs`
Create a new automation job.

**Request Body:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://iserter.com",
  "actions": [
    {"action": "fill", "target": "Your e-mail address", "getTargetBy": "getByLabel", "value": "user@example.com"},
    {"action": "fill", "target": "#password", "getTargetBy": "getBySelector", "value": "secret123"},
    {"action": "scroll", "target": "Submit", "getTargetBy": "getByText", "speed": 2000},
    {"action": "moveCursor", "target": "Submit", "getTargetBy": "getByText"},
    {"action": "click", "target": "Submit", "getTargetBy": "getByText", "waitForNavigation": true},
    {"action": "screenshot", "fullPage": true, "type": "png"}
  ],
  "timeoutMs": 30000
}
```

#### Available Actions

- **fill**: Fill form fields with values
- **click**: Click on elements with various targeting options
- **moveCursor**: Move cursor to element using human-like movement (includes customizable speed, jitter, overshoot, and timing options)
- **scroll**: Scroll the page with human-like behavior (can scroll to specific position, element, or to bottom)
- **screenshot**: Capture screenshots of the page or specific elements
- **snapshot**: Capture the current state of a web page including HTML content, metadata, and optionally cookies, localStorage, and sessionStorage

#### Action Configuration Examples

**Scroll to specific Y position:**
```json
{"action": "scroll", "targetY": 2000}
```

**Scroll to element:**
```json
{"action": "scroll", "target": "Footer", "getTargetBy": "getByText"}
```

**Scroll with custom parameters:**
```json
{"action": "scroll", "target": "#footer", "getTargetBy": "getBySelector", "speed": 2000, "variance": 0.4}
```

**Snapshot Action:**

The snapshot action captures the current state of a web page. By default, it captures HTML content, URL, title, timestamp, and metadata (viewport, userAgent, language, platform, timezone). Optionally, you can capture cookies, localStorage, and sessionStorage.

**Basic snapshot (minimal configuration):**
```json
{"action": "snapshot"}
```

**Snapshot with all optional features enabled:**
```json
{
  "action": "snapshot",
  "snapshot": {
    "cookies": true,
    "localStorage": true,
    "sessionStorage": true
  }
}
```

**Snapshot configuration options:**
- **cookies** (boolean, optional, default: false): When `true`, captures all browser cookies for the current domain
- **localStorage** (boolean, optional, default: false): When `true`, captures all localStorage key-value pairs
- **sessionStorage** (boolean, optional, default: false): When `true`, captures all sessionStorage key-value pairs

**Complete job example with snapshot:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {"action": "visit"},
    {"action": "wait", "wait": {"duration": 2000}},
    {
      "action": "snapshot",
      "snapshot": {
        "cookies": true,
        "localStorage": true
      }
    }
  ],
  "timeoutMs": 30000
}
```

Snapshot data is saved as a JSON artifact with type `snapshot` that can be retrieved via the artifacts API endpoint. The JSON structure includes:
- `html`: The full HTML content of the page
- `url`: The current page URL
- `title`: The page title
- `timestamp`: ISO 8601 timestamp of when the snapshot was taken
- `metadata`: Object containing viewport dimensions, userAgent, language, platform, and timezone
- `cookies` (optional): Array of cookie objects if cookies option is enabled
- `localStorage` (optional): Object with localStorage key-value pairs if localStorage option is enabled
- `sessionStorage` (optional): Object with sessionStorage key-value pairs if sessionStorage option is enabled

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
  "result": {
    "content": "(rendered HTML source code)",
    "screenshotUrl": "/api/v1/jobs/550e8400.../artifacts/screenshot.png",
    "duration": 2500
  },
  "createdAt": "2025-10-18T10:00:00Z",
  "completedAt": "2025-10-18T10:00:03Z"
}
```

#### `GET /api/v1/jobs/:jobId/artifacts`
Get list of all artifacts (screenshots, snapshots, files, etc.) associated with a job.

**Response:**
```json
[
  {
    "id": "artifact-uuid",
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "artifactType": "screenshot",
    "filePath": "/artifacts/job-id/1762825733438-screenshot.png",
    "mimeType": "image/png",
    "sizeBytes": 123456,
    "createdAt": "2025-10-18T10:00:05Z"
  },
  {
    "id": "artifact-uuid-2",
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "artifactType": "snapshot",
    "filePath": "/artifacts/job-id/1762825733438-snapshot.json",
    "mimeType": "application/json",
    "sizeBytes": 45678,
    "createdAt": "2025-10-18T10:00:10Z"
  }
]
```

#### `GET /api/v1/jobs/:jobId/artifacts/:artifactId`
Download a specific artifact file (screenshot, snapshot, PDF, etc.).

**Response:**
- Returns the file content with appropriate headers:
  - `Content-Type`: Based on artifact's mimeType (e.g., `image/png`, `image/jpeg`, `application/json`)
  - `Content-Disposition`: Attachment with filename
  - `Content-Length`: File size in bytes

**Example:**
```bash
# Download a screenshot
curl -O http://localhost:3333/api/v1/jobs/{jobId}/artifacts/{artifactId}

# Download a snapshot (JSON file)
curl http://localhost:3333/api/v1/jobs/{jobId}/artifacts/{artifactId} | jq .
```

## Tech Stack

### Core Dependencies
- **Framework**: Nest.js (v10.x)
- **Runtime**: Node.js (v20.x LTS)
- **Database**: PostgreSQL (v15.x)
- **ORM**: TypeORM
- **Automation**: Playwright (v1.40+)
- **Validation**: class-validator, class-transformer
- **Queue Management**: Bull (Redis-based) or custom PostgreSQL queue
- **Configuration**: @nestjs/config