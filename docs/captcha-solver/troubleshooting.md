# Captcha Solver Module -- Troubleshooting Guide

This guide covers error diagnostics, circuit breaker behavior, provider-specific tips, performance tuning, and solutions to common issues encountered in the captcha-solver module.

---

## Table of Contents

1. [Error Codes Reference](#1-error-codes-reference)
2. [Circuit Breaker Debugging](#2-circuit-breaker-debugging)
3. [Provider-Specific Tips](#3-provider-specific-tips)
4. [Performance Tuning](#4-performance-tuning)
5. [Common Issues and Solutions](#5-common-issues-and-solutions)

---

## 1. Error Codes Reference

All captcha-solver exceptions extend `CaptchaSolverException`, which provides structured error information with machine-readable codes, categories, and a `isRecoverable` flag indicating whether the operation can be retried.

Every exception includes:
- **`code`** -- Machine-readable error code (e.g., `SOLVER_UNAVAILABLE`)
- **`category`** -- One of `AVAILABILITY`, `VALIDATION`, `NETWORK`, `PROVIDER`, `INTERNAL`
- **`isRecoverable`** -- `true` if the system can retry, `false` if the request is fundamentally invalid
- **`context`** -- Additional metadata (provider name, request details, solver type, etc.)
- **`errorContext`** (optional) -- Correlation ID, timing data, and attempt number for distributed tracing

### 1.1 SolverUnavailableException

| Property | Value |
|---|---|
| **Code** | `SOLVER_UNAVAILABLE` |
| **Category** | `AVAILABILITY` |
| **Recoverable** | Yes |

**When it occurs:**
- No API key is configured for a requested provider.
- All registered providers have been exhausted (all keys are unhealthy).
- The circuit breaker for a solver is in the `OPEN` state, blocking requests.
- No providers are registered at all during startup.

**Context fields:** `solverType`, `reason` (e.g., `api_key_not_configured`, `circuit_breaker_open`, `not_configured`, `rate_limited`, `no_providers_configured`, `no_providers_available`)

**How to fix:**
1. Verify that at least one provider API key is set in your environment:
   ```bash
   # Check which keys are configured
   echo $TWOCAPTCHA_API_KEY
   echo $ANTICAPTCHA_API_KEY
   echo $CAPMONSTER_API_KEY
   ```
2. If the `reason` is `circuit_breaker_open`, see [Section 2: Circuit Breaker Debugging](#2-circuit-breaker-debugging).
3. If the `reason` is `no_providers_configured`, add at least one API key -- see [Section 5.1](#51-no-captcha-solver-providers-are-available).
4. If all keys show as `UNHEALTHY`, check your provider account balance and key validity.

---

### 1.2 ProviderException

| Property | Value |
|---|---|
| **Code** | `PROVIDER_ERROR` |
| **Category** | `PROVIDER` |
| **Recoverable** | Yes |

**When it occurs:**
- A provider API returns a non-success response (e.g., `errorId !== 0` for AntiCaptcha/CapMonster, `status !== 1` for 2Captcha).
- Task creation fails at the provider.
- Task polling returns an unexpected status.
- The provider cannot extract a token from the solution response.
- All providers fail in the fallback chain.

**Context fields:** `providerName`, `apiResponse`, `errorCode`, `errorDescription`, `captchaType`, `taskId`

**How to fix:**
1. Inspect the `apiResponse` field -- it contains the raw provider response.
2. Check the `errorCode` for provider-specific error codes (see [Section 3](#3-provider-specific-tips)).
3. Common causes: invalid API key, insufficient balance, unsupported captcha type, rate limiting.
4. If the message says "All providers failed to solve captcha", check `attemptedProviders` in the context to see which providers were tried.

---

### 1.3 ValidationException

| Property | Value |
|---|---|
| **Code** | `VALIDATION_ERROR` |
| **Category** | `VALIDATION` |
| **Recoverable** | No |

**When it occurs:**
- An unsupported captcha type is passed (anything other than `recaptcha`, `hcaptcha`, `datadome`, `funcaptcha`, `akamai`).
- Fallback is disabled for the requested challenge type.
- Required parameters (e.g., `sitekey`, `url`) are missing or invalid.

**Context fields:** `validationErrors` (array of `{ field, message, code }`)

**How to fix:**
1. Check `validationErrors` for the specific field that failed.
2. Common validation error codes:
   - `UNSUPPORTED_TYPE` -- Use a supported captcha type: `recaptcha`, `hcaptcha`, `datadome`, `funcaptcha`, or `akamai`.
   - `FALLBACK_DISABLED` -- Enable fallback for the challenge type in configuration.
3. This exception is **not recoverable** -- retrying with the same parameters will produce the same error. Fix the input.

---

### 1.4 NetworkException

| Property | Value |
|---|---|
| **Code** | `NETWORK_ERROR` |
| **Category** | `NETWORK` |
| **Recoverable** | Yes |

**When it occurs:**
- HTTP request to a provider times out (`AbortError` or `ECONNABORTED`).
- DNS resolution fails (`ENOTFOUND`).
- Connection refused (`ECONNREFUSED`).
- Connection timeout (`ETIMEDOUT`).
- Provider returns HTTP 5xx (server error).
- Polling for a task result exceeds maximum attempts (120 attempts at 2-second intervals = 4 minutes).

**Context fields:** `originalError` (with `name`, `message`, `stack`), `url`, `method`, `timeoutSeconds`, `provider`, `taskId`, `maxAttempts`, `pollInterval`

**How to fix:**
1. Check network connectivity to the provider:
   - 2Captcha: `https://2captcha.com`
   - AntiCaptcha: `https://api.anti-captcha.com`
   - CapMonster: `https://api.capmonster.cloud`
2. If timeouts are frequent, increase `CAPTCHA_PROVIDER_TIMEOUT_SECONDS` (default: 60).
3. If running behind a proxy or firewall, ensure outbound HTTPS is allowed.
4. If the error is a polling timeout, the captcha may be unusually complex -- consider increasing the solver timeout or switching providers.

---

### 1.5 InternalException

| Property | Value |
|---|---|
| **Code** | `INTERNAL_ERROR` |
| **Category** | `INTERNAL` |
| **Recoverable** | No |

**When it occurs:**
- An unexpected error occurs in internal logic (bug or system failure).
- An unhandled exception propagates up the stack.

**Context fields:** `originalError` (with `name`, `message`, `stack`)

**How to fix:**
1. This typically indicates a bug. Check the stack trace.
2. Collect the `correlationId` from the `errorContext` (if present) for tracing.
3. Review logs for the full error chain.
4. Report the issue with the stack trace and correlation ID.

---

### Error Category Quick Reference

| Category | Code | Recoverable | Retry? |
|---|---|---|---|
| `AVAILABILITY` | `SOLVER_UNAVAILABLE` | Yes | Try a different solver or wait for circuit breaker reset |
| `PROVIDER` | `PROVIDER_ERROR` | Yes | Retry with backoff, or try another provider |
| `VALIDATION` | `VALIDATION_ERROR` | No | Fix the input parameters |
| `NETWORK` | `NETWORK_ERROR` | Yes | Retry with backoff |
| `INTERNAL` | `INTERNAL_ERROR` | No | Investigate and fix the bug |

---

## 2. Circuit Breaker Debugging

The `SolverCircuitBreakerService` manages per-solver circuit breakers that temporarily disable failing solvers to prevent cascading failures.

### 2.1 How Circuit Breaker States Work

```
                     success
    +-------+   +--------------+   +-----------+
    |       |   |              |   |           |
    | CLOSED| ---> failure x N ---> |   OPEN    |
    |       |   | (threshold)  |   |           |
    +---^---+   +--------------+   +-----+-----+
        |                                |
        |          timeout elapsed       |
        |                                v
        |                          +-----------+
        +---- success ------------ | HALF_OPEN |
                                   +-----------+
                                        |
                                   failure (any)
                                        |
                                        v
                                   +-----------+
                                   |   OPEN    |
                                   +-----------+
```

**States:**

| State | Behavior |
|---|---|
| **CLOSED** | Normal operation. Requests are allowed. Failures are counted. |
| **OPEN** | All requests are blocked. The circuit waits for the timeout period before transitioning. |
| **HALF_OPEN** | One test request is allowed. Success closes the circuit. Any failure immediately re-opens it. |

### 2.2 When Does a Circuit Breaker Trip?

The circuit transitions from `CLOSED` to `OPEN` when:
- The solver accumulates **N consecutive failures** where N equals `failureThreshold` (default: **3**).

The circuit transitions from `OPEN` to `HALF_OPEN` when:
- The `timeoutPeriod` (default: **60,000 ms / 1 minute**) has elapsed since the circuit opened.

The circuit transitions from `HALF_OPEN` to `CLOSED` when:
- A single request succeeds in the `HALF_OPEN` state.

The circuit transitions from `HALF_OPEN` back to `OPEN` when:
- Any request fails in the `HALF_OPEN` state (the test request failed).

### 2.3 How to Check Circuit Breaker State

The `SolverRegistry` exposes methods to inspect circuit breaker states:

- **`getCircuitBreakerStates()`** -- Returns all solver states with details:
  ```json
  {
    "2captcha": {
      "state": "OPEN",
      "isAvailable": false,
      "details": {
        "state": "OPEN",
        "consecutiveFailures": 3,
        "lastFailureTime": 1706000000000,
        "nextAttemptTime": 1706000060000
      }
    },
    "anticaptcha": {
      "state": "CLOSED",
      "isAvailable": true,
      "details": null
    }
  }
  ```

- **`getStateDetails(solverType)`** on `SolverCircuitBreakerService` -- Returns detailed state for a specific solver including `consecutiveFailures`, `lastFailureTime`, and `nextAttemptTime`.

- **`getAllStates()`** on `SolverCircuitBreakerService` -- Returns the raw `Map<string, SolverState>` for all tracked solvers.

### 2.4 How to Reset a Tripped Circuit Breaker

**Programmatic reset:**

Call `SolverCircuitBreakerService.reset(solverType)` to manually force a solver's circuit back to `CLOSED`:

```typescript
// Inject the service
constructor(private readonly circuitBreaker: SolverCircuitBreakerService) {}

// Reset a specific solver
this.circuitBreaker.reset('2captcha');
```

This immediately:
- Sets the state to `CLOSED`
- Resets `consecutiveFailures` to 0
- Clears `lastFailureTime` and `nextAttemptTime`

**Automatic recovery:**

If you do nothing, the circuit will automatically transition:
1. After the timeout period (default 60s), it moves to `HALF_OPEN`.
2. If the next request succeeds, it returns to `CLOSED`.

### 2.5 Common Scenarios That Trigger Circuit Breaker Opens

| Scenario | Typical Cause | Resolution |
|---|---|---|
| Provider API key expired or revoked | 3 consecutive auth failures | Replace the API key and reset the circuit breaker |
| Provider service outage | 3 consecutive 5xx or timeout errors | Wait for provider recovery (circuit auto-recovers after timeout) |
| Insufficient balance | 3 consecutive "insufficient funds" errors | Top up your provider account balance |
| Network issues (firewall, DNS) | 3 consecutive connection failures | Fix network connectivity |
| Rate limiting by provider | 3 consecutive rate limit responses | Reduce request rate or upgrade your plan |

### 2.6 Configuration

```bash
# Number of consecutive failures before opening the circuit (default: 3)
CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3

# Time in milliseconds before attempting recovery (default: 60000 = 1 minute)
CAPTCHA_CIRCUIT_BREAKER_TIMEOUT_PERIOD=60000
```

---

## 3. Provider-Specific Tips

### 3.1 2Captcha

**Base URL:** `https://2captcha.com`

**API flow:** Submit task via `POST /in.php` -> Poll result via `GET /res.php`

**Environment variable:**
```bash
TWOCAPTCHA_API_KEY=your_api_key_here
# Alternative: 2CAPTCHA_API_KEY (auto-converted internally)
```

**Supported captcha types and methods:**

| Captcha Type | 2Captcha Method |
|---|---|
| `recaptcha` (v2/v3) | `userrecaptcha` |
| `hcaptcha` | `hcaptcha` |
| `datadome` | `datadome` |
| `funcaptcha` | `funcaptcha` |

**Common error responses:**

| Response | Meaning | Fix |
|---|---|---|
| `ERROR_WRONG_USER_KEY` | Invalid API key format | Check your API key |
| `ERROR_KEY_DOES_NOT_EXIST` | API key not found | Verify key in 2Captcha dashboard |
| `ERROR_ZERO_BALANCE` | Insufficient balance | Top up your account |
| `ERROR_NO_SLOT_AVAILABLE` | Server busy | Retry after a short delay |
| `ERROR_CAPTCHA_UNSOLVABLE` | Workers could not solve the captcha | Try again (some captchas are harder) |
| `CAPCHA_NOT_READY` | Task still processing (not an error) | Continue polling -- this is normal |
| `ERROR_TOO_MUCH_REQUESTS` | Rate limit exceeded | Reduce request frequency |

**Polling behavior:**
- Poll interval: **2 seconds**
- Max polling attempts: **120** (= up to 4 minutes total)
- If `CAPCHA_NOT_READY` is returned, polling continues.
- If max attempts are exhausted, a `NetworkException` ("Timeout waiting for 2Captcha result") is thrown.

**Non-retryable errors (no automatic retry):**
- HTTP 401/403 responses (authentication failures)
- Messages containing "invalid", "missing", "required" (parameter errors)
- Messages containing "balance" or "funds" (insufficient balance)

---

### 3.2 AntiCaptcha

**Base URL:** `https://api.anti-captcha.com`

**API flow:** Create task via `POST /createTask` -> Poll via `POST /getTaskResult`

**Environment variable:**
```bash
ANTICAPTCHA_API_KEY=your_api_key_here
```

**Supported task types:**

| Captcha Type | AntiCaptcha Task Type |
|---|---|
| `recaptcha` v2 | `RecaptchaV2TaskProxyless` (or `RecaptchaV2Task` with proxy) |
| `recaptcha` v3 | `RecaptchaV3TaskProxyless` |
| `hcaptcha` | `HCaptchaTaskProxyless` (or `HCaptchaTask` with proxy) |
| `datadome` | `DataDomeSliderTask` |
| `funcaptcha` | `FunCaptchaTaskProxyless` (or `FunCaptchaTask` with proxy) |

**Error response structure:**
```json
{
  "errorId": 1,
  "errorCode": "ERROR_KEY_DOES_NOT_EXIST",
  "errorDescription": "Account authorization key not found in the system"
}
```

When `errorId !== 0`, a `ProviderException` is thrown with the `errorCode` and `errorDescription`.

**Common error codes:**

| Error Code | Meaning | Fix |
|---|---|---|
| `ERROR_KEY_DOES_NOT_EXIST` | Invalid API key | Verify your AntiCaptcha API key |
| `ERROR_ZERO_BALANCE` | No funds | Top up your account |
| `ERROR_NO_SUCH_METHOD` | Invalid method/task type | Check request payload structure |
| `ERROR_TOO_MUCH_REQUESTS` | Rate limit | Reduce request frequency |
| `ERROR_RECAPTCHA_TIMEOUT` | reCAPTCHA solving timed out | Retry the request |
| `ERROR_PROXY_CONNECT_REFUSED` | Proxy connection failed | Check proxy configuration |

**Task status values:**
- `processing` -- Task is still being solved (continue polling)
- `ready` -- Solution is available

**Solution extraction:** The provider extracts the token from the response in this order of priority:
1. `solution.gRecaptchaResponse` (for reCAPTCHA)
2. `solution.token` (for hCAPTCHA)
3. `solution.cookie` (for DataDome)

If none of these fields exist, a `ProviderException` ("Unable to extract token") is thrown.

**Polling behavior:** Identical to 2Captcha -- 2-second intervals, max 120 attempts.

---

### 3.3 CapMonster

**Base URL:** `https://api.capmonster.cloud`

**API compatibility:** CapMonster uses the **same API format as AntiCaptcha** but with a different base URL. The task types, request/response structures, and error codes are identical.

**Environment variable:**
```bash
CAPMONSTER_API_KEY=your_api_key_here
```

**Key differences from AntiCaptcha:**
- Different base URL (`api.capmonster.cloud` vs `api.anti-captcha.com`)
- Different pricing and rate limits
- Generally faster solving times for common captcha types
- Same task types and response format

All AntiCaptcha troubleshooting tips in Section 3.2 also apply to CapMonster.

---

### 3.4 API Key Configuration and Rotation

**Multiple keys per provider:** You can configure multiple API keys by separating them with commas:

```bash
TWOCAPTCHA_API_KEY=key1,key2,key3
ANTICAPTCHA_API_KEY=keyA,keyB
CAPMONSTER_API_KEY=keyX
```

**Key rotation behavior:**
- Keys are selected using a round-robin strategy with health awareness.
- Keys are sorted by health status: `HEALTHY` > `UNKNOWN` > `UNHEALTHY`.
- After a key is used, it is moved to the end of the rotation queue.
- If all keys are `UNHEALTHY`, the system still tries them (last resort).

**Key health tracking:**
- After 1 failure: `HEALTHY` -> `UNKNOWN`
- After 3 consecutive failures: -> `UNHEALTHY`
- On any success: -> `HEALTHY` (consecutive failures reset to 0)

**Database-managed keys:** API keys can also be stored in the database (table: `captcha_solver_api_keys`), allowing runtime key management without restarts. Database keys are loaded alongside environment variable keys.

---

## 4. Performance Tuning

### 4.1 Configuration Options Reference

All configuration is loaded from environment variables with sensible defaults.

#### Provider Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_SOLVER_PREFERRED_PROVIDER` | `2captcha` | Which provider to try first in the fallback chain |
| `CAPTCHA_SOLVER_TIMEOUT_SECONDS` | `60` | Overall timeout for a solve request (seconds) |
| `CAPTCHA_SOLVER_MAX_RETRIES` | `3` | Maximum retry attempts for failed solves |
| `CAPTCHA_SOLVER_ENABLE_AUTO_RETRY` | `true` | Whether to automatically retry on failure |
| `CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE` | `0.7` | Minimum confidence score for detection results |
| `CAPTCHA_PROVIDER_MAX_RETRIES` | `3` | Max retries for individual provider HTTP requests |
| `CAPTCHA_PROVIDER_TIMEOUT_SECONDS` | `60` | Timeout per HTTP request to a provider (seconds) |
| `CAPTCHA_PROVIDER_RATE_LIMIT_PER_MINUTE` | `60` | Rate limit for audio transcription requests |

#### Fallback Settings (per challenge type)

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_SOLVER_FALLBACK_RECAPTCHA` | `true` | Enable 3rd-party fallback for reCAPTCHA |
| `CAPTCHA_SOLVER_FALLBACK_HCAPTCHA` | `true` | Enable 3rd-party fallback for hCAPTCHA |
| `CAPTCHA_SOLVER_FALLBACK_DATADOME` | `true` | Enable 3rd-party fallback for DataDome |
| `CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA` | `true` | Enable 3rd-party fallback for FunCaptcha |

#### Circuit Breaker Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `3` | Consecutive failures before opening the circuit |
| `CAPTCHA_CIRCUIT_BREAKER_TIMEOUT_PERIOD` | `60000` | Milliseconds before attempting recovery (half-open) |

#### Cache Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_CACHE_TTL` | `300000` | Detection cache TTL in milliseconds (5 minutes) |

Note: The in-memory config cache in `CaptchaSolverService` uses a fixed 60-second TTL for database configuration values. This cache is automatically invalidated when configuration is updated via the `setConfig()` method.

#### Retry Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_RETRY_MAX_ATTEMPTS` | `3` | Maximum retry attempts |
| `CAPTCHA_RETRY_BACKOFF_MS` | `1000` | Initial backoff delay (ms) |
| `CAPTCHA_RETRY_MAX_BACKOFF_MS` | `10000` | Maximum backoff delay (ms) |

Retries use exponential backoff: `delay = min(initialBackoff * 2^(attempt-1), maxBackoff)`

Example progression with defaults: 1s -> 2s -> 4s (capped at 10s)

#### Timeout Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_TIMEOUT_SOLVE` | `30000` | Overall solve timeout (ms) |
| `CAPTCHA_TIMEOUT_DETECTION` | `5000` | Detection operation timeout (ms) |
| `CAPTCHA_TIMEOUT_WIDGET_INTERACTION` | `5000` | Widget interaction timeout (ms) |
| `CAPTCHA_TIMEOUT_AUDIO_TRANSCRIPTION` | `30000` | Audio transcription timeout (ms) |

#### Solver-Specific Timeouts (hard-coded defaults, not env-configurable)

| Solver | Timeout |
|---|---|
| reCAPTCHA v2 Checkbox | 30,000 ms |
| reCAPTCHA v2 Invisible | 10,000 ms |
| reCAPTCHA v2 Audio | 30,000 ms |
| reCAPTCHA v2 Image | 60,000 ms |
| reCAPTCHA v3 | 10,000 ms |
| hCAPTCHA Checkbox | 30,000 ms |
| hCAPTCHA Invisible | 10,000 ms |
| hCAPTCHA Audio | 30,000 ms |
| hCAPTCHA Accessibility | 30,000 ms |
| DataDome Sensor | 30,000 ms |
| DataDome Captcha | 60,000 ms |
| DataDome Slider | 30,000 ms |
| Akamai Level 2 | 5,000 ms |
| Akamai Level 3 | 10,000 ms |

#### Detection Settings

| Variable | Default | Description |
|---|---|---|
| `CAPTCHA_DETECTION_MIN_CONFIDENCE_THRESHOLD` | `0.5` | Minimum confidence for detection results |
| `CAPTCHA_DETECTION_MIN_STRONG_CONFIDENCE` | `0.7` | Minimum confidence for strong signal classification |

### 4.2 Provider Fallback Chain Optimization

The fallback chain tries providers in this order:
1. **Preferred provider** (set via `CAPTCHA_SOLVER_PREFERRED_PROVIDER`, default `2captcha`)
2. All other available providers in registration order

To optimize the fallback chain:

```bash
# Set fastest/most reliable provider as preferred
CAPTCHA_SOLVER_PREFERRED_PROVIDER=anticaptcha

# Disable fallback for types you only want native solvers to handle
CAPTCHA_SOLVER_FALLBACK_DATADOME=false
```

Within the native solver registry, solvers are selected by:
1. **Health status** -- `healthy` > `unknown` > `unhealthy` > `validating`
2. **Priority** -- Higher priority value = preferred (native solvers default to priority 100)
3. **Success rate** -- Higher historical success rate = preferred

### 4.3 Parallel Solver Configuration

Native solvers are registered with a `maxConcurrency` value:

| Solver | Max Concurrency |
|---|---|
| Turnstile Native | 10 |
| reCAPTCHA Native | 10 |
| hCAPTCHA Native | 10 |
| DataDome Native | 10 |
| Akamai Native | 10 |

Each native solver also has an estimated average response time that influences solver selection:

| Solver | Average Response Time |
|---|---|
| Turnstile Native | 5,000 ms |
| reCAPTCHA Native | 15,000 ms |
| hCAPTCHA Native | 15,000 ms |
| DataDome Native | 20,000 ms |
| Akamai Native | 5,000 ms |

### 4.4 Performance Monitoring

The `SolverPerformanceTracker` records per-attempt metrics (up to 1,000 entries by default) including duration, success/failure, and challenge type. Use `getAllStats()` to get aggregated statistics for all solvers, or `getStats(solverType)` for a specific solver.

---

## 5. Common Issues and Solutions

### 5.1 "No captcha solver providers are available"

**Error:** `SolverUnavailableException` with reason `no_providers_configured`

**Cause:** No API keys are configured for any provider (2Captcha, AntiCaptcha, or CapMonster).

**Solution:** Set at least one provider API key:

```bash
# .env -- minimum configuration
TWOCAPTCHA_API_KEY=your_2captcha_api_key

# Or use AntiCaptcha
ANTICAPTCHA_API_KEY=your_anticaptcha_api_key

# Or use CapMonster
CAPMONSTER_API_KEY=your_capmonster_api_key
```

**In development mode:** The application will start but the captcha solver module will be unavailable. A warning is logged:
```
Captcha Solver Service will be unavailable until API keys are configured
```

**In production mode (`NODE_ENV=production`):** The application will **fail to start** if no providers are available. This is intentional to prevent deployment without proper configuration.

---

### 5.2 "Fallback is disabled for X challenge type"

**Error:** `ValidationException` with code `FALLBACK_DISABLED`

**Cause:** The `fallbackEnabled` configuration for the requested challenge type is set to `false`.

**Solution:** Enable fallback for the specific challenge type:

```bash
# Enable fallback for all types (these are all true by default)
CAPTCHA_SOLVER_FALLBACK_RECAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_HCAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_DATADOME=true
CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA=true
```

Or update the configuration at runtime through the database config system (the value will be picked up after the 60-second config cache expires, or immediately if the `setConfig()` API is used).

---

### 5.3 Slow Solving Times

**Symptoms:** Captcha solves take much longer than expected (>60 seconds).

**Diagnostic steps:**

1. **Check circuit breaker states:** If the preferred provider's circuit is open, the system falls back to slower providers.
   ```
   Look for: "Circuit breaker for solver 'X' transitioned from CLOSED to OPEN"
   ```

2. **Check provider health:** Review the `SolverPerformanceTracker` stats for average duration per solver.

3. **Check polling behavior:** Both task submission and result polling take time. The polling interval is 2 seconds with up to 120 attempts per task.

**Solutions:**

- Set `CAPTCHA_SOLVER_PREFERRED_PROVIDER` to the fastest available provider.
- If a native solver is slow, check browser pool availability -- native solvers require browser instances.
- Reduce `CAPTCHA_PROVIDER_TIMEOUT_SECONDS` to fail faster on unresponsive providers (but not so low that legitimate solves are aborted).
- Consider using CapMonster for faster automated solving.

---

### 5.4 High Failure Rates

**Symptoms:** Many `ProviderException` errors, API key health degrading to `UNHEALTHY`.

**Diagnostic steps:**

1. **Check API key health status:** After 3 consecutive failures, a key is marked `UNHEALTHY`.
2. **Check provider dashboards:** Log into 2Captcha, AntiCaptcha, or CapMonster to check:
   - Account balance
   - API key validity
   - Request history for error patterns
3. **Check for rate limiting:** Look for `ERROR_TOO_MUCH_REQUESTS` in error responses.

**Solutions:**

- **Rotate keys:** Configure multiple keys per provider to distribute load:
  ```bash
  TWOCAPTCHA_API_KEY=key1,key2,key3
  ```
- **Top up balance:** If `ERROR_ZERO_BALANCE` appears in logs, add funds.
- **Adjust circuit breaker:** If transient failures are causing premature circuit opens, increase the threshold:
  ```bash
  CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
  ```
- **Reduce retry aggressiveness:** If retries are making rate limits worse:
  ```bash
  CAPTCHA_RETRY_MAX_ATTEMPTS=2
  CAPTCHA_RETRY_BACKOFF_MS=2000
  ```

---

### 5.5 Memory and Resource Issues

**Symptoms:** High memory usage, slow performance, resource exhaustion.

**Potential causes:**

1. **Performance metric accumulation:** The `SolverPerformanceTracker` keeps up to 1,000 metrics in memory. If solving volume is very high, this is bounded but still consumes memory. Call `clearOldMetrics(daysToKeep)` periodically.

2. **Audio provider lazy loading:** Native solvers for audio-based captcha challenges (reCAPTCHA audio, hCAPTCHA audio) rely on speech-to-text providers (Azure Speech, Google Cloud Speech). These are loaded lazily and may consume significant resources when active:
   - Azure Speech Provider
   - Google Cloud Speech Provider

   If audio solving is not needed, ensure audio-related challenges are not triggered unnecessarily.

3. **Browser pool exhaustion:** Native solvers (Turnstile, reCAPTCHA, hCAPTCHA, DataDome, Akamai) use the browser pool. If too many concurrent solves are requested, browser instances may be exhausted.

**Solutions:**

- Monitor browser pool availability alongside captcha solving.
- Limit concurrency via the `maxConcurrency` capability setting on native solvers.
- Use external API providers (2Captcha, AntiCaptcha, CapMonster) instead of native solvers to offload resource usage.
- Clear old performance metrics periodically:
  ```typescript
  performanceTracker.clearOldMetrics(7); // Keep only last 7 days
  ```

---

### 5.6 API Key Manager Database Initialization Failures

**Symptoms:** Warning in logs: "API Key Manager will use environment variables only until database is initialized"

**Cause:** The database tables (`captcha_solver_api_keys`) may not exist yet (migrations not run), or the database is temporarily unavailable.

**Solution:**
- Run database migrations before starting the application.
- The service gracefully degrades to environment-variable-only mode -- this is safe but means database-managed keys are not loaded.
- The service will function normally with environment variable keys.

---

### 5.7 Configuration Validation Failures on Startup

**Symptoms:** `BadRequestException: Invalid captcha solver configuration: ...`

**Cause:** Configuration values loaded from environment variables or database fail Joi schema validation.

**Solution:**
- Check the error message for specific validation failures.
- Ensure numeric values are valid numbers (not strings like "abc" for timeout settings).
- Ensure boolean values are `true` or `false`.
- Verify that the preferred provider name matches one of the registered providers.

---

## Example Environment Configuration

Minimal configuration for production:

```bash
# Provider API keys (at least one required)
TWOCAPTCHA_API_KEY=your_2captcha_key
ANTICAPTCHA_API_KEY=your_anticaptcha_key
CAPMONSTER_API_KEY=your_capmonster_key

# Preferred provider
CAPTCHA_SOLVER_PREFERRED_PROVIDER=2captcha

# Timeouts
CAPTCHA_SOLVER_TIMEOUT_SECONDS=60
CAPTCHA_PROVIDER_TIMEOUT_SECONDS=60

# Retries
CAPTCHA_SOLVER_MAX_RETRIES=3
CAPTCHA_RETRY_MAX_ATTEMPTS=3
CAPTCHA_RETRY_BACKOFF_MS=1000
CAPTCHA_RETRY_MAX_BACKOFF_MS=10000

# Circuit breaker
CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
CAPTCHA_CIRCUIT_BREAKER_TIMEOUT_PERIOD=60000

# Detection
CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE=0.7
CAPTCHA_DETECTION_MIN_CONFIDENCE_THRESHOLD=0.5
CAPTCHA_DETECTION_MIN_STRONG_CONFIDENCE=0.7

# Cache
CAPTCHA_CACHE_TTL=300000

# Fallback (all enabled by default)
CAPTCHA_SOLVER_FALLBACK_RECAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_HCAPTCHA=true
CAPTCHA_SOLVER_FALLBACK_DATADOME=true
CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA=true
```

For high-throughput scenarios, consider:

```bash
# More aggressive circuit breaker (tolerate more failures)
CAPTCHA_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5

# Faster recovery
CAPTCHA_CIRCUIT_BREAKER_TIMEOUT_PERIOD=30000

# Multiple keys for rotation
TWOCAPTCHA_API_KEY=key1,key2,key3

# Higher rate limit
CAPTCHA_PROVIDER_RATE_LIMIT_PER_MINUTE=120
```
