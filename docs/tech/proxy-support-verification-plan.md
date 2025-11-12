# Proxy Support Verification Plan

This document outlines the steps to build, run, and verify the proxy support implementation using Docker with the Tor proxy available at `socks5://tor_general:9050`.

## Prerequisites

- Docker and Docker Compose installed
- Access to the `sg-network` Docker network (where Tor proxy is running)
- Tor proxy container running at `tor_general:9050` on the `sg-network`
- API key for authentication (or create one during setup)

## Step-by-Step Verification Plan

### Phase 1: Build and Prepare

#### 1.1 Build Docker Image

```bash
# Option 1: Using the helper script
./scripts/docker-dev.sh build

# Option 2: Using docker-compose directly
docker-compose build api

# Option 3: Using docker build directly
docker build -t browsers-api:latest .
```

**Expected Output:**
- Image builds successfully
- No build errors
- Final image tagged as `browsers-api:latest`

**Verification:**
```bash
docker images | grep browsers-api
```

#### 1.2 Verify Network Connectivity

Ensure the API container can reach the Tor proxy:

```bash
# Check if sg-network exists
docker network ls | grep sg-network

# If sg-network doesn't exist, create it (if you have permissions)
# docker network create sg-network
```

**Note:** The `docker-compose.yml` already includes `sg-network` as an external network, so it should be available.

### Phase 2: Database Setup

#### 2.1 Start PostgreSQL (if not already running)

```bash
# Start only PostgreSQL
docker-compose up -d postgres

# Wait for PostgreSQL to be healthy
docker-compose ps postgres
```

**Verification:**
```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U automation_user -d browser_automation
```

#### 2.2 Run Database Migrations

This will apply the new proxy support migration:

```bash
# Option 1: Using the helper script
./scripts/docker-dev.sh migrate

# Option 2: Using docker-compose directly
docker-compose run --rm api npm run migration:run
```

**Expected Output:**
```
query: SELECT * FROM "information_schema"."migrations" ORDER BY "id" DESC
query: SELECT * FROM "information_schema"."migrations" ORDER BY "id" DESC
query: ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS proxy_server VARCHAR(500)
query: ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS proxy_username VARCHAR(255)
query: ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS proxy_password VARCHAR(255)
query: CREATE INDEX IF NOT EXISTS idx_automation_jobs_proxy_server ON automation_jobs(proxy_server) WHERE proxy_server IS NOT NULL
Migration AddProxySupportToJobs1729200000000 has been executed successfully.
```

**Verification:**
```bash
# Connect to database and verify columns exist
docker-compose exec postgres psql -U automation_user -d browser_automation -c "\d automation_jobs"

# Should show:
# proxy_server     | character varying(500) | 
# proxy_username   | character varying(255) | 
# proxy_password   | character varying(255) |
```

#### 2.3 Run Database Seeds (if needed)

```bash
# Option 1: Using the helper script
./scripts/docker-dev.sh seed

# Option 2: Using docker-compose directly
docker-compose run --rm api npm run seed
```

### Phase 3: Start the Application

#### 3.1 Start Full Stack

```bash
# Option 1: Using the helper script
./scripts/docker-dev.sh start

# Option 2: Using docker-compose directly
docker-compose up -d
```

**Verification:**
```bash
# Check container status
docker-compose ps

# Check API health
curl http://localhost:3333/api/v1/health

# View logs
docker-compose logs -f api
```

**Expected Output:**
- All containers are running
- Health endpoint returns 200 OK
- No errors in logs related to proxy configuration

### Phase 4: Create Test API Key

#### 4.1 Create API Key for Testing

You'll need an API key to create jobs. If you don't have one, create it via the database:

```bash
# Connect to database
docker-compose exec postgres psql -U automation_user -d browser_automation

# Create a test API key
INSERT INTO api_keys (key, client_id, name, status, rate_limit, is_active)
VALUES (
  'test-proxy-key-12345',
  'test-client',
  'Test Proxy Key',
  'active',
  1000,
  true
);

# Exit
\q
```

**Alternative:** If you have an admin endpoint or seed script that creates API keys, use that instead.

### Phase 5: Verify Proxy Support

#### 5.1 Test Job Creation Without Proxy (Baseline)

