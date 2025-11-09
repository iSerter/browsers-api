# Module Structure & Components

## Module Organization

```
src/
├── app.module.ts              # Root module
├── main.ts                    # Application entry point
│
├── common/                    # Shared utilities
│   ├── filters/              # Exception filters
│   ├── guards/               # Route guards
│   ├── interceptors/         # Response interceptors
│   ├── middleware/           # Request middleware
│   └── services/             # Shared services (Logger)
│
├── config/                    # Configuration
│   ├── database.config.ts    # TypeORM configuration
│   └── validation.schema.ts  # Environment validation
│
├── database/                  # Database setup
│   ├── data-source.ts        # TypeORM data source
│   ├── migrations/           # Database migrations
│   └── seeds/                # Seed data
│
└── modules/                   # Feature modules
    ├── jobs/                 # Job management
    ├── workers/              # Worker management
    ├── browsers/             # Browser pool
    ├── actions/              # Action handlers
    ├── api-keys/             # Authentication
    ├── auth/                 # Auth strategies
    ├── health/               # Health checks
    ├── metrics/              # Prometheus metrics
    └── admin/                # Admin endpoints
```

## Core Modules

### Jobs Module

**Purpose**: Manages automation job lifecycle

**Components**:
- `JobsController`: REST API endpoints
- `JobsService`: Business logic
- `JobProcessorService`: Background job execution
- `WorkerManagerService`: Worker status tracking
- `ArtifactStorageService`: File storage management
- `JobLogService`: Logging service

**Entities**:
- `AutomationJob`: Job records
- `JobArtifact`: Screenshots, PDFs, etc.
- `JobLog`: Execution logs

**DTOs**:
- `CreateJobDto`: Job creation request
- `ActionConfigDto`: Action configuration
- `ListJobsQueryDto`: Job listing filters

**Handlers**:
- `ScreenshotActionHandler`
- `FillActionHandler`
- `ClickActionHandler`
- `ScrollActionHandler`
- `MoveCursorActionHandler`

### Workers Module

**Purpose**: Manages worker instances and status

**Components**:
- `WorkersController`: Worker status API
- `WorkersService`: Worker management logic
- `WorkerHeartbeatService`: Health monitoring

**Entities**:
- `BrowserWorker`: Worker status records

### Browsers Module

**Purpose**: Browser resource management

**Components**:
- `BrowsersController`: Browser type management
- `BrowsersService`: Browser type CRUD
- `BrowserPoolService`: Browser instance pooling
- `BrowserContextManagerService`: Context lifecycle

**Entities**:
- `BrowserType`: Browser configurations

**Interfaces**:
- `IBrowserPool`: Pool interface
- `BrowserPoolConfig`: Pool configuration

### Actions Module

**Purpose**: Action handler discovery

**Components**:
- `ActionsController`: List available actions
- `ActionsService`: Action metadata

### API Keys Module

**Purpose**: Authentication and authorization

**Components**:
- `ApiKeysController`: API key management
- `ApiKeysService`: Key validation and policies

**Entities**:
- `ApiKey`: API key records
- `UrlPolicy`: URL whitelist/blacklist

### Auth Module

**Purpose**: Authentication strategies

**Components**:
- `ApiKeyGuard`: Route protection
- `ApiKeyStrategy`: Passport strategy
- `ThrottleConfig`: Rate limiting

### Health Module

**Purpose**: System health monitoring

**Components**:
- `HealthController`: Health check endpoints
- Uses `@nestjs/terminus` for health checks

**Checks**:
- Database connectivity
- Browser pool status
- Worker availability

### Metrics Module

**Purpose**: Prometheus metrics

**Components**:
- `MetricsController`: Metrics endpoint
- `MetricsService`: Metric collection

**Metrics**:
- Job counts by status
- Worker statistics
- Browser pool stats
- Request rates

## Common Module

### Filters
- `HttpExceptionFilter`: Global exception handling

### Guards
- `BrowserPoolHealthGuard`: Ensures pool is healthy
- `WorkersHealthGuard`: Ensures workers available

### Interceptors
- `TransformInterceptor`: Response transformation

### Middleware
- `CorrelationIdMiddleware`: Request correlation IDs
- `LoggingMiddleware`: Request/response logging

### Services
- `AppLoggerService`: Winston logger wrapper
- `WinstonLoggerService`: Winston configuration

## Module Dependencies

```
AppModule
  ├─► ConfigModule (global)
  ├─► TypeOrmModule (global)
  ├─► ThrottlerModule (global)
  │
  ├─► JobsModule
  │   ├─► BrowsersModule
  │   ├─► WorkersModule
  │   └─► ApiKeysModule
  │
  ├─► BrowsersModule
  ├─► WorkersModule
  ├─► ActionsModule
  ├─► HealthModule
  ├─► ApiKeysModule
  ├─► MetricsModule
  └─► AdminModule
```

## Service Responsibilities

### JobsService
- Create, read, list, cancel jobs
- Job artifact retrieval
- Job status management

### JobProcessorService
- Poll database for pending jobs
- Execute browser automation
- Handle retries and errors
- Emit WebSocket events

### BrowserPoolService
- Manage browser instances
- Handle acquisition/release
- Cleanup idle browsers
- Pool statistics

### ActionHandlerFactory
- Route actions to handlers
- Handler registration
- Action discovery

### ArtifactStorageService
- Save artifacts to filesystem
- Create database records
- Retrieve artifact metadata

### WorkerManagerService
- Update worker status
- Track current job
- Heartbeat management

## Data Flow Between Modules

```
Client Request
    │
    ▼
JobsController
    │
    ├─► ApiKeyGuard (Auth Module)
    │
    ├─► ApiKeysService (URL Policy Check)
    │
    └─► JobsService
        │
        └─► JobRepository (TypeORM)
            │
            └─► PostgreSQL

JobProcessorService (Background)
    │
    ├─► JobRepository (Query Pending Jobs)
    │
    ├─► BrowserPoolService (Acquire Browser)
    │
    ├─► ActionHandlerFactory (Get Handler)
    │
    ├─► Action Handlers (Execute Actions)
    │
    ├─► ArtifactStorageService (Save Artifacts)
    │
    └─► JobEventsGateway (Emit Events)
```

## Extension Points

### Adding New Actions
1. Create handler implementing `IActionHandler`
2. Register in `ActionHandlerFactory`
3. Add to `JobsModule` providers

### Adding New Modules
1. Create module file
2. Import in `AppModule`
3. Export services if needed by other modules

### Custom Storage Backends
1. Implement storage interface
2. Replace `ArtifactStorageService` implementation
3. Update configuration

