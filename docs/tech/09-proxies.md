# Proxy Configuration

## Overview

The Browsers API supports proxy configuration at two levels:

1. **Default Proxy** - Applied to all browsers at launch time via `DEFAULT_PROXY` environment variable
2. **Job-Level Proxy** - Applied per job via job entity fields (`proxyServer`, `proxyUsername`, `proxyPassword`)

Job-level proxy settings **override** the default proxy when present. If no job-level proxy is configured, the browser context inherits the default proxy from browser launch.

## Proxy Priority

```
Job-Level Proxy (if configured)
    ↓ (overrides)
Default Proxy (DEFAULT_PROXY env var)
    ↓ (fallback)
No Proxy
```

## Default Proxy Configuration

### Environment Variable

Set the `DEFAULT_PROXY` environment variable to apply a proxy to all browsers in the pool:

```bash
DEFAULT_PROXY=http://proxy.example.com:8080
```

### Supported Proxy Types

- **HTTP**: `http://proxy.example.com:8080`
- **HTTPS**: `https://proxy.example.com:8080`
- **SOCKS5**: `socks5://proxy.example.com:1080`

### Authentication

Proxy URLs can include authentication credentials:

```bash
# HTTP proxy with authentication
DEFAULT_PROXY=http://username:password@proxy.example.com:8080

# HTTPS proxy with authentication
DEFAULT_PROXY=https://user:pass@proxy.example.com:8080

# SOCKS5 proxy with authentication
DEFAULT_PROXY=socks5://user:pass@proxy.example.com:1080
```

### Docker Compose Configuration

Add to `docker-compose.yml`:

```yaml
services:
  api:
    environment:
      # ... other variables ...
      DEFAULT_PROXY: ${DEFAULT_PROXY:-}  # Optional: Default proxy for all browsers
```

Then set in your `.env` file or pass when starting:

```bash
DEFAULT_PROXY=socks5://tor_general:9050 docker compose up
```

### Validation

The `DEFAULT_PROXY` value is validated on startup:
- Must be a valid URL starting with `http://`, `https://`, or `socks5://`
- Empty string is allowed (no default proxy)
- Invalid URLs are logged as errors and ignored

## Job-Level Proxy Configuration

### Job Entity Fields

Jobs can specify proxy configuration via these fields:

- `proxyServer` (string) - Proxy server URL (required if using job-level proxy)
- `proxyUsername` (string, optional) - Proxy authentication username
- `proxyPassword` (string, optional) - Proxy authentication password

### API Request Example

```json
{
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [{"action": "screenshot"}],
  "proxyServer": "http://job-proxy.example.com:8080",
  "proxyUsername": "user",
  "proxyPassword": "pass"
}
```

### Behavior

- **If job has proxy configured**: The job-level proxy is used, overriding any default proxy
- **If job has no proxy**: The browser context inherits the default proxy (if `DEFAULT_PROXY` is set)
- **If neither is configured**: Browser runs without a proxy

## Implementation Details

### Browser Launch

Default proxy is applied when browsers are launched in the pool:

```typescript
// In BrowserPool.createBrowser()
if (this.defaultProxy) {
  launchOptions.proxy = {
    server: this.defaultProxy.server,
    ...(this.defaultProxy.username && { username: this.defaultProxy.username }),
    ...(this.defaultProxy.password && { password: this.defaultProxy.password }),
  };
}
```

### Context Creation

Job-level proxy is applied when creating browser contexts:

```typescript
// In JobProcessorService.executeJob()
if (job.proxyServer) {
  contextOptions.proxy = {
    server: job.proxyServer,
    ...(job.proxyUsername && { username: job.proxyUsername }),
    ...(job.proxyPassword && { password: job.proxyPassword }),
  };
}
```

### Playwright Proxy Behavior

Playwright supports proxy at two levels:
1. **Browser-level proxy** - Set at launch, applies to all contexts
2. **Context-level proxy** - Set when creating context, overrides browser-level proxy

Our implementation:
- Default proxy is set at **browser launch** (browser-level)
- Job-level proxy is set at **context creation** (context-level)
- Context-level proxy overrides browser-level proxy (Playwright behavior)

## Logging

### Startup Logging

When `DEFAULT_PROXY` is configured, the service logs on startup:

```
[BrowserPoolService] BrowserPoolService initialized
[BrowserPoolService] Default proxy enabled: http://***:***@proxy.example.com:8080
```

Credentials are masked in logs for security.

### Job Execution Logging

When a job uses a proxy, it's logged:

```
[JobProcessorService] Using job-level proxy: http://job-proxy.example.com:8080 (username: ***)
```

Or if using default proxy:

```
[BrowserPoolService] Launching chromium browser with default proxy: http://***:***@proxy.example.com:8080
```

## Security Considerations

### Credential Masking

- Proxy URLs with credentials are automatically masked in logs
- Format: `http://***:***@proxy.example.com:8080`
- Original credentials are never logged

### Environment Variables

- Store sensitive proxy credentials in environment variables, not in code
- Use `.env` file for local development (not committed to git)
- Use secure secret management in production

## Examples

### Example 1: Default Proxy Only

```bash
# Set default proxy
export DEFAULT_PROXY=socks5://tor_general:9050

# Start API
docker compose up

# All jobs will use the Tor proxy
```

### Example 2: Job-Level Override

```bash
# Set default proxy
export DEFAULT_PROXY=http://default-proxy.example.com:8080

# Create job with different proxy
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://example.com",
    "actions": [{"action": "screenshot"}],
    "proxyServer": "http://job-proxy.example.com:3128"
  }'

# This job uses job-proxy.example.com, not default-proxy.example.com
```

### Example 3: No Proxy

```bash
# No DEFAULT_PROXY set
# Job without proxyServer

# Browser runs without proxy
```

### Example 4: Authenticated Proxy

```bash
# Default proxy with authentication
export DEFAULT_PROXY=http://user:pass@proxy.example.com:8080

# Or job-level authenticated proxy
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://example.com",
    "actions": [{"action": "screenshot"}],
    "proxyServer": "http://proxy.example.com:8080",
    "proxyUsername": "myuser",
    "proxyPassword": "mypass"
  }'
```

## Troubleshooting

### Proxy Not Working

1. **Check logs** for proxy configuration:
   ```bash
   docker compose logs api | grep -i proxy
   ```

2. **Verify proxy URL format**:
   - Must start with `http://`, `https://`, or `socks5://`
   - Must include port number
   - Authentication credentials must be URL-encoded if special characters present

3. **Test proxy connectivity**:
   ```bash
   curl -x http://proxy.example.com:8080 https://httpbin.org/ip
   ```

### Proxy Override Not Working

- Ensure job has `proxyServer` field set
- Check job logs to see which proxy is being used
- Verify context-level proxy is overriding browser-level proxy (Playwright behavior)

### Authentication Failures

- Verify credentials are correct
- Check if credentials need URL encoding
- Ensure proxy supports the authentication method being used

## Related Documentation

- [Browser Pool Architecture](./02-system-design.md#browser-pool)
- [Job Processing](./06-job-processing.md)
- [API Reference](./05-api-reference.md)

