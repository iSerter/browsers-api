# Browsers API

Browser Automation API that provides HTTP endpoints for browser tasks using Playwright. The system follows a producer-consumer pattern where API requests are queued in PostgreSQL and processed asynchronously by browser workers.

## Table of Contents

- [Quick Start](#quick-start)
- [Development](#development)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)
- [Tech Stack](#tech-stack)

## Quick Start

### Docker Compose (Recommended)

```bash
# Start the full stack (PostgreSQL + API)
./scripts/docker-dev.sh start

# Run migrations and seeds
./scripts/docker-dev.sh migrate
./scripts/docker-dev.sh seed

# API will be available at http://localhost:3333
# Metrics available at http://localhost:9090/metrics
```

For detailed Docker setup, see [docs/DOCKER.md](docs/DOCKER.md).

### Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npm run test:setup

# Copy and configure environment
cp .env.example .env

# Run migrations and seeds (PostgreSQL must be running)
npm run migration:run
npm run seed

# Start development server
npm run start:dev
```

### Kubernetes (Production)

```bash
# Deploy to Kubernetes
./scripts/k8s/deploy.sh all

# Monitor deployment
./scripts/k8s/monitor.sh

# Access via port-forward
kubectl port-forward -n browsers-api service/browsers-api 3333:80
```

For Kubernetes setup, see [docs/KUBERNETES.md](docs/KUBERNETES.md).

## Development

### Running the Application

**Local development (hot reload):**
```bash
npm run start:dev
```

**Docker development:**
```bash
./scripts/docker-dev.sh start
./scripts/docker-dev.sh logs  # View logs
./scripts/docker-dev.sh stop  # Stop stack
```

### Database Management

**Migrations:**
```bash
# Generate migration after entity changes
npm run migration:generate -- src/database/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

**Seeds:**
```bash
npm run seed  # Seed browser types
```

### Development Scripts

Helper scripts in `./dev/` and `./scripts/`:
- `./scripts/docker-dev.sh` - Docker development workflow
- `./dev/docker-build-test-tag-publish.sh` - Build, test, and publish Docker images

## Testing

**Unit tests:**
```bash
npm test                # Run all unit tests
npm run test:watch      # Run tests in watch mode
npm run test:cov        # Run tests with coverage
```

**E2E tests:**
```bash
npm run test:e2e                              # Run all E2E tests
npm run test:e2e -- job-workflow.e2e-spec.ts # Run specific test
```

**Docker testing:**
```bash
npm run test:docker        # Run all tests in Docker
npm run test:docker:unit   # Run unit tests only
npm run test:docker:e2e    # Run E2E tests only
```

## Building & Deployment

**Development build:**
```bash
npm run build  # Output in dist/
```

**Docker build:**
```bash
# Build image
docker build -t browsers-api:latest .

# Build, test, and tag version
./dev/docker-build-test-tag-publish.sh v0.0.3

# Build, test, tag, and push to Docker Hub
./dev/docker-build-test-tag-publish.sh v0.0.3 --push
```

**Production deployment:**
- Docker: See [docs/DOCKER.md](docs/DOCKER.md)
- Kubernetes: See [docs/KUBERNETES.md](docs/KUBERNETES.md)

## API Reference

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
  "timeoutMs": 30000,
  "browserStorage": {
    "cookies": [
      {
        "name": "sessionId",
        "value": "abc123xyz",
        "domain": ".iserter.com",
        "path": "/",
        "secure": true,
        "httpOnly": true,
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
}
```

#### Browser Storage

The `browserStorage` field allows you to pre-populate browser storage (cookies, localStorage, sessionStorage) before job execution. This is useful for maintaining authentication state, preserving user preferences, or restoring previous session data.

**Browser Storage Configuration:**
- **cookies** (array, optional): Array of cookie objects with `name`, `value`, `domain`, and optional fields (`path`, `secure`, `httpOnly`, `sameSite`, `expires`)
- **localStorage** (object, optional): Key-value pairs to set in localStorage (all values must be strings)
- **sessionStorage** (object, optional): Key-value pairs to set in sessionStorage (all values must be strings)

**Cookie Example:**
```json
{
  "name": "sessionId",
  "value": "abc123xyz",
  "domain": ".example.com",
  "path": "/",
  "secure": true,
  "httpOnly": true,
  "sameSite": "Lax"
}
```

**Note**: Cookies are validated against the target URL domain. Cookies with domains that don't match the target URL will be rejected.

#### Available Actions

- **fill**: Fill form fields with values
- **click**: Click on elements with various targeting options
- **moveCursor**: Move cursor to element using human-like movement (includes customizable speed, jitter, overshoot, and timing options)
- **scroll**: Scroll the page with human-like behavior (can scroll to specific position, element, or to bottom)
- **screenshot**: Capture screenshots of the page or specific elements
- **snapshot**: Capture the current state of a web page including HTML content, metadata, and optionally cookies, localStorage, and sessionStorage
- **executeScript**: Execute custom JavaScript code in the browser context (⚠️ Security: Only enable in trusted environments)

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

**ExecuteScript Action:**

⚠️ **Security Warning**: The executeScript action allows arbitrary JavaScript execution in the browser context. This feature is **disabled by default** and should only be enabled in trusted environments. Scripts execute with full browser context access and can potentially be used for code injection attacks.

To enable this feature, set the `ENABLE_EXECUTE_SCRIPT` environment variable to `true`:
```bash
ENABLE_EXECUTE_SCRIPT=true
```

**Basic script execution:**
```json
{
  "action": "executeScript",
  "script": "return document.title"
}
```

**Script that returns a computed value:**
```json
{
  "action": "executeScript",
  "script": "return document.querySelectorAll('a').length"
}
```

**Script with complex return value:**
```json
{
  "action": "executeScript",
  "script": "return { title: document.title, links: Array.from(document.querySelectorAll('a')).map(a => a.href) }"
}
```

**Async script execution:**
```json
{
  "action": "executeScript",
  "script": "return await fetch('/api/data').then(r => r.json())"
}
```

**DOM manipulation example:**
```json
{
  "action": "executeScript",
  "script": "document.querySelector('h1').textContent = 'Modified Title'; return document.querySelector('h1').textContent"
}
```

**Complete job example with executeScript:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [
    {"action": "visit"},
    {
      "action": "executeScript",
      "script": "return { title: document.title, url: window.location.href, linkCount: document.querySelectorAll('a').length }"
    }
  ],
  "timeoutMs": 30000
}
```

Script execution results are included in the job response data. The script can return any JSON-serializable value (primitives, objects, arrays). If the script throws an error or if the feature is disabled, the job will fail with an appropriate error message.

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
- **Framework**: Nest.js (v11.x)
- **Runtime**: Node.js (v20.x LTS)
- **Database**: PostgreSQL (v15.x)
- **ORM**: TypeORM
- **Automation**: Playwright (v1.56+)
- **Validation**: class-validator, class-transformer
- **Configuration**: @nestjs/config, Joi
- **Metrics**: Prometheus (@willsoto/nestjs-prometheus)
- **WebSockets**: Socket.IO

### Development Tools
- **Testing**: Jest, Supertest
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Build**: NestJS CLI, TypeScript
- **Containerization**: Docker, Docker Compose

## Contributing

### Project Structure

```
browsers-api/
├── src/
│   ├── modules/          # Feature modules
│   │   ├── jobs/         # Job processing and actions
│   │   ├── browsers/     # Browser pool management
│   │   ├── auth/         # Authentication (API keys)
│   │   └── ...
│   ├── common/           # Shared utilities
│   ├── config/           # Configuration
│   └── database/         # Migrations and seeds
├── test/                 # E2E tests
├── scripts/              # Development scripts
├── dev/                  # Developer helper scripts
└── docs/                 # Documentation
```

### Adding a New Action

1. Create handler in `src/modules/jobs/handlers/`:
   ```typescript
   @Injectable()
   export class MyActionHandler {
     async execute(page: Page, action: ActionConfig, jobId: string): Promise<void> {
       // Implementation
     }
   }
   ```

2. Create spec file: `my-action.handler.spec.ts`

3. Register in `action-handler.factory.ts`:
   ```typescript
   case 'myAction':
     return this.myActionHandler;
   ```

4. Update `action-config.dto.ts`:
   ```typescript
   @IsIn(['click', 'fill', 'myAction', ...])
   action: string;
   ```

5. Add tests and update documentation

### Code Style Guidelines

- Follow NestJS conventions
- Use dependency injection
- Add JSDoc comments for public APIs
- Write tests alongside implementation
- Use meaningful variable/function names
- Keep functions small and focused

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run linter: `npm run lint`
5. Run tests: `npm test && npm run test:e2e`
6. Commit with descriptive message
7. Push and create pull request

## Environment Variables

See `.env.example` for complete list. Key variables:

**Database:**
- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_USERNAME` - Database user
- `DB_PASSWORD` - Database password
- `DB_DATABASE` - Database name

**Application:**
- `PORT` - API port (default: 3333)
- `NODE_ENV` - Environment (development/production/test)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

**Browser:**
- `PLAYWRIGHT_HEADLESS` - Run browsers headless (true/false)
- `BROWSER_POOL_MIN_SIZE` - Minimum browsers in pool
- `BROWSER_POOL_MAX_SIZE` - Maximum browsers in pool

**Features:**
- `ENABLE_EXECUTE_SCRIPT` - Enable executeScript action (default: false)
- `DEFAULT_PROXY` - Default proxy for all browsers
- `TWOCAPTCHA_API_KEY` - 2Captcha API key
- `ANTICAPTCHA_API_KEY` - AntiCaptcha API key

## Troubleshooting

**Tests failing with database errors:**
```bash
# Ensure PostgreSQL is running
docker-compose up -d postgres

# Run migrations
npm run migration:run
```

**Playwright browser not found:**
```bash
npm run test:setup
```

**Port already in use:**
```bash
# Kill process on port 3333
lsof -ti:3333 | xargs kill -9

# Or use different port
PORT=3334 npm run start:dev
```

**Docker build fails:**
```bash
docker builder prune -f
docker build --no-cache -t browsers-api:latest .
```

## Additional Resources

- **Documentation:**
  - [API Reference](docs/tech/05-api-reference.md)
  - [Docker Guide](docs/DOCKER.md)
  - [Kubernetes Guide](docs/KUBERNETES.md)
  - [CAPTCHA Solver Guide](docs/CAPTCHA-SOLVER-USAGE-GUIDE.md)
  
- **Architecture:**
  - [Architecture Overview](docs/tech/01-architecture-overview.md)
  - [System Design](docs/tech/02-system-design.md)
  - [Module Structure](docs/tech/03-module-structure.md)
  - [Database Schema](docs/tech/04-database-schema.md)

- **Development:**
  - [Job Processing](docs/tech/06-job-processing.md)
  - [Browser Pool & Actions](docs/tech/07-browser-pool-actions.md)
  - [Security & Authentication](docs/tech/08-security-authentication.md)
  - [Proxy Support](docs/tech/09-proxies.md)

## License

UNLICENSED - This is a private project.