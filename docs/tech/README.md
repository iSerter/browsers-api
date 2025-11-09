# Technical Documentation

This directory contains comprehensive technical documentation for the Browsers API.

## Documentation Index

### 1. [Architecture Overview](./01-architecture-overview.md)
High-level system architecture, design principles, technology stack, and component overview.

### 2. [System Design & Data Flow](./02-system-design.md)
Detailed system components, job lifecycle, processing sequences, and data flow diagrams.

### 3. [Module Structure & Components](./03-module-structure.md)
Complete module organization, component responsibilities, and dependency relationships.

### 4. [Database Schema](./04-database-schema.md)
Entity relationship diagrams, table schemas, indexes, relationships, and query patterns.

### 5. [API Reference](./05-api-reference.md)
Complete REST API documentation with endpoints, request/response formats, and examples.

### 6. [Job Processing & Worker System](./06-job-processing.md)
Worker lifecycle, job processing flow, error handling, retries, and monitoring.

### 7. [Browser Pool & Action Handlers](./07-browser-pool-actions.md)
Browser pool architecture, action handler system, and implementation details.

### 8. [Security & Authentication](./08-security-authentication.md)
API key authentication, URL policies, rate limiting, and security best practices.

## Quick Links

- **Getting Started**: See [README.md](../../README.md) for quick start guide
- **Docker Deployment**: See [docs/DOCKER.md](../DOCKER.md) for deployment instructions
- **API Examples**: See [API Reference](./05-api-reference.md) for endpoint documentation

## Architecture Summary

The Browsers API is a **producer-consumer** system:

- **Producers**: REST API endpoints that create jobs
- **Consumers**: Background workers that process jobs
- **Queue**: PostgreSQL database with job records
- **Execution**: Playwright browser automation
- **Storage**: Filesystem for artifacts (screenshots, PDFs)

## Key Concepts

### Job Lifecycle

```
PENDING → PROCESSING → COMPLETED
              ↓
           FAILED (with retries)
```

### Browser Pooling

Browser instances are pooled and reused to:
- Reduce startup overhead
- Manage resource consumption
- Support concurrent execution

### Action Handlers

Pluggable action handlers for:
- Screenshots
- Form filling
- Clicking
- Scrolling
- Cursor movement

### Security

- API key authentication
- URL policy enforcement
- Rate limiting per key
- Input validation

## Contributing

When updating documentation:

1. Keep diagrams up to date with code changes
2. Update examples when API changes
3. Document new features in relevant sections
4. Maintain consistent formatting

## Questions?

For questions or clarifications, refer to:
- Source code in `src/` directory
- Test files in `src/**/*.spec.ts`
- Migration files in `src/database/migrations/`

