# Default Proxy Integration Plan

## Overview

Add support for `DEFAULT_PROXY` environment variable. When set, all browsers will be launched with this proxy configuration. The proxy is applied at browser launch time, not per job, and is NOT saved to job records.

## Implementation Steps

### Step 1: Add Environment Variable Validation

**File:** `src/config/validation.schema.ts`

Add to the validation schema:

```typescript
// Proxy Configuration
DEFAULT_PROXY: Joi.string()
  .optional()
  .allow('')
  .pattern(/^(https?|socks5):\/\/.+/)
  .message('DEFAULT_PROXY must be a valid proxy URL (http://, https://, or socks5://)'),
```

**Location:** Add after the `LOG_LEVEL` field (around line 53).

### Step 2: Update BrowserPoolService

**File:** `src/modules/browsers/services/browser-pool.service.ts`

#### 2.1 Inject ConfigService

Add to the constructor dependencies:

```typescript
import { ConfigService } from '@nestjs/config';

constructor(
  private readonly configService: ConfigService,
) {
  // ... existing code ...
}
```

**Note:** You'll need to add `ConfigModule` to the `BrowsersModule` imports if it's not already there.

#### 2.2 Add Method to Parse Default Proxy

Add a private method to parse the default proxy URL:

```typescript
private getDefaultProxy(): { server: string; username?: string; password?: string } | null {
  const defaultProxy = this.configService.get<string>('DEFAULT_PROXY');
  
  if (!defaultProxy || defaultProxy.trim() === '') {
    return null;
  }

  try {
    const urlObj = new URL(defaultProxy);
    const config: { server: string; username?: string; password?: string } = {
      server: defaultProxy,
    };
    
    if (urlObj.username) {
      config.username = decodeURIComponent(urlObj.username);
    }
    if (urlObj.password) {
      config.password = decodeURIComponent(urlObj.password);
    }
    
    return config;
  } catch (error) {
    this.logger.error(`Invalid DEFAULT_PROXY URL: ${defaultProxy}`);
    return null;
  }
}
```

#### 2.3 Update createBrowser Method

In the `BrowserPool` class, update the `createBrowser()` method to include proxy:

```typescript
private async createBrowser(): Promise<Browser> {
  try {
    const launchOptions: LaunchOptionsType = {
      headless: this.browserConfig.launchOptions.headless,
      args: this.browserConfig.launchOptions.args,
    };

    // Add default proxy if configured
    const defaultProxy = this.getDefaultProxy();
    if (defaultProxy) {
      launchOptions.proxy = {
        server: defaultProxy.server,
        ...(defaultProxy.username && { username: defaultProxy.username }),
        ...(defaultProxy.password && { password: defaultProxy.password }),
      };
      this.logger.debug(
        `Launching ${this.browserType} browser with default proxy: ${this.maskProxyUrl(defaultProxy.server)}`,
      );
    }

    let browser: Browser;
    switch (this.browserConfig.type) {
      case 'chromium':
        browser = await chromium.launch(launchOptions);
        break;
      case 'firefox':
        browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        browser = await webkit.launch(launchOptions);
        break;
      default:
        throw new Error(`Unknown browser type: ${this.browserConfig.type}`);
    }

    return browser;
  } catch (error) {
    this.logger.error(
      `Failed to create ${this.browserType} browser: ${error.message}`,
    );
    throw error;
  }
}
```

**Note:** The `getDefaultProxy()` method needs to be accessible from the `BrowserPool` class. You have two options:

**Option A:** Pass the default proxy config to BrowserPool constructor:
```typescript
// In BrowserPoolService.getOrCreatePool()
const defaultProxy = this.getDefaultProxy();
pool = new BrowserPool(browserType, config, this.config, this.logger, defaultProxy);

// In BrowserPool constructor
constructor(
  private readonly browserType: string,
  private readonly browserConfig: BrowserTypeConfig,
  private readonly config: BrowserPoolConfig,
  private readonly logger: Logger,
  private readonly defaultProxy: { server: string; username?: string; password?: string } | null,
) {
  // ...
}
```

**Option B:** Make `getDefaultProxy()` a method of BrowserPoolService and pass it as a callback, or make BrowserPool have access to ConfigService.

**Recommended:** Use Option A (pass default proxy to constructor).

#### 2.4 Add Helper Method to Mask Proxy URL

Add a private method to mask credentials in proxy URLs for logging:

