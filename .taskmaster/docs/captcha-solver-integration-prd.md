# Captcha Solver Integration - Product Requirements Document

## Overview
Integrate anti-bot detection and captcha solving capabilities into the browsers-api NestJS application to handle Cloudflare, DataDome, Akamai, Imperva, reCAPTCHA, and hCAPTCHA challenges during browser automation tasks.

## Business Goals
- Enable browser automation jobs to bypass common anti-bot protections
- Support multiple captcha solving services (2Captcha, Anti-Captcha, etc.)
- Provide stealth mode configuration to avoid detection
- Maintain high success rates for automated browser tasks

## Technical Requirements

### 1. Core Infrastructure Setup
Create a new NestJS module for captcha solving functionality with proper dependency injection, configuration management, and integration with the existing browsers and jobs modules.

**Requirements:**
- Create `src/modules/captcha-solver/` directory structure
- Implement NestJS module, service, and configuration
- Add environment variables for captcha service API keys
- Integrate with existing browser pool and job processing

### 2. Anti-Bot Detection System
Implement detection logic for multiple anti-bot systems based on the provided sample code, adapted for the NestJS architecture.

**Detection Support:**
- Cloudflare (challenge pages, ray IDs, challenge forms)
- DataDome (captcha containers, cookies)
- Akamai Bot Manager (sensor scripts, bmak objects)
- Imperva/Incapsula (cookies, scripts)
- reCAPTCHA (iframe detection)
- hCAPTCHA (iframe detection)

**Requirements:**
- Create detection service with methods for each anti-bot system
- Implement confidence scoring (0-1 range)
- Return structured detection results with type and confidence
- Handle detection errors gracefully

### 3. Captcha Solver Services
Implement captcha solving service integrations with support for multiple providers.

**Providers to Support:**
- 2Captcha (primary)
- Anti-Captcha (fallback)
- Extensible architecture for additional providers

**Requirements:**
- Create abstract captcha solver interface
- Implement 2Captcha HTTP API integration
- Implement Anti-Captcha HTTP API integration
- Add retry logic and timeout handling
- Support for reCAPTCHA v2/v3, hCAPTCHA, DataDome

### 4. Stealth Configuration
Implement browser stealth mode to avoid detection by anti-bot systems.

**Requirements:**
- Override navigator.webdriver property
- Mock browser plugins and languages
- Set realistic HTTP headers and viewport
- Implement human-like mouse movements
- Apply stealth settings to browser contexts and pages
- Integrate with existing browser launch configuration

### 5. Solver Orchestration
Implement main solving logic that detects challenges and applies appropriate solutions.

**Requirements:**
- Detect anti-bot blocks during page navigation
- Select appropriate solving strategy based on detection
- Handle Cloudflare automatic challenges (wait-based)
- Integrate captcha solvers for DataDome, reCAPTCHA, hCAPTCHA
- Implement timeout and retry logic
- Log solving attempts and results

### 6. Job Integration
Integrate captcha solving into the existing job processing workflow.

**Requirements:**
- Add captcha solver options to job configuration
- Enable/disable captcha solving per job
- Configure solver provider preference per job
- Add captcha solving status to job results
- Handle captcha solving failures gracefully
- Update job error messages with captcha-specific details

### 7. API Endpoints
Create REST API endpoints for captcha solver management and testing.

**Endpoints:**
- GET /captcha-solver/providers - List available solver providers
- POST /captcha-solver/test - Test captcha solving with URL
- GET /captcha-solver/config - Get current configuration
- PATCH /captcha-solver/config - Update configuration
- GET /captcha-solver/stats - Get solving statistics

### 8. Configuration Management
Implement configuration system for captcha solver settings.

**Requirements:**
- Environment variables for API keys
- Database storage for provider preferences
- API key validation on startup
- Support for multiple API keys per provider (rotation)
- Configuration validation and error handling

### 9. Monitoring & Logging
Implement comprehensive logging and monitoring for captcha solving operations.

**Requirements:**
- Log detection attempts and results
- Log solving attempts, success/failure, and duration
- Track solving statistics (success rate, avg time)
- Integration with existing Winston logger
- Structured log format for analysis
- Alert on repeated failures

### 10. Testing & Documentation
Create comprehensive tests and documentation for the captcha solver functionality.

**Requirements:**
- Unit tests for detection logic
- Unit tests for solver services
- Integration tests for job workflow
- E2E tests with mock captcha challenges
- API documentation (Swagger/OpenAPI)
- Usage guide with examples
- Troubleshooting guide

## Technical Constraints
- Must work with existing Playwright browser automation
- Must integrate with NestJS dependency injection
- Must not break existing job processing
- Must handle API rate limits gracefully
- Must support Docker deployment

## Success Criteria
- Successfully detect 6 types of anti-bot systems with >90% accuracy
- Solve captchas with >85% success rate
- Average solving time < 30 seconds
- Zero impact on non-captcha jobs
- Complete API documentation
- Comprehensive test coverage >80%

## Implementation Notes
- Follow existing NestJS module structure
- Use TypeORM for configuration storage
- Integrate with existing logger service
- Maintain backward compatibility with existing jobs
- Use environment variables for sensitive data
- Follow project coding standards (ESLint, Prettier)

## Dependencies
- @playwright/test (existing)
- axios or node-fetch for HTTP requests to captcha services
- NestJS modules: @nestjs/config, @nestjs/typeorm
- Existing modules: browsers, jobs, workers

## Deployment
- Add new environment variables to .env.example
- Update Docker configuration if needed
- Update Kubernetes ConfigMap and Secrets
- Document deployment steps
- Create migration for new database tables (if needed)
