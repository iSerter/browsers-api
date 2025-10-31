# Changelog

All notable changes to this project will be documented in this file.

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