First, verify that jobs without proxy still work:

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "timeoutMs": 30000
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "status": "pending",
    "createdAt": "2025-01-11T..."
  }
}
```

**Verification:**
```bash
# Check job status
JOB_ID="<job-id-from-response>"
curl http://localhost:3333/api/v1/jobs/$JOB_ID \
  -H "X-API-Key: test-proxy-key-12345"

# Wait for job to complete, then check result
# The IP address should be your direct IP (not Tor exit node)
```

#### 5.2 Test Job Creation With Proxy (SOCKS5)

Create a job with the Tor proxy:

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "timeoutMs": 60000,
    "proxy": {
      "server": "socks5://tor_general:9050"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "status": "pending",
    "createdAt": "2025-01-11T..."
  }
}
```

**Verification Steps:**

1. **Check Database:**
```bash
docker-compose exec postgres psql -U automation_user -d browser_automation -c \
  "SELECT id, proxy_server, proxy_username, status FROM automation_jobs WHERE proxy_server IS NOT NULL ORDER BY created_at DESC LIMIT 1;"
```

**Expected Output:**
```
id                                   | proxy_server              | proxy_username | status
-------------------------------------+---------------------------+----------------+--------
<uuid>                               | socks5://tor_general:9050 |                | pending
```

2. **Monitor Job Processing:**
```bash
# Watch logs for proxy usage
docker-compose logs -f api | grep -i proxy

# Should see logs like:
# [INFO] Using proxy: socks5://tor_general:9050 (username: none)
# [DEBUG] Creating context with proxy: socks5://tor_general:9050 (username: none)
```

3. **Check Job Status:**
```bash
JOB_ID="<job-id-from-response>"
curl http://localhost:3333/api/v1/jobs/$JOB_ID \
  -H "X-API-Key: test-proxy-key-12345"
```

4. **Verify Proxy Was Used:**
```bash
# Get job result (after completion)
curl http://localhost:3333/api/v1/jobs/$JOB_ID \
  -H "X-API-Key: test-proxy-key-12345" | jq '.result'

# The IP address in the result should be a Tor exit node IP
# (different from your direct IP)
```

#### 5.3 Test Proxy with Authentication (Optional)

If your Tor proxy requires authentication (unlikely for SOCKS5, but test if needed):

```bash
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "timeoutMs": 60000,
    "proxy": {
      "server": "socks5://tor_general:9050",
      "username": "user",
      "password": "pass"
    }
  }'
```

#### 5.4 Test Error Handling

Test proxy connection failure handling:

```bash
# Test with invalid proxy server
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [
      {
        "action": "screenshot",
        "fullPage": true,
        "type": "png"
      }
    ],
    "timeoutMs": 10000,
    "proxy": {
      "server": "socks5://invalid-proxy:9999"
    }
  }'
```

**Expected Behavior:**
- Job is created successfully
- Job status changes to `processing`
- Job eventually fails with `ProxyConnectionError` or `NetworkError`
- Error is logged appropriately
- Job status becomes `failed` after retries

### Phase 6: Verify Logging and Monitoring

#### 6.1 Check Proxy Logging

```bash
# View recent logs
docker-compose logs api | grep -i proxy

# Should see:
# - Proxy configuration being used
# - Proxy connection attempts
# - Any proxy-related errors (with masked credentials)
```

#### 6.2 Check Job Logs

```bash
# Get job logs from database
docker-compose exec postgres psql -U automation_user -d browser_automation -c \
  "SELECT level, message, metadata FROM job_logs WHERE job_id = '<job-id>' ORDER BY created_at;"
```

**Expected Logs:**
- `[INFO] Using proxy: socks5://tor_general:9050 (username: none)`
- `[INFO] Job processing started`
- `[INFO] Navigated to target URL: ...`
- `[INFO] Job processing completed successfully`

### Phase 7: Integration Test Verification

#### 7.1 Run E2E Tests

```bash
# Run the integration tests (if database is set up for testing)
docker-compose run --rm api npm run test:e2e

# Or run specific proxy tests
docker-compose run --rm api npx jest test/jobs.e2e-spec.ts -t proxy
```

**Expected:** All proxy-related tests pass

### Phase 8: Performance and Reliability

#### 8.1 Test Multiple Concurrent Jobs with Proxy

