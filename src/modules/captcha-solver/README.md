# Captcha Solver Module

## Overview

The Captcha Solver module provides anti-bot detection and captcha solving capabilities for the browsers-api NestJS application. It integrates with popular captcha solving services to handle challenges from Cloudflare, DataDome, Akamai, Imperva, reCAPTCHA, and hCAPTCHA during browser automation tasks.

## Features

- **Multiple Provider Support**: Integrates with 2Captcha and Anti-Captcha services
- **API Key Rotation**: Supports multiple API keys per provider for load balancing
- **Configuration Management**: Persistent configuration storage using TypeORM
- **Browser Integration**: Seamlessly integrates with existing browser pool and job processing
- **RESTful API**: Endpoints for managing providers, configuration, and testing

## Installation

### 1. Install Dependencies

The module uses existing dependencies from the main application. No additional packages are required at this stage.

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Captcha Solver
2CAPTCHA_API_KEY=your_2captcha_api_key_here
ANTICAPTCHA_API_KEY=your_anticaptcha_api_key_here
```

**Note**: You can specify multiple API keys for a provider by separating them with commas:
```bash
2CAPTCHA_API_KEY=key1,key2,key3
```

### 3. Run Migrations

Run the database migration to create the `captcha_solver_configs` table:

```bash
npm run typeorm migration:run
```

**For Docker deployments**: The migration will run automatically when the container starts if configured in your docker-entrypoint.sh or deployment scripts.

## Usage

### Service Injection

Inject the `CaptchaSolverService` into your services:

```typescript
import { CaptchaSolverService } from './modules/captcha-solver/captcha-solver.service';

@Injectable()
export class YourService {
  constructor(
    private readonly captchaSolverService: CaptchaSolverService,
  ) {}
}
```

### Check Available Providers

```typescript
const providers = this.captchaSolverService.getAvailableProviders();
console.log('Available providers:', providers);
// Output: ['2captcha', 'anticaptcha']
```

### Get API Key

```typescript
const apiKey = this.captchaSolverService.getApiKey('2captcha');
if (apiKey) {
  // Use the API key
}
```

### Configuration Management

```typescript
// Get configuration
const config = await this.captchaSolverService.getConfig('preferred_provider');

// Set configuration
await this.captchaSolverService.setConfig('preferred_provider', '2captcha');

// Get all configurations
const allConfigs = await this.captchaSolverService.getAllConfigs();
```

## API Endpoints

### GET /captcha-solver/providers

List all available captcha solver providers.

**Response:**
```json
{
  "providers": ["2captcha", "anticaptcha"]
}
```

### GET /captcha-solver/config

Get current captcha solver configuration.

**Response:**
```json
{
  "configs": {
    "preferred_provider": "2captcha",
    "timeout_seconds": "60",
    "max_retries": "3"
  }
}
```

### PATCH /captcha-solver/config

Update captcha solver configuration.

**Request Body:**
```json
{
  "key": "preferred_provider",
  "value": "anticaptcha"
}
```

**Response:**
```json
{
  "message": "Configuration updated successfully",
  "config": {
    "key": "preferred_provider",
    "value": "anticaptcha"
  }
}
```

## Database Schema

### captcha_solver_configs

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| key | VARCHAR(255) | Configuration key (unique) |
| value | TEXT | Configuration value |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Default configurations:**
- `preferred_provider`: '2captcha'
- `timeout_seconds`: '60'
- `max_retries`: '3'

## Architecture

The module follows NestJS best practices:

- **Module**: `CaptchaSolverModule` - Main module definition with imports and exports
- **Service**: `CaptchaSolverService` - Core business logic, API key management, configuration
- **Controller**: `CaptchaSolverController` - RESTful API endpoints
- **Entity**: `CaptchaSolverConfig` - TypeORM entity for configuration storage
- **Interfaces**: Type definitions for captcha solving operations

## Integration Points

### Browser Module
- Imports `BrowsersModule` to access `BrowserPoolService`
- Future integration for applying stealth mode to browser contexts

### Jobs Module
- Exported service can be imported by `JobsModule`
- Future integration for captcha solving during job execution

## Testing

Run unit tests:

```bash
npm run test src/modules/captcha-solver
```

Run test coverage:

```bash
npm run test:cov src/modules/captcha-solver
```

## Next Steps

This module provides the infrastructure foundation. The following features are planned:

1. **Anti-Bot Detection Service** (Task #2) - Implement detection logic for various anti-bot systems
2. **Captcha Solver Providers** (Task #3) - Implement actual HTTP integrations with 2Captcha and Anti-Captcha
3. **Stealth Configuration** (Task #4) - Browser stealth mode implementation
4. **Solver Orchestration** (Task #5) - Main solving logic that coordinates detection and solving
5. **Job Integration** (Task #6) - Integration with job processing workflow

## Docker Deployment

### Environment Variables

When deploying with Docker, add the captcha solver API keys to your docker-compose.yml or Kubernetes secrets:

```yaml
# docker-compose.yml
environment:
  - 2CAPTCHA_API_KEY=${2CAPTCHA_API_KEY}
  - ANTICAPTCHA_API_KEY=${ANTICAPTCHA_API_KEY}
```

For Kubernetes, update the ConfigMap or Secrets:

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: browsers-api-secrets
stringData:
  2CAPTCHA_API_KEY: "your_key_here"
  ANTICAPTCHA_API_KEY: "your_key_here"
```

### Building the Docker Image

The module files will be included automatically in your Docker build. No additional steps required.

## Troubleshooting

### API Keys Not Loading

Check that environment variables are correctly set in your `.env` file (local) or Docker/Kubernetes configuration (production) and that the application has been restarted.

### Module Not Registered

Ensure `CaptchaSolverModule` is imported in `AppModule`:

```typescript
@Module({
  imports: [
    // ... other modules
    CaptchaSolverModule,
  ],
})
export class AppModule {}
```

### Migration Errors

If the migration fails, check your database connection and ensure you have proper permissions to create tables.

## License

Copyright (c) 2024 - Same as parent project license
