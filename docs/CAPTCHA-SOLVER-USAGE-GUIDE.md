# Captcha Solver Usage Guide

This comprehensive guide covers installation, configuration, and usage patterns for the Captcha Solver module in the Browsers API.

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Basic Usage](#basic-usage)
4. [Advanced Configuration](#advanced-configuration)
5. [Common Use Cases](#common-use-cases)
6. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- Node.js v20.x LTS or higher
- PostgreSQL database
- NestJS application with the Browsers API installed

### Step 1: Install Dependencies

The Captcha Solver module uses existing dependencies from the main application. No additional packages are required.

### Step 2: Run Database Migrations

The module requires a database table for configuration storage. Run the migration:

```bash
npm run typeorm migration:run
```

**For Docker deployments**: Migrations run automatically when the container starts.

### Step 3: Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Captcha Solver API Keys
2CAPTCHA_API_KEY=your_2captcha_api_key_here
ANTICAPTCHA_API_KEY=your_anticaptcha_api_key_here

# Optional: Multiple API keys for load balancing (comma-separated)
2CAPTCHA_API_KEY=key1,key2,key3

# Optional: Global Configuration
CAPTCHA_SOLVER_PREFERRED_PROVIDER=2captcha
CAPTCHA_SOLVER_TIMEOUT_SECONDS=60
CAPTCHA_SOLVER_MAX_RETRIES=3
CAPTCHA_SOLVER_ENABLE_AUTO_RETRY=true
CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE=0.7

# Optional: Per-captcha-type fallback settings
CAPTCHA_SOLVER_FALLBACK_RECAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_HCAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_DATADOME=true
CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA=true

# Optional: Audio Captcha Processing (for audio challenges)
GOOGLE_SPEECH_API_KEY=your_google_speech_api_key
OPENAI_API_KEY=your_openai_api_key
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_region
AUDIO_CAPTCHA_PROVIDER_PRIORITY=google-cloud,openai-whisper,azure-speech
AUDIO_CAPTCHA_MIN_CONFIDENCE=0.7
AUDIO_CAPTCHA_MAX_RETRIES=3
```

### Step 4: Verify Installation

Check that the module is properly registered in `AppModule`:

```typescript
import { CaptchaSolverModule } from './modules/captcha-solver/captcha-solver.module';

@Module({
  imports: [
    // ... other modules
    CaptchaSolverModule,
  ],
})
export class AppModule {}
```

---

## Configuration

### Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `2CAPTCHA_API_KEY` | API key for 2Captcha service | `abc123def456...` |
| `ANTICAPTCHA_API_KEY` | API key for Anti-Captcha service | `xyz789uvw012...` |

**Note**: At least one API key is required. You can specify multiple keys per provider by separating them with commas for automatic rotation.

#### Optional Global Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CAPTCHA_SOLVER_PREFERRED_PROVIDER` | `2captcha` | Preferred provider (`2captcha` or `anticaptcha`) |
| `CAPTCHA_SOLVER_TIMEOUT_SECONDS` | `60` | Timeout for solving requests (10-300 seconds) |
| `CAPTCHA_SOLVER_MAX_RETRIES` | `3` | Maximum retry attempts (0-10) |
| `CAPTCHA_SOLVER_ENABLE_AUTO_RETRY` | `true` | Enable automatic retry on failure |
| `CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE` | `0.7` | Minimum confidence for detection (0-1) |
| `CAPTCHA_SOLVER_FALLBACK_RECAPTCHA` | `true` | Enable fallback for reCAPTCHA |
| `CAPTCHA_SOLVER_FALLBACK_HCAPTCHA` | `true` | Enable fallback for hCAPTCHA |
| `CAPTCHA_SOLVER_FALLBACK_DATADOME` | `true` | Enable fallback for DataDome |
| `CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA` | `true` | Enable fallback for FunCaptcha |

### Job-Level Configuration

You can override global settings per job using the `captcha` field in the job creation request:

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [...],
  "captcha": {
    "enabled": true,
    "minConfidence": 0.5,
    "enableThirdPartyFallback": true,
    "solverPriority": ["native", "2captcha", "anticaptcha"],
    "maxRetries": {
      "recaptcha": 3,
      "hcaptcha": 3,
      "datadome": 4,
      "funcaptcha": 3
    },
    "timeouts": {
      "recaptcha": 30000,
      "hcaptcha": 30000,
      "datadome": 45000,
      "funcaptcha": 30000
    }
  }
}
```

#### Job Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|------------|
| `enabled` | `boolean` | `false` | Enable captcha solving for this job |
| `minConfidence` | `number` | `0.5` | Minimum confidence threshold (0-1) |
| `enableThirdPartyFallback` | `boolean` | `true` | Enable third-party provider fallback |
| `solverPriority` | `string[]` | `["native", "2captcha", "anticaptcha"]` | Priority order for solver types |
| `maxRetries` | `object` | `{ recaptcha: 3, hcaptcha: 3, ... }` | Max retries per captcha type |
| `timeouts` | `object` | `{ recaptcha: 30000, ... }` | Timeout per captcha type (milliseconds) |

---

## Basic Usage

### Creating a Job with Captcha Solving

The simplest way to enable captcha solving is to include the `captcha` field in your job creation request:

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://example.com/login",
    "actions": [
      {
        "action": "fill",
        "target": "Email",
        "getTargetBy": "getByLabel",
        "value": "user@example.com"
      },
      {
        "action": "click",
        "target": "Submit",
        "getTargetBy": "getByText"
      },
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "captcha": {
      "enabled": true
    }
  }'
```

### Checking Job Status

After creating a job, check its status to see if captcha solving was successful:

```bash
curl -X GET http://localhost:3333/api/v1/jobs/{jobId} \
  -H "X-API-Key: your-api-key"
```

**Response Example:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "actions": [...],
    "captcha": {
      "solved": true,
      "solverType": "native-recaptcha-solver",
      "usedThirdParty": false,
      "duration": 5234,
      "attempts": 1,
      "detection": {
        "detected": true,
        "type": "recaptcha",
        "confidence": 0.95,
        "details": {
          "sitekey": "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
        }
      }
    }
  }
}
```

---

## Advanced Configuration

### Using Native Solvers Only

To use only native (built-in) solvers without third-party fallback:

```json
{
  "captcha": {
    "enabled": true,
    "enableThirdPartyFallback": false,
    "solverPriority": ["native"]
  }
}
```

### Custom Retry Configuration

Configure different retry limits for different captcha types:

```json
{
  "captcha": {
    "enabled": true,
    "maxRetries": {
      "recaptcha": 5,
      "hcaptcha": 3,
      "datadome": 4,
      "funcaptcha": 3
    }
  }
}
```

### Custom Timeout Configuration

Set different timeouts for different captcha types:

```json
{
  "captcha": {
    "enabled": true,
    "timeouts": {
      "recaptcha": 45000,
      "hcaptcha": 30000,
      "datadome": 60000,
      "funcaptcha": 30000
    }
  }
}
```

### Adjusting Detection Sensitivity

Lower the confidence threshold for more aggressive detection:

```json
{
  "captcha": {
    "enabled": true,
    "minConfidence": 0.3
  }
}
```

Or raise it for more conservative detection:

```json
{
  "captcha": {
    "enabled": true,
    "minConfidence": 0.8
  }
}
```

### Provider Priority

Specify the order in which solvers should be tried:

```json
{
  "captcha": {
    "enabled": true,
    "solverPriority": ["native", "2captcha", "anticaptcha"]
  }
}
```

Or prefer third-party services:

```json
{
  "captcha": {
    "enabled": true,
    "solverPriority": ["2captcha", "anticaptcha", "native"]
  }
}
```

---

## Common Use Cases

### Use Case 1: Simple Login with reCAPTCHA

**Scenario**: Automate login on a site protected by reCAPTCHA v2.

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://example.com/login",
    "actions": [
      {
        "action": "fill",
        "target": "Email",
        "getTargetBy": "getByLabel",
        "value": "user@example.com"
      },
      {
        "action": "fill",
        "target": "Password",
        "getTargetBy": "getByLabel",
        "value": "password123"
      },
      {
        "action": "click",
        "target": "Sign In",
        "getTargetBy": "getByText",
        "waitForNavigation": true
      },
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "captcha": {
      "enabled": true,
      "minConfidence": 0.5
    },
    "timeoutMs": 60000
  }'
```

