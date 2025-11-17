# Docker Testing Guide

This guide explains how to build and run tests inside Docker containers.

## Quick Start

### Using the Test Script

The easiest way to run tests in Docker is using the provided script:

```bash
# Run all tests (unit + e2e)
npm run test:docker

# Run only unit tests
npm run test:docker:unit

# Run only e2e tests
npm run test:docker:e2e
```

Or directly:

```bash
./scripts/docker-test.sh        # All tests
./scripts/docker-test.sh unit    # Unit tests only
./scripts/docker-test.sh e2e    # E2E tests only
```

### Using Docker Directly

#### Build the Test Image

```bash
docker build --target test -t browsers-api-test .
```

#### Run Tests

```bash
# Run all tests
docker run --rm browsers-api-test npm test

# Run E2E tests
docker run --rm browsers-api-test npm run test:e2e

# Run with coverage
docker run --rm browsers-api-test npm run test:cov

# Run specific test file
docker run --rm browsers-api-test npm test -- test/job-workflow-captcha.e2e-spec.ts
```

### Using Docker Compose

#### Start Services (PostgreSQL)

```bash
# Start PostgreSQL in background
docker-compose up -d postgres

# Wait for PostgreSQL to be healthy
docker-compose ps
```

#### Run Tests

```bash
# Run all tests
docker-compose --profile test run --rm test npm test

# Run E2E tests
docker-compose --profile test run --rm test npm run test:e2e

# Run specific test file
docker-compose --profile test run --rm test npm test -- test/job-workflow-captcha.e2e-spec.ts
```

#### Cleanup

```bash
# Stop and remove containers
docker-compose --profile test down

# Stop all services
docker-compose down
```

## Dockerfile Stages

The Dockerfile includes multiple stages:

1. **builder**: Installs dependencies and prepares source code
2. **test**: Based on builder, used for running tests (no build step needed - tests use ts-jest)
3. **builder-prod**: Builds the application for production
4. **runner**: Production runtime image

## Test Environment

The test container includes:
- Node.js 20 (from Playwright base image)
- All npm dependencies
- Playwright browsers and dependencies
- Source code (no build required for tests)

## Environment Variables

When running tests with docker-compose, the test service has access to:
- Database connection (PostgreSQL)
- All environment variables from docker-compose.yml

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build test image
        run: docker build --target test -t browsers-api-test .
      
      - name: Run tests
        run: docker run --rm browsers-api-test npm test
      
      - name: Run E2E tests
        run: docker run --rm browsers-api-test npm run test:e2e
```

### GitLab CI Example

```yaml
test:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build --target test -t browsers-api-test .
    - docker run --rm browsers-api-test npm test
    - docker run --rm browsers-api-test npm run test:e2e
```

## Troubleshooting

### Tests Fail with Database Connection Errors

Make sure PostgreSQL is running and healthy:

```bash
docker-compose up -d postgres
docker-compose ps  # Check health status
```

### TypeScript Compilation Errors

If you see TypeScript errors during test execution, fix them in the source code first. The test stage doesn't build the application, but TypeScript errors will still cause test failures.

### Permission Issues

If you encounter permission issues with the test script:

```bash
chmod +x scripts/docker-test.sh
```

### Clean Docker State

If you need to start fresh:

```bash
# Remove test image
docker rmi browsers-api-test

# Remove all containers and volumes
docker-compose down -v

# Rebuild
docker build --target test -t browsers-api-test .
```

## Notes

- Tests run with `ts-jest`, so no build step is required
- The test stage is based on the builder stage but skips the build step
- Production builds use a separate `builder-prod` stage
- All test dependencies are included in the test image