```typescript
private maskProxyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.username || urlObj.password) {
      return `${urlObj.protocol}//***:***@${urlObj.host}${urlObj.pathname}`;
    }
    return url;
  } catch {
    return url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  }
}
```

#### 2.5 Add Startup Logging

In `onModuleInit()`, log if default proxy is configured:

```typescript
onModuleInit() {
  this.logger.log('BrowserPoolService initialized');
  
  const defaultProxy = this.getDefaultProxy();
  if (defaultProxy) {
    this.logger.log(`Default proxy enabled: ${this.maskProxyUrl(defaultProxy.server)}`);
  }
  
  this.startCleanupInterval();
}
```

### Step 3: Update BrowsersModule

**File:** `src/modules/browsers/browsers.module.ts`

Ensure `ConfigModule` is imported:

```typescript
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule, // Add if not already present
    // ... other imports
  ],
  // ...
})
```

### Step 4: Update Docker Compose

**File:** `docker-compose.yml`

Add to the `api` service environment variables:

```yaml
environment:
  # ... existing variables ...
  
  # Proxy Configuration
  DEFAULT_PROXY: ${DEFAULT_PROXY:-}  # Optional: Default proxy for all browsers
```

### Step 5: Update JobProcessorService (Remove Job-Specific Proxy Logic)

**File:** `src/modules/jobs/services/job-processor.service.ts`

**Important:** Since we're applying proxy at browser launch (not per context), we need to remove the job-specific proxy logic from `executeJob()` method. The proxy from job entities should still be saved to the database (for tracking), but it should NOT be used when creating browser contexts.

Update the `executeJob()` method to remove proxy from context options:

```typescript
private async executeJob(
  browser: Browser,
  job: AutomationJob,
): Promise<void> {
  // Prepare context options
  const contextOptions: CreateContextOptions = {
    viewport: {
      width: 1920,
      height: 1080,
    },
  };

  // Note: Proxy is now configured at browser launch time (DEFAULT_PROXY)
  // Job-specific proxy settings are stored in the database but not used
  // for browser context creation since proxy is set at browser launch.

  // Create browser context
  const context = await this.contextManager.createContext(browser, contextOptions);
  
  // ... rest of the method remains the same
}
```

**Optional:** You can still log if a job has a proxy configured (for tracking), but note that it won't be used:

```typescript
if (job.proxyServer) {
  await this.jobLogService.logJobEvent(
    job.id,
    LogLevel.INFO,
    `Job has proxy configured (${job.proxyServer}), but using default proxy from browser launch`,
  );
}
```

## Testing

### Manual Testing

1. **Test without DEFAULT_PROXY:**
   ```bash
   # Start API without DEFAULT_PROXY
   docker compose up -d
   
   # Create a job and verify it works
   curl -X POST http://localhost:3333/api/v1/jobs \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_KEY" \
     -d '{"browserTypeId": 1, "targetUrl": "https://httpbin.org/ip", "actions": [{"action": "screenshot"}]}'
   ```

2. **Test with DEFAULT_PROXY:**
   ```bash
   # Set DEFAULT_PROXY in docker-compose.yml or .env
   DEFAULT_PROXY=socks5://tor_general:9050
   
   # Restart API
   docker compose restart api
   
   # Check logs for "Default proxy enabled"
   docker compose logs api | grep -i "default proxy"
   
   # Create a job and verify proxy is used
   curl -X POST http://localhost:3333/api/v1/jobs \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_KEY" \
     -d '{"browserTypeId": 1, "targetUrl": "https://httpbin.org/ip", "actions": [{"action": "screenshot"}]}'
   ```

3. **Verify proxy is NOT saved to job records:**
   ```bash
   # Check database - proxy fields should be NULL
   docker compose exec postgres psql -U automation_user -d browser_automation -c \
     "SELECT id, proxy_server FROM automation_jobs ORDER BY created_at DESC LIMIT 1;"
   ```

## Summary of Changes

1. ✅ Add `DEFAULT_PROXY` to validation schema
2. ✅ Inject `ConfigService` into `BrowserPoolService`
3. ✅ Add `getDefaultProxy()` method to parse proxy URL
4. ✅ Update `createBrowser()` to include proxy in launch options
5. ✅ Pass default proxy to `BrowserPool` constructor
6. ✅ Add startup logging for default proxy
7. ✅ Update `docker-compose.yml` with `DEFAULT_PROXY` variable
8. ✅ Remove job-specific proxy from context creation (proxy is at browser launch)
9. ✅ Ensure `ConfigModule` is imported in `BrowsersModule`

## Notes

- **Proxy is applied at browser launch**, not per context
- **Job-specific proxy settings are ignored** - only `DEFAULT_PROXY` is used
- **Proxy is NOT saved to job records** - it's a global browser configuration
- **All browsers in the pool** will use the same default proxy
- **Proxy URL can include authentication**: `http://user:pass@proxy.example.com:8080`