### Use Case 2: Form Submission with hCAPTCHA

**Scenario**: Submit a contact form protected by hCAPTCHA.

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://example.com/contact",
    "actions": [
      {
        "action": "fill",
        "target": "Name",
        "getTargetBy": "getByLabel",
        "value": "John Doe"
      },
      {
        "action": "fill",
        "target": "Email",
        "getTargetBy": "getByLabel",
        "value": "john@example.com"
      },
      {
        "action": "fill",
        "target": "Message",
        "getTargetBy": "getByLabel",
        "value": "Hello, this is a test message."
      },
      {
        "action": "click",
        "target": "Submit",
        "getTargetBy": "getByText",
        "waitForNavigation": true
      }
    ],
    "captcha": {
      "enabled": true,
      "solverPriority": ["native", "2captcha"]
    },
    "timeoutMs": 90000
  }'
```

### Use Case 3: High-Volume Scraping with Native Solvers Only

**Scenario**: Scrape multiple pages with captchas, using only native solvers to avoid costs.

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com/protected-page",
  "actions": [
    {
      "action": "screenshot",
      "fullPage": true,
      "type": "png"
    }
  ],
  "captcha": {
    "enabled": true,
    "enableThirdPartyFallback": false,
    "solverPriority": ["native"],
    "maxRetries": {
      "recaptcha": 2,
      "hcaptcha": 2
    }
  },
  "timeoutMs": 45000
}
```

