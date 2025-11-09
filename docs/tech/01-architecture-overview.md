# Architecture Overview

## Introduction

The Browsers API is a production-ready browser automation service built with NestJS and Playwright. It provides HTTP endpoints for executing browser automation tasks asynchronously using a producer-consumer pattern with PostgreSQL as the job queue.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Applications                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/REST API
                             │ WebSocket (Job Events)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    NestJS Application Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Jobs API   │  │  Auth/Keys   │  │   Health      │      │
│  │  Controller │  │  Controller │  │  Controller   │      │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │              Jobs Service                               │  │
│  │  • Create/List/Get Jobs                                │  │
│  │  • Job Status Management                                │  │
│  │  • Artifact Management                                  │  │
│  └──────┬──────────────────────────────────────────────────┘  │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │         Job Processor Service (Worker)                   │  │
│  │  • Polls for pending jobs                               │  │
│  │  • Executes browser automation                          │  │
│  │  • Manages job lifecycle                                │  │
│  └──────┬──────────────────────────────────────────────────┘  │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │         Browser Pool Service                            │  │
│  │  • Manages browser instances                             │  │
│  │  • Connection pooling                                    │  │
│  │  • Resource cleanup                                      │  │
│  └──────┬──────────────────────────────────────────────────┘  │
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │         Action Handlers                                  │  │
│  │  • Screenshot, Fill, Click, Scroll, MoveCursor          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ TypeORM
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    PostgreSQL Database                           │
│  • automation_jobs (Job Queue)                                  │
│  • browser_types (Browser Configurations)                       │
│  • browser_workers (Worker Status)                             │
│  • job_artifacts (Screenshots, PDFs, etc.)                      │
│  • job_logs (Execution Logs)                                   │
│  • api_keys (Authentication)                                    │
│  • url_policies (Security Policies)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Core Design Principles

### 1. Producer-Consumer Pattern

The system separates job creation (producer) from job execution (consumer):

- **Producers**: API endpoints that create jobs and store them in PostgreSQL
- **Consumers**: Background workers that poll the database and execute jobs

This pattern provides:
- **Scalability**: Multiple workers can process jobs in parallel
- **Reliability**: Jobs persist in the database, surviving application restarts
- **Decoupling**: API layer is independent of execution layer

### 2. Asynchronous Processing

All browser automation tasks are processed asynchronously:

1. Client submits job via `POST /api/v1/jobs`
2. Job is immediately saved with `pending` status
3. Response returns job ID and status
4. Background worker picks up and processes the job
5. Client polls `GET /api/v1/jobs/:id` or listens via WebSocket for updates

### 3. Browser Pool Management

Browser instances are pooled and reused to:
- Reduce startup overhead
- Manage resource consumption
- Support concurrent job execution
- Automatically cleanup idle browsers

### 4. Action-Based Architecture

Automation actions are implemented as pluggable handlers:
- Each action type has its own handler class
- Handlers implement a common interface
- Factory pattern routes actions to appropriate handlers
- Easy to extend with new action types

## Technology Stack

### Core Framework
- **NestJS 11.x**: Progressive Node.js framework
- **TypeScript 5.7**: Type-safe development
- **Node.js 20.x LTS**: Runtime environment

### Browser Automation
- **Playwright 1.56+**: Cross-browser automation library
- Supports Chromium, Firefox, and WebKit

### Data Layer
- **PostgreSQL 15**: Primary database
- **TypeORM 0.3**: Object-Relational Mapping
- **JSONB**: For flexible action and result storage

### Authentication & Security
- **Passport.js**: Authentication middleware
- **API Key Strategy**: Bearer token authentication
- **Throttling**: Rate limiting via `@nestjs/throttler`

### Real-time Communication
- **Socket.io**: WebSocket support for job events
- **@nestjs/websockets**: NestJS WebSocket integration

### Monitoring & Observability
- **Winston**: Structured logging
- **Prometheus**: Metrics collection
- **@nestjs/terminus**: Health checks

## Key Components

### 1. Jobs Module
Manages the complete job lifecycle:
- Job creation and validation
- Job status tracking
- Artifact storage and retrieval
- Job cancellation

### 2. Workers Module
Background processing system:
- Polls database for pending jobs
- Executes browser automation
- Manages worker status and heartbeats
- Handles retries and error recovery

### 3. Browsers Module
Browser resource management:
- Browser pool creation and management
- Context and page lifecycle
- Viewport and device configuration

### 4. Actions Module
Action handler system:
- Action factory for routing
- Individual action handlers
- Human-like interaction utilities

### 5. API Keys Module
Authentication and authorization:
- API key management
- URL policy enforcement
- Rate limiting per key

### 6. Health Module
System monitoring:
- Application health checks
- Database connectivity
- Browser pool status
- Worker availability

### 7. Metrics Module
Observability:
- Prometheus metrics endpoint
- Job statistics
- Performance metrics

## Data Flow

### Job Creation Flow

```
Client Request
    │
    ├─► API Key Validation
    │
    ├─► URL Policy Check
    │
    ├─► Job Validation (DTO)
    │
    ├─► Save to Database (status: pending)
    │
    ├─► Emit WebSocket Event (job.created)
    │
    └─► Return Job ID to Client
```

### Job Processing Flow

```
Job Processor (Polling)
    │
    ├─► Query Pending Jobs (FOR UPDATE SKIP LOCKED)
    │
    ├─► Update Status (pending → processing)
    │
    ├─► Acquire Browser from Pool
    │
    ├─► Create Browser Context & Page
    │
    ├─► Navigate to Target URL
    │
    ├─► Execute Actions Sequentially
    │   │
    │   ├─► Get Action Handler from Factory
    │   │
    │   ├─► Execute Handler
    │   │
    │   └─► Store Results/Artifacts
    │
    ├─► Update Job Status (processing → completed)
    │
    ├─► Release Browser to Pool
    │
    └─► Emit WebSocket Event (job.completed)
```

## Scalability Considerations

### Horizontal Scaling
- Multiple application instances can run simultaneously
- PostgreSQL's `FOR UPDATE SKIP LOCKED` prevents duplicate job processing
- Stateless API layer allows load balancing

### Vertical Scaling
- Browser pool size is configurable per browser type
- Worker concurrency limits prevent resource exhaustion
- Database connection pooling manages database load

### Resource Management
- Browser idle timeout automatically closes unused browsers
- Job timeout prevents hung jobs
- Artifact cleanup policies manage storage

## Security Features

1. **API Key Authentication**: All endpoints require valid API keys
2. **URL Policies**: Whitelist/blacklist URL patterns
3. **Rate Limiting**: Per-API-key throttling
4. **Input Validation**: DTO validation with class-validator
5. **SQL Injection Protection**: TypeORM parameterized queries
6. **CORS Configuration**: Configurable cross-origin policies

## Deployment Architecture

The application is containerized using Docker:

- **Multi-stage Dockerfile**: Optimized production builds
- **Docker Compose**: Orchestrates API and PostgreSQL
- **Health Checks**: Built-in container health monitoring
- **Volume Mounts**: Persistent artifact storage

See [Deployment Guide](../DOCKER.md) for detailed deployment instructions.

