# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 (2026-06-21)


### Features

* **actions:** add moveCursor and scroll actions for human-like interactions ([159418b](https://github.com/iSerter/browsers-api/commit/159418b003c2b4952a0757b50ba31facde6a4fdd))
* **browsers:** implement Playwright integration and browser pool management ([3ebd894](https://github.com/iSerter/browsers-api/commit/3ebd8940d07a3c87a30f993a9bcabad3396483e2))
* enhance README and implement new action handlers for job automation ([bea3211](https://github.com/iSerter/browsers-api/commit/bea3211937dc1d70db007bb1048d2b3422f3edc3))
* implement API authentication and rate limiting system ([7d6a0d3](https://github.com/iSerter/browsers-api/commit/7d6a0d38f928a3c6b9f29aa9926f64da7aacea18))
* implement job processor worker with polling and retry logic ([2a92a15](https://github.com/iSerter/browsers-api/commit/2a92a154cd399f35b67b8edf5d380ed270053a47))
* implement WebSocket gateway for real-time job updates ([79b3a06](https://github.com/iSerter/browsers-api/commit/79b3a065f9c406b8f596be3aff0a558e7466573b))
* **jobs:** implement job submission and status API endpoints ([d6d7658](https://github.com/iSerter/browsers-api/commit/d6d765872abf3434398794ee6e63bc0366ac58ef))
* **monitoring:** Implement comprehensive monitoring, logging, and health checks ([0f915ce](https://github.com/iSerter/browsers-api/commit/0f915ce90772a9a890f3db80c91b88247a9a5700))


### Bug Fixes

* **lint:** Fix TypeScript linting errors in monitoring components ([dce58ef](https://github.com/iSerter/browsers-api/commit/dce58ef85d95a5a0a14c5d31ee254280972734b9))
* update README to include rendered HTML source code in job result ([55870a6](https://github.com/iSerter/browsers-api/commit/55870a682d4d8b35bedc8dda80286d82e7d7c4e2))

## [Unreleased]

### Added
- **Docker Support**: Complete Docker containerization implementation
  - Multi-stage Dockerfile with Playwright base image (v1.56.1-jammy)
  - docker-compose.yml for local development stack (PostgreSQL + API)
  - Helper script (`scripts/docker-dev.sh`) for common Docker operations
  - Comprehensive Docker documentation (`docs/DOCKER.md`)
  - Quick reference guide (`docs/DOCKER_QUICKREF.md`)
  - GitHub Actions workflow for automated Docker builds and publishing
  - .dockerignore for optimized builds
  - Health check endpoints for container monitoring
  - Volume persistence for artifacts and screenshots
  - Network isolation and security configurations

### Changed
- Updated README.md with Docker quick start instructions
- Added references to Docker documentation

### Technical Details
- Base Image: `mcr.microsoft.com/playwright:v1.56.1-jammy`
- Database: PostgreSQL 15 (Alpine)
- Build Time: ~55 seconds on first build
- Runtime: Node.js 20 LTS
- Exposed Ports: 3000 (API), 9090 (Metrics)