### Use Case 4: Critical Job with Aggressive Retry

**Scenario**: Important job that must succeed, with multiple retry attempts.

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com/critical-action",
  "actions": [...],
  "captcha": {
    "enabled": true,
    "enableThirdPartyFallback": true,
    "solverPriority": ["native", "2captcha", "anticaptcha"],
    "maxRetries": {
      "recaptcha": 5,
      "hcaptcha": 5,
      "datadome": 5
    },
    "timeouts": {
      "recaptcha": 60000,
      "hcaptcha": 60000,
      "datadome": 90000
    }
  },
  "timeoutMs": 180000
}
```

### Use Case 5: Testing Captcha Detection

**Scenario**: Test if a page has captcha protection without solving it.

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com/test-page",
  "actions": [
    {
      "action": "screenshot",
      "fullPage": true,
      "type": "png"
    }
  ],
  "captcha": {
    "enabled": true,
    "minConfidence": 0.1
  },
  "timeoutMs": 30000
}
```

Check the job result to see detection information:

```json
{
  "result": {
    "captcha": {
      "solved": true,
      "detection": {
        "detected": true,
        "type": "recaptcha",
        "confidence": 0.95
      }
    }
  }
}
```

---

## Troubleshooting

### Issue: Captcha Not Detected

**Symptoms**: Job completes but no captcha is detected on a page that clearly has one.

**Solutions**:

1. **Lower the confidence threshold**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "minConfidence": 0.3
     }
   }
   ```

2. **Check if the captcha type is supported**: Currently supported types are:
   - reCAPTCHA v2
   - hCAPTCHA
   - DataDome
   - FunCaptcha

3. **Verify the page has loaded completely**: Ensure your job waits for the page to fully load:
   ```json
   {
     "waitUntil": "networkidle",
     "timeoutMs": 60000
   }
   ```

### Issue: Captcha Solving Fails

**Symptoms**: Captcha is detected but solving fails.

**Solutions**:

1. **Enable third-party fallback**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "enableThirdPartyFallback": true,
       "solverPriority": ["native", "2captcha", "anticaptcha"]
     }
   }
   ```

2. **Increase retry attempts**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "maxRetries": {
         "recaptcha": 5,
         "hcaptcha": 5
       }
     }
   }
   ```

3. **Increase timeout**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "timeouts": {
         "recaptcha": 60000,
         "hcaptcha": 60000
       }
     }
   }
   ```

4. **Verify API keys are valid**: Check that your `2CAPTCHA_API_KEY` or `ANTICAPTCHA_API_KEY` are correct and have sufficient balance.