```bash
# Create 5 jobs simultaneously with proxy
for i in {1..5}; do
  curl -X POST http://localhost:3333/api/v1/jobs \
    -H "Content-Type: application/json" \
    -H "X-API-Key: test-proxy-key-12345" \
    -d "{
      \"browserTypeId\": 1,
      \"targetUrl\": \"https://httpbin.org/ip\",
      \"actions\": [{\"action\": \"screenshot\", \"fullPage\": true, \"type\": \"png\"}],
      \"proxy\": {\"server\": \"socks5://tor_general:9050\"}
    }" &
done
wait

# Check all jobs completed successfully
curl http://localhost:3333/api/v1/jobs?status=completed \
  -H "X-API-Key: test-proxy-key-12345"
```

#### 8.2 Test Proxy Rotation (if applicable)

If you have multiple proxy endpoints, test that different jobs can use different proxies:

```bash
# Job 1: Use Tor proxy
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [{"action": "screenshot", "fullPage": true, "type": "png"}],
    "proxy": {"server": "socks5://tor_general:9050"}
  }'

# Job 2: No proxy
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-proxy-key-12345" \
  -d '{
    "browserTypeId": 1,
    "targetUrl": "https://httpbin.org/ip",
    "actions": [{"action": "screenshot", "fullPage": true, "type": "png"}]
  }'
```

## Verification Checklist

- [ ] Docker image builds successfully
- [ ] Database migration runs without errors
- [ ] Proxy columns exist in `automation_jobs` table
- [ ] Application starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] Jobs without proxy work correctly
- [ ] Jobs with proxy are created successfully
- [ ] Proxy configuration is saved to database
- [ ] Proxy is used during job execution (verified via IP check)
- [ ] Proxy usage is logged correctly (credentials masked)
- [ ] Error handling works for invalid proxies
- [ ] Multiple concurrent jobs with proxy work correctly
- [ ] Integration tests pass

## Troubleshooting

### Issue: Migration Fails

**Symptoms:** Migration errors when running `npm run migration:run`

**Solutions:**
```bash
# Check if migration was already applied
docker-compose exec postgres psql -U automation_user -d browser_automation -c \
  "SELECT * FROM migrations WHERE name LIKE '%Proxy%';"

# If migration exists but columns don't, manually add them:
docker-compose exec postgres psql -U automation_user -d browser_automation -c \
  "ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS proxy_server VARCHAR(500);"
```

### Issue: Cannot Connect to Tor Proxy

**Symptoms:** Jobs with proxy fail with connection errors

**Solutions:**
```bash
# Verify Tor proxy is accessible from API container
docker-compose exec api ping -c 1 tor_general

# Check if Tor proxy is on the same network
docker network inspect sg-network | grep tor_general

# Test proxy connection manually
docker-compose exec api curl -x socks5://tor_general:9050 https://httpbin.org/ip
```

### Issue: Proxy Not Being Used

**Symptoms:** Job completes but IP address is not from Tor

**Solutions:**
1. Check job logs for proxy usage messages
2. Verify proxy configuration in database
3. Check browser context creation logs
4. Ensure Playwright supports SOCKS5 (it does, but verify version)

### Issue: Jobs Hang or Timeout

**Symptoms:** Jobs with proxy never complete

**Solutions:**
1. Increase timeout: `"timeoutMs": 60000`
2. Check Tor proxy is responsive
3. Verify network connectivity
4. Check for firewall rules blocking connections

## Success Criteria

✅ **Proxy Support is Working When:**
1. Jobs can be created with proxy configuration
2. Proxy settings are persisted in database
3. Browser contexts are created with proxy configuration
4. Network traffic routes through the proxy (verified via IP check)
5. Logs show proxy usage (with masked credentials)
6. Error handling works for proxy failures
7. Multiple jobs can use proxy concurrently

## Next Steps After Verification

1. **Documentation:** Update API documentation with proxy examples
2. **Monitoring:** Set up alerts for proxy connection failures
3. **Performance:** Monitor proxy performance vs direct connections
4. **Security:** Review proxy password storage (consider encryption)
5. **Testing:** Add proxy tests to CI/CD pipeline

## Quick Reference Commands

```bash
# Build
./scripts/docker-dev.sh build

# Start
./scripts/docker-dev.sh start

# Migrate
./scripts/docker-dev.sh migrate

# Logs
./scripts/docker-dev.sh logs

# Stop
./scripts/docker-dev.sh stop

# Test with proxy
curl -X POST http://localhost:3333/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"browserTypeId": 1, "targetUrl": "https://httpbin.org/ip", "actions": [{"action": "screenshot"}], "proxy": {"server": "socks5://tor_general:9050"}}'
```

