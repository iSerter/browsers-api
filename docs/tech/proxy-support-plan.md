# Proxy Support Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding proxy support to the Browsers API. The solution leverages Playwright's context-level proxy configuration, which allows us to add proxy support without modifying the existing browser pool architecture.

## Analysis: Playwright Proxy Support

**Key Finding:** Playwright does NOT support setting proxies on already-launched browsers. Proxies must be configured at:

1. **Browser launch time** (via `browser.launch({ proxy: {...} })`)
2. **Browser context creation time** (via `browser.newContext({ proxy: {...} })`)

### Why Context-Level Proxy Works for Our Architecture

Since our system uses a browser pool with pre-launched browsers, we'll use **context-level proxy configuration**. This approach works perfectly because:

- ✅ Each job creates a new browser context anyway
- ✅ Contexts can have proxy settings even if the browser was launched without one
- ✅ This preserves our existing pool architecture
- ✅ No need to modify browser launch logic

## Implementation Plan

### Phase 1: Database Schema and Entity Updates

#### 1.1 Add Proxy Fields to `AutomationJob` Entity

**File:** `src/modules/jobs/entities/automation-job.entity.ts`

Add the following fields:
- `proxyServer` (string, nullable) - Proxy server URL (e.g., `http://proxy.example.com:8080`)
- `proxyUsername` (string, nullable) - Optional proxy authentication username
- `proxyPassword` (string, nullable) - Optional proxy authentication password

**Column Names:**
- `proxy_server` (VARCHAR, nullable)
- `proxy_username` (VARCHAR, nullable)
- `proxy_password` (VARCHAR, nullable)

#### 1.2 Create Database Migration

**File:** `src/database/migrations/[timestamp]-AddProxySupportToJobs.ts`

Migration should:
- Add three nullable columns to `automation_jobs` table
- Consider adding index on `proxy_server` if needed for filtering/analytics
- Ensure backward compatibility (all existing jobs will have NULL values)

### Phase 2: DTO and Validation Updates

#### 2.1 Update `CreateJobDto`

**File:** `src/modules/jobs/dto/create-job.dto.ts`

Add optional `proxy` object with validation:
```typescript
@IsOptional()
@ValidateNested()
@Type(() => ProxyConfigDto)
proxy?: ProxyConfigDto;
```

Create new DTO:
**File:** `src/modules/jobs/dto/proxy-config.dto.ts`
```typescript
export class ProxyConfigDto {
  @IsUrl({ require_protocol: true })
  @IsString()
  server: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
```