### Issue: Job Times Out

**Symptoms**: Job fails with timeout error.

**Solutions**:

1. **Increase job timeout**:
   ```json
   {
     "timeoutMs": 120000
   }
   ```

2. **Increase captcha-specific timeouts**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "timeouts": {
         "recaptcha": 90000,
         "datadome": 120000
       }
     }
   }
   ```

3. **Reduce retry attempts**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "maxRetries": {
         "recaptcha": 2,
         "hcaptcha": 2
       }
     }
   }
   ```

### Issue: Third-Party Solver Not Used

**Symptoms**: Only native solver is used even when third-party fallback is enabled.

**Solutions**:

1. **Verify API keys are set**: Check environment variables:
   ```bash
   echo $2CAPTCHA_API_KEY
   echo $ANTICAPTCHA_API_KEY
   ```

2. **Check solver priority**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "enableThirdPartyFallback": true,
       "solverPriority": ["native", "2captcha", "anticaptcha"]
     }
   }
   ```

3. **Check provider availability**: Use the API to check available providers:
   ```bash
   curl -X GET http://localhost:3333/api/v1/captcha-solver/providers \
     -H "X-API-Key: your-api-key"
   ```

### Issue: High Costs from Third-Party Services

**Symptoms**: Unexpected charges from 2Captcha or Anti-Captcha.

**Solutions**:

1. **Use native solvers only**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "enableThirdPartyFallback": false,
       "solverPriority": ["native"]
     }
   }
   ```

2. **Limit retry attempts**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "maxRetries": {
         "recaptcha": 1,
         "hcaptcha": 1
       }
     }
   }
   ```

3. **Monitor usage**: Check the usage statistics API:
   ```bash
   curl -X GET http://localhost:3333/api/v1/captcha-solver/stats \
     -H "X-API-Key: your-api-key"
   ```

### Issue: Audio Captcha Not Solved

**Symptoms**: Audio captcha challenges are not being solved.

**Solutions**:

1. **Configure audio processing providers**:
   ```bash
   GOOGLE_SPEECH_API_KEY=your_key
   OPENAI_API_KEY=your_key
   AZURE_SPEECH_KEY=your_key
   AZURE_SPEECH_REGION=your_region
   AUDIO_CAPTCHA_PROVIDER_PRIORITY=google-cloud,openai-whisper,azure-speech
   ```

2. **Increase audio captcha retries**:
   ```json
   {
     "captcha": {
       "enabled": true,
       "maxRetries": {
         "recaptcha": 5
       }
     }
   }
   ```

### Issue: Module Not Found

**Symptoms**: Error about `CaptchaSolverModule` not being found.

**Solutions**:

1. **Verify module is imported in AppModule**:
   ```typescript
   import { CaptchaSolverModule } from './modules/captcha-solver/captcha-solver.module';

   @Module({
     imports: [
       CaptchaSolverModule,
       // ... other modules
     ],
   })
   export class AppModule {}
   ```

2. **Restart the application** after adding the module.

### Issue: Database Migration Errors

**Symptoms**: Migration fails when creating `captcha_solver_configs` table.

**Solutions**:

1. **Check database connection**: Verify PostgreSQL is running and accessible.

2. **Check database permissions**: Ensure the database user has CREATE TABLE permissions.

3. **Run migration manually**:
   ```bash
   npm run typeorm migration:run
   ```

4. **Check for existing table**: If the table already exists, the migration should skip it.

---

## Additional Resources

- [API Reference](tech/05-api-reference.md) - Complete API documentation
- [Swagger UI](http://localhost:3333/api/docs) - Interactive API documentation
- [Captcha Solver Module README](../src/modules/captcha-solver/README.md) - Module-specific documentation
- [Architecture Overview](tech/01-architecture-overview.md) - System architecture details

---

## Support

For additional help or to report issues:

1. Check the [troubleshooting section](#troubleshooting) above
2. Review application logs for detailed error messages
3. Check the Swagger UI for API endpoint details
4. Consult the technical documentation in the `docs/tech/` directory

---

**Last Updated**: 2025-01-17

