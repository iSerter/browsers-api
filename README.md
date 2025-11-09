
For now, it's just my playground. 

I'm experimenting with task-master and Github Speckit. 


# Browsers API

Browser Automation API that provides HTTP endpoints for browser tasks using Playwright. The system follows a producer-consumer pattern where API requests are queued in PostgreSQL and processed asynchronously by browser workers.

## Quick Start with Docker

```bash
# Start the full stack (PostgreSQL + API)
./scripts/docker-dev.sh start

# Run migrations and seeds
./scripts/docker-dev.sh migrate
./scripts/docker-dev.sh seed

# API will be available at http://localhost:3333
```

For detailed Docker setup and deployment instructions, see [docs/DOCKER.md](docs/DOCKER.md).

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
  "timeout": 30000
}
```

#### Available Actions

- **fill**: Fill form fields with values
- **click**: Click on elements with various targeting options
- **moveCursor**: Move cursor to element using human-like movement (includes customizable speed, jitter, overshoot, and timing options)
- **scroll**: Scroll the page with human-like behavior (can scroll to specific position, element, or to bottom)
- **screenshot**: Capture screenshots of the page or specific elements

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