**Validation Rules:**
- `server` is required if proxy object is provided
- Must be a valid URL with protocol (http:// or https://)
- `username` and `password` are optional
- If `username` is provided, `password` should also be provided (consider adding custom validator)

#### 2.2 Update `JobsService.createJob()`

**File:** `src/modules/jobs/jobs.service.ts`

Map DTO proxy object to entity fields:
```typescript
if (createJobDto.proxy) {
  job.proxyServer = createJobDto.proxy.server;
  job.proxyUsername = createJobDto.proxy.username;
  job.proxyPassword = createJobDto.proxy.password;
}
```

### Phase 3: Browser Context Integration

#### 3.1 Update `CreateContextOptions` Interface

**File:** `src/modules/browsers/interfaces/browser-pool.interface.ts`

Add optional `proxy` field matching Playwright's proxy format:
```typescript
export interface CreateContextOptions {
  viewport?: ViewportConfig;
  userAgent?: string;
  timeout?: number;
  ignoreHTTPSErrors?: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}
```

#### 3.2 Update `BrowserContextManagerService.createContext()`

**File:** `src/modules/browsers/services/browser-context-manager.service.ts`

- Accept proxy configuration in options
- Pass proxy to `browser.newContext()` when provided
- Format: `{ server: string, username?: string, password?: string }`

**Implementation:**
```typescript
if (options.proxy) {
  contextOptions.proxy = {
    server: options.proxy.server,
    ...(options.proxy.username && { username: options.proxy.username }),
    ...(options.proxy.password && { password: options.proxy.password }),
  };
}
```

#### 3.3 Update `JobProcessorService.executeJob()`

**File:** `src/modules/jobs/services/job-processor.service.ts`

- Extract proxy from job entity
- Pass proxy config to `contextManager.createContext()`
- Handle proxy-related errors appropriately

**Implementation:**
```typescript
const contextOptions: CreateContextOptions = {
  viewport: {
    width: 1920,
    height: 1080,
  },
};

if (job.proxyServer) {
  contextOptions.proxy = {
    server: job.proxyServer,
    ...(job.proxyUsername && { username: job.proxyUsername }),
    ...(job.proxyPassword && { password: job.proxyPassword }),
  };
}

const context = await this.contextManager.createContext(browser, contextOptions);
```

### Phase 4: Error Handling and Logging

#### 4.1 Add Proxy-Specific Error Handling

**File:** `src/modules/jobs/services/job-processor.service.ts`

Update `categorizeError()` and `isRetryableError()` methods:
- Detect proxy connection failures (e.g., `net::ERR_PROXY_CONNECTION_FAILED`)
- Categorize as retryable or non-retryable
- Consider proxy authentication failures as non-retryable

**Error Categories:**
- `ProxyConnectionError` - Retryable (network issues)
- `ProxyAuthenticationError` - Non-retryable (invalid credentials)
- `ProxyTimeoutError` - Retryable

#### 4.2 Update Job Logging

**File:** `src/modules/jobs/services/job-log.service.ts`

- Log when proxy is being used (without exposing credentials)
- Mask sensitive proxy credentials in logs
- Include proxy server (without auth) in debug logs

**Log Format:**
```
Using proxy: http://proxy.example.com:8080 (username: ***)
```

### Phase 5: Testing

#### 5.1 Unit Tests

**Files:**
- `src/modules/jobs/dto/proxy-config.dto.spec.ts`
- `src/modules/jobs/services/jobs.service.spec.ts`
- `src/modules/browsers/services/browser-context-manager.service.spec.ts`

**Test Cases:**
- Test proxy configuration parsing from DTO
- Test context creation with/without proxy
- Test validation logic (required fields, URL format)
- Test proxy authentication handling

#### 5.2 Integration Tests

**File:** `test/jobs.e2e-spec.ts`

**Test Cases:**
- Test job creation with proxy configuration
- Test proxy authentication (if test proxy available)
- Test proxy connection failures
- Test jobs without proxy (backward compatibility)
- Test proxy with different browser types

## Implementation Details

### Proxy Format in Playwright

Playwright expects the following format:
```typescript
{
  server: 'http://proxy.example.com:8080',  // Required
  username?: 'user',                         // Optional
  password?: 'pass'                          // Optional
}
```

### Storage Format

Store as separate columns in the database:
- `proxy_server`: Full proxy URL (e.g., `http://proxy.example.com:8080`)
- `proxy_username`: Username if authentication required
- `proxy_password`: Password if authentication required

### API Request Format

**Example Request:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [...],
  "proxy": {
    "server": "http://proxy.example.com:8080",
    "username": "user",
    "password": "pass"
  }
}
```

**Example Response (masked):**
```json
{
  "id": "...",
  "status": "pending",
  "proxy": {
    "server": "http://proxy.example.com:8080",
    "username": "user",
    "password": "***"
  }
}
```

## Security Considerations

### 1. Password Storage
- **Consideration:** Store `proxy_password` encrypted at rest
- **Recommendation:** Use TypeORM's `@Column({ type: 'varchar', transformer: ... })` with encryption transformer
- **Alternative:** Use environment variable references (e.g., `$PROXY_PASSWORD_1`) for common proxies

### 2. Logging
- **Never log full proxy credentials**
- Mask passwords in all logs: `password: ***`
- Include proxy server URL in debug logs (without auth)

### 3. Validation
- Validate proxy server URL format
- Ensure protocol is specified (http:// or https://)
- Validate port number if included in URL

### 4. API Exposure
- Mask passwords in API responses
- Consider separate endpoint for proxy management if needed
- Rate limit proxy-related requests to prevent abuse

## Benefits of This Approach

✅ **No Changes to Browser Pool:** Browsers remain proxy-agnostic  
✅ **Per-Job Proxy Support:** Each job can use its own proxy  
✅ **Backward Compatible:** Existing jobs without proxy continue to work  
✅ **Flexible:** Supports both authenticated and non-authenticated proxies  
✅ **Efficient:** No need to launch new browsers for proxy support  

## Migration Strategy

1. **Deploy database migration** first (adds nullable columns)
2. **Deploy code changes** (backward compatible)
3. **Test with existing jobs** (should work without proxy)
4. **Gradually enable proxy** for new jobs as needed

## Future Enhancements

- **Proxy Pool Management:** Manage a pool of proxies for load balancing
- **Proxy Health Checks:** Monitor proxy availability and automatically retry with different proxies
- **Proxy Rotation:** Rotate proxies for jobs to avoid rate limiting
- **Proxy Metrics:** Track proxy usage, success rates, and performance

## References

- [Playwright Network Documentation](https://playwright.dev/docs/network)
- [Playwright Proxy Configuration](https://playwright.dev/docs/network#http-proxy)
- Current Architecture: `docs/tech/02-system-design.md`
- Browser Pool Implementation: `src/modules/browsers/services/browser-pool.service.ts`

