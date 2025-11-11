# Xvfb Integration Plan

## Overview

This document outlines the plan for integrating Xvfb (X Virtual Framebuffer) into the Browsers API project. Xvfb will allow browsers to run with `headless: false` on virtual displays, enabling better compatibility with web applications that require a display server.

## Goals

1. Install and configure Xvfb in the Docker container
2. Automatically start Xvfb when the container starts
3. Configure browsers to use the virtual display with `headless: false`
4. Make Xvfb configuration flexible via environment variables
5. Ensure proper cleanup and error handling for Xvfb processes

## Architecture

### Current State
- Browsers run with `headless: true` by default
- Playwright browsers are launched via `BrowserPoolService`
- Configuration is managed through environment variables and `ConfigService`
- Docker image is based on `mcr.microsoft.com/playwright:v1.56.1-jammy`

### Target State
- Xvfb runs as a background service in the container
- Browsers run with `headless: false` when Xvfb is enabled
- DISPLAY environment variable is set to the Xvfb display
- Configuration allows enabling/disabling Xvfb and customizing display settings

## Implementation Plan

### Phase 1: Docker Infrastructure

#### 1.1 Update Dockerfile
- Install Xvfb package (`xvfb`)
- Create startup script to launch Xvfb before the application
- Ensure Xvfb is available in the PATH

#### 1.2 Create Xvfb Startup Script
- Script to start Xvfb with configurable display number
- Handle Xvfb process lifecycle (start, stop, health check)
- Set DISPLAY environment variable appropriately

#### 1.3 Update docker-compose.yml
- Add Xvfb-related environment variables
- Configure display settings (resolution, depth, etc.)

### Phase 2: Configuration

#### 2.1 Update Validation Schema
- Add `XVFB_ENABLED` (boolean, default: false)
- Add `XVFB_DISPLAY` (string, default: ":99")
- Add `XVFB_SCREEN` (number, default: 0)
- Add `XVFB_RESOLUTION` (string, default: "1920x1080x24")
- Add `XVFB_ARGS` (string, optional additional arguments)

#### 2.2 Update Browser Pool Service
- Inject `ConfigService` to read configuration
- Read `PLAYWRIGHT_HEADLESS` from config (currently hardcoded)
- When Xvfb is enabled, set `headless: false`
- Verify DISPLAY environment variable is set before launching browsers

### Phase 3: Xvfb Management Service (Optional Enhancement)

#### 3.1 Create XvfbService
- Service to manage Xvfb process lifecycle
- Start Xvfb on module initialization
- Stop Xvfb on module destruction
- Health check to verify Xvfb is running
- Support for multiple displays if needed in the future

#### 3.2 Integration with Browser Pool
- Ensure Xvfb is running before browser pool initialization
- Handle Xvfb failures gracefully
- Log Xvfb status and errors

### Phase 4: Testing & Validation

#### 4.1 Unit Tests
- Test Xvfb configuration reading
- Test browser launch with Xvfb enabled/disabled
- Test error handling when Xvfb fails

#### 4.2 Integration Tests
- Test full Docker container startup with Xvfb
- Verify browsers can launch with `headless: false`
- Test browser automation actions work correctly

#### 4.3 Manual Testing
- Start container and verify Xvfb is running
- Create a job and verify browser runs successfully
- Check logs for any Xvfb-related errors

### Phase 5: Documentation

#### 5.1 Update README.md
- Document Xvfb configuration options
- Add examples for enabling Xvfb
- Explain when to use Xvfb vs headless mode

#### 5.2 Update Docker Documentation
- Document Xvfb environment variables
- Add troubleshooting section for Xvfb issues
- Update quick start guide

## Technical Details

### Xvfb Command
```bash
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
```

### Environment Variables
- `DISPLAY=:99.0` - Points browsers to the virtual display
- `XVFB_ENABLED=true` - Enable/disable Xvfb
- `XVFB_DISPLAY=:99` - Display number
- `XVFB_RESOLUTION=1920x1080x24` - Screen resolution and color depth

### Browser Launch Options
When Xvfb is enabled:
- `headless: false` - Browsers run in non-headless mode
- DISPLAY environment variable must be set
- All existing browser args remain the same

### Process Management
- Xvfb should start before the NestJS application
- Use a process manager or entrypoint script
- Ensure Xvfb stops gracefully on container shutdown

## Considerations

### Performance
- Xvfb adds minimal overhead
- Multiple browsers can share the same display
- Consider display isolation for high concurrency (future enhancement)

### Security
- Xvfb runs in the container, isolated from host
- No additional security concerns beyond existing Docker setup

### Compatibility
- Works with all Playwright browsers (Chromium, Firefox, WebKit)
- Compatible with existing browser pool architecture
- No changes needed to job processing logic

### Error Handling
- If Xvfb fails to start, fall back to headless mode or fail fast
- Log clear error messages for debugging
- Health checks should verify Xvfb is running

## Migration Path

1. **Phase 1-2**: Basic Xvfb integration (Docker + Config)
   - Users can enable Xvfb via environment variable
   - Default remains headless mode for backward compatibility

2. **Phase 3**: Optional XvfbService for better management
   - Provides programmatic control over Xvfb
   - Better error handling and health checks

3. **Phase 4-5**: Testing and documentation
   - Ensure stability and document usage

## Future Enhancements

- Support for multiple Xvfb displays (one per browser instance)
- Dynamic display allocation for better isolation
- Xvfb health monitoring and auto-restart
- Support for other virtual display servers (Xephyr, Xvnc)

