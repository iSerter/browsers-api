# Captcha Solver Troubleshooting Guide

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with the Captcha Solver module. It covers error codes, log analysis techniques, diagnostic commands, and step-by-step resolution procedures.

## Table of Contents

1. [Error Codes Reference](#error-codes-reference)
2. [Log Analysis](#log-analysis)
3. [Network Issues](#network-issues)
4. [Solver Failures](#solver-failures)
5. [Configuration Problems](#configuration-problems)
6. [Diagnostic Commands](#diagnostic-commands)
7. [Performance Issues](#performance-issues)
8. [Common Error Patterns](#common-error-patterns)

---

## Error Codes Reference

### Detection Errors

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `DETECTION_FAILED` | "Page object is null or undefined" | Page context is missing | Ensure page is loaded before detection |
| `WIDGET_NOT_DETECTED` | "reCAPTCHA/hCAPTCHA widget not detected" | Captcha widget not found on page | Verify page has loaded, check if captcha is visible |
| `IFRAME_NOT_FOUND` | "reCAPTCHA anchor iframe not found" | Required iframe element missing | Wait for page to fully load, check network connectivity |
| `DETECTION_TIMEOUT` | "Timeout waiting for captcha detection" | Detection took too long | Increase timeout, check page load performance |

### Solver Errors

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `SOLVER_UNAVAILABLE` | "No enabled solvers found for challenge type" | No solver registered for captcha type | Check solver registration, verify module initialization |
| `SOLVER_FAILED` | "Failed to solve [type] challenge after N attempts" | All solver attempts failed | Enable third-party fallback, check API keys |
| `SOLVER_TIMEOUT` | "Solver timeout after Nms" | Solver exceeded timeout | Increase timeout configuration, check network latency |
| `ALL_PROVIDERS_FAILED` | "All providers failed to solve captcha" | All third-party providers failed | Verify API keys, check provider status, enable native solver |
| `NO_PROVIDERS_AVAILABLE` | "No captcha solver providers are available" | No API keys configured | Configure at least one API key (2CAPTCHA_API_KEY or ANTICAPTCHA_API_KEY) |

### Native Solver Specific Errors

#### reCAPTCHA Solver

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `RECAPTCHA_WIDGET_NOT_DETECTED` | "reCAPTCHA widget not detected" | Widget not found on page | Verify page has loaded, check sitekey |
| `RECAPTCHA_IFRAME_NOT_FOUND` | "reCAPTCHA anchor iframe not found" | Required iframe missing | Wait for page load, check network issues |
| `AUDIO_DISABLED` | "Audio challenges are disabled" | Audio solving not enabled | Enable audio processing in configuration |
| `AUDIO_URL_EXTRACTION_FAILED` | "Could not extract audio URL" | Failed to get audio challenge URL | Check page structure, verify captcha type |
| `IMAGE_CHALLENGE_DISABLED` | "Image challenges are disabled" | Image solving not enabled | Enable image challenge solving |
| `V3_TOKEN_FAILED` | "Failed to solve v3 challenge" | reCAPTCHA v3 solving failed | Check action parameter, verify sitekey |

#### hCAPTCHA Solver

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `HCAPTCHA_WIDGET_NOT_DETECTED` | "hCAPTCHA widget not detected" | Widget not found | Verify page load, check sitekey |
| `HCAPTCHA_IFRAME_NOT_FOUND` | "hCAPTCHA anchor iframe not found" | Required iframe missing | Wait for page load |
| `AUDIO_DISABLED` | "Audio challenges are disabled" | Audio solving disabled | Enable audio processing |
| `ACCESSIBILITY_DISABLED` | "Accessibility challenges are disabled" | Accessibility solving disabled | Enable accessibility solving |
| `TOKEN_NOT_GENERATED` | "Token not generated for invisible challenge" | Invisible challenge failed | Check sitekey, verify page interaction |

#### DataDome Solver

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `DATADOME_WIDGET_NOT_DETECTED` | "DataDome widget not detected" | Widget not found | Verify DataDome is present on page |
| `UNKNOWN_CHALLENGE_TYPE` | "Unknown challenge type: [type]" | Unsupported challenge variant | Check DataDome version, update solver |
| `SENSOR_VALIDATION_FAILED` | "Sensor validation challenge not bypassed" | Sensor validation failed | Check browser fingerprint, verify CDP session |
| `SLIDER_DISABLED` | "Slider solving is disabled" | Slider solving disabled | Enable slider solving in configuration |
| `SLIDER_NOT_FOUND` | "Slider element not found" | Slider element missing | Check page structure, verify challenge type |
| `COOKIE_MANIPULATION_DISABLED` | "Cookie manipulation is disabled" | Cookie solving disabled | Enable cookie manipulation |
| `COOKIE_NOT_FOUND` | "DataDome cookie not found" | Required cookie missing | Check cookie handling, verify challenge type |

#### Akamai Solver

| Error Code | Error Message | Description | Resolution |
|------------|---------------|-------------|------------|
| `AKAMAI_NOT_DETECTED` | "Akamai Bot Manager not detected" | Bot Manager not found | Verify Akamai is present on page |
| `UNKNOWN_CHALLENGE_LEVEL` | "Unknown challenge level: [level]" | Unsupported challenge level | Check Akamai version, update solver |
| `LEVEL_1_FAILED` | "Level 1 challenge not bypassed" | Level 1 challenge failed | Check browser fingerprint |
| `LEVEL_2_DISABLED` | "Level 2 challenge solving is disabled" | Level 2 solving disabled | Enable Level 2 solving |
| `LEVEL_2_FAILED` | "Level 2 challenge not solved" | Level 2 challenge failed | Check challenge type, verify solver |
| `LEVEL_3_DISABLED` | "Level 3 challenge solving is disabled" | Level 3 solving disabled | Enable Level 3 solving |
| `LEVEL_3_FAILED` | "Level 3 challenge not solved" | Level 3 challenge failed | Check challenge complexity |

### Third-Party Provider Errors

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `AUTH_ERROR` | 401, 403 | Invalid API key or insufficient permissions | Verify API key, check account status |
| `INSUFFICIENT_BALANCE` | 402 | Account balance too low | Add funds to provider account |
| `INVALID_PARAMETERS` | 400 | Invalid request parameters | Check sitekey, URL, and other parameters |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Reduce request rate, wait before retry |
| `PROVIDER_ERROR` | 500+ | Provider service error | Check provider status page, retry later |

### Audio Processing Errors

| Error Code | Error Message | Description | Resolution |
|------------|----------------|-------------|------------|
| `AUDIO_PROVIDER_NOT_CONFIGURED` | "Google Cloud Speech API key not configured" | API key missing | Configure GOOGLE_SPEECH_API_KEY or alternative |
| `AUDIO_DOWNLOAD_FAILED` | "Failed to download audio: [status]" | Audio download failed | Check network connectivity, verify audio URL |
| `AUDIO_TRANSCRIPTION_FAILED` | "OpenAI Whisper transcription failed" | Transcription service failed | Check API key, verify service availability |
| `AUDIO_URL_EXTRACTION_FAILED` | "Could not extract audio URL from page" | Audio URL not found | Check page structure, verify captcha type |

---

## Log Analysis

### Understanding Log Levels

The Captcha Solver module uses structured logging with the following levels:

- **DEBUG**: Detailed diagnostic information (solver attempts, delays, element detection)
- **LOG**: Normal operational messages (solver selection, successful solves)
- **WARN**: Warning messages (failed attempts, fallback triggers)
- **ERROR**: Error conditions (solver failures, configuration issues)

### Log Entry Structure

#### Detection Log Entry

```json
{
  "operation": "detection",
  "systemType": "recaptcha",
  "detected": true,
  "confidence": 0.95,
  "durationMs": 234,
  "url": "https://example.com/login",
  "signals": 3,
  "metadata": {
    "sitekey": "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
  }
}
```

#### Solving Log Entry

```json
{
  "operation": "solving",
  "solverType": "native-recaptcha-solver",
  "challengeType": "recaptcha",
  "success": true,
  "durationMs": 5234,
  "attempt": 1,
  "maxAttempts": 3,
  "url": "https://example.com/login",
  "solution": {
    "token": "03AGdBq24...",
    "solvedAt": "2025-01-17T10:30:00Z"
  },
  "usedThirdParty": false
}
```

### Analyzing Logs

#### 1. Filter by Operation Type

```bash
# View only detection logs
grep '"operation":"detection"' logs/application.log | jq

# View only solving logs
grep '"operation":"solving"' logs/application.log | jq
```

#### 2. Find Failed Operations

```bash
# Find failed detection attempts
grep '"operation":"detection"' logs/application.log | jq 'select(.detected == false)'

# Find failed solving attempts
grep '"operation":"solving"' logs/application.log | jq 'select(.success == false)'
```

#### 3. Analyze Error Patterns

```bash
# Extract error messages
grep '"operation":"solving"' logs/application.log | jq -r 'select(.error != null) | .error.message' | sort | uniq -c | sort -rn

# Find timeout errors
grep -i "timeout" logs/application.log | jq
```

#### 4. Performance Analysis

```bash
# Find slow operations (>5 seconds)
grep '"operation":"solving"' logs/application.log | jq 'select(.durationMs > 5000)'

# Calculate average solving time
grep '"operation":"solving"' logs/application.log | jq '[.[] | select(.success == true) | .durationMs] | add / length'
```

#### 5. Provider Performance Comparison

```bash
# Compare solver performance
grep '"operation":"solving"' logs/application.log | jq -r '[.[] | select(.success == true) | {solver: .solverType, duration: .durationMs}] | group_by(.solver) | map({solver: .[0].solver, avgDuration: ([.[] | .duration] | add / length), count: length})'
```

### Common Log Patterns

#### Pattern 1: Detection Fails Repeatedly

```
[CaptchaDetectionService] Detection failed: reCAPTCHA widget not detected
[CaptchaDetectionService] Detection failed: reCAPTCHA widget not detected
[CaptchaDetectionService] Detection failed: reCAPTCHA widget not detected
```

**Diagnosis**: Page not fully loaded, captcha not present, or detection threshold too high.

**Solution**: 
- Increase page load wait time
- Lower `minConfidence` threshold
- Verify captcha is actually present on page

#### Pattern 2: Solver Timeout

```
[NativeRecaptchaSolver] Attempt 1/3 failed: Timeout waiting for reCAPTCHA token
[NativeRecaptchaSolver] Attempt 2/3 failed: Timeout waiting for reCAPTCHA token
[NativeRecaptchaSolver] Attempt 3/3 failed: Timeout waiting for reCAPTCHA token
```

**Diagnosis**: Captcha solving taking too long, network issues, or captcha complexity too high.

**Solution**:
- Increase timeout configuration
- Enable third-party fallback
- Check network connectivity

#### Pattern 3: All Providers Fail

```
[CaptchaSolverService] Failed to solve with 2captcha: Insufficient balance
[CaptchaSolverService] Failed to solve with anticaptcha: Invalid API key
[CaptchaSolverService] All providers failed to solve captcha
```

**Diagnosis**: Third-party providers unavailable or misconfigured.

**Solution**:
- Verify API keys are valid
- Check provider account balance
- Enable native solver as fallback

---

## Network Issues

### Issue: Connection Timeouts

**Symptoms**:
- Solver timeouts occur frequently
- "Failed to download audio" errors
- Third-party provider requests fail

**Diagnostic Steps**:

1. **Test network connectivity**:
```bash
# Test DNS resolution
nslookup api.2captcha.com
nslookup api.anti-captcha.com

# Test HTTP connectivity
curl -I https://api.2captcha.com/in.php
curl -I https://api.anti-captcha.com/createTask
```

2. **Check firewall rules**:
```bash
# Check if outbound connections are blocked
telnet api.2captcha.com 443
telnet api.anti-captcha.com 443
```

3. **Verify proxy configuration** (if using proxy):
```bash
# Test proxy connectivity
curl -x http://proxy:port https://api.2captcha.com/in.php
```

**Resolution**:

1. **Increase timeout values**:
```json
{
  "captcha": {
    "enabled": true,
    "timeouts": {
      "recaptcha": 90000,
      "hcaptcha": 90000,
      "datadome": 120000
    }
  }
}
```

2. **Configure retry with exponential backoff**:
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

3. **Use proxy for third-party requests**:
```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port
```

### Issue: DNS Resolution Failures

**Symptoms**:
- "getaddrinfo ENOTFOUND" errors
- Provider API endpoints unreachable

**Diagnostic Steps**:

```bash
# Test DNS resolution
dig api.2captcha.com
dig api.anti-captcha.com

# Check DNS server configuration
cat /etc/resolv.conf
```

**Resolution**:

1. **Configure custom DNS servers**:
```bash
# Add to /etc/resolv.conf
nameserver 8.8.8.8
nameserver 8.8.4.4
```

2. **Use IP addresses directly** (if DNS fails):
   - Update provider endpoints in configuration
   - Note: Not recommended for production

### Issue: SSL/TLS Certificate Errors

**Symptoms**:
- "certificate verify failed" errors
- "self signed certificate" errors

**Diagnostic Steps**:

```bash
# Test SSL connection
openssl s_client -connect api.2captcha.com:443 -showcerts

# Check certificate validity
echo | openssl s_client -connect api.2captcha.com:443 2>/dev/null | openssl x509 -noout -dates
```

**Resolution**:

1. **Update CA certificates**:
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ca-certificates

# CentOS/RHEL
sudo yum update ca-certificates
```

2. **Configure Node.js to use system certificates**:
```bash
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
```

---

## Solver Failures

### Issue: Native Solver Fails Consistently

**Symptoms**:
- Native solver fails on all attempts
- "Failed to solve [type] challenge after N attempts" errors

**Diagnostic Steps**:

1. **Check solver availability**:
```bash
curl -X GET http://localhost:3333/api/v1/captcha-solver/providers \
  -H "X-API-Key: your-api-key"
```

2. **Review solver logs**:
```bash
grep "NativeRecaptchaSolver\|NativeHcaptchaSolver" logs/application.log | tail -50
```

3. **Test with minimal configuration**:
```json
{
  "captcha": {
    "enabled": true,
    "enableThirdPartyFallback": false,
    "solverPriority": ["native"],
    "minConfidence": 0.3
  }
}
```

**Resolution**:

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

3. **Lower confidence threshold**:
```json
{
  "captcha": {
    "enabled": true,
    "minConfidence": 0.3
  }
}
```

### Issue: Third-Party Provider Failures

**Symptoms**:
- "All providers failed to solve captcha" errors
- Provider-specific error messages

**Diagnostic Steps**:

1. **Check provider availability**:
```bash
curl -X GET http://localhost:3333/api/v1/captcha-solver/providers \
  -H "X-API-Key: your-api-key" | jq
```

2. **Test provider API keys**:
```bash
# Test 2Captcha
curl -X POST "https://2captcha.com/in.php" \
  -d "key=YOUR_API_KEY&method=user&action=getbalance"

# Test Anti-Captcha
curl -X POST "https://api.anti-captcha.com/getBalance" \
  -H "Content-Type: application/json" \
  -d '{"clientKey":"YOUR_API_KEY"}'
```

3. **Check provider status**:
   - 2Captcha: https://2captcha.com/status
   - Anti-Captcha: https://anti-captcha.com/status

**Resolution**:

1. **Verify API keys**:
```bash
# Check environment variables
echo $2CAPTCHA_API_KEY
echo $ANTICAPTCHA_API_KEY

# Verify keys are loaded in application
curl -X GET http://localhost:3333/api/v1/captcha-solver/config \
  -H "X-API-Key: your-api-key" | jq
```

2. **Check account balance**:
```bash
# Get usage statistics
curl -X GET http://localhost:3333/api/v1/captcha-solver/stats \
  -H "X-API-Key: your-api-key" | jq
```

3. **Rotate API keys** (if using multiple keys):
```bash
# Set multiple keys (comma-separated)
export 2CAPTCHA_API_KEY=key1,key2,key3
```

4. **Enable native solver fallback**:
```json
{
  "captcha": {
    "enabled": true,
    "solverPriority": ["2captcha", "anticaptcha", "native"]
  }
}
```

### Issue: Audio Captcha Solving Fails

**Symptoms**:
- "Audio challenges are disabled" errors
- "Failed to solve audio challenge" errors
- "Could not extract audio URL" errors

**Diagnostic Steps**:

1. **Check audio provider configuration**:
```bash
echo $GOOGLE_SPEECH_API_KEY
echo $OPENAI_API_KEY
echo $AZURE_SPEECH_KEY
```

2. **Test audio provider connectivity**:
```bash
# Test Google Cloud Speech API
curl -X POST "https://speech.googleapis.com/v1/speech:recognize" \
  -H "Authorization: Bearer $GOOGLE_SPEECH_API_KEY" \
  -H "Content-Type: application/json"

# Test OpenAI Whisper API
curl -X POST "https://api.openai.com/v1/audio/transcriptions" \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Resolution**:

1. **Configure audio providers**:
```bash
# Set at least one audio provider
export GOOGLE_SPEECH_API_KEY=your_key
# OR
export OPENAI_API_KEY=your_key
# OR
export AZURE_SPEECH_KEY=your_key
export AZURE_SPEECH_REGION=your_region
```

2. **Set provider priority**:
```bash
export AUDIO_CAPTCHA_PROVIDER_PRIORITY=google-cloud,openai-whisper,azure-speech
```

3. **Enable audio solving** (if disabled):
   - Audio solving is enabled by default
   - Check job configuration for `audioEnabled` setting

---

## Configuration Problems

### Issue: Configuration Not Applied

**Symptoms**:
- Changes to configuration don't take effect
- Default values used instead of custom settings

**Diagnostic Steps**:

1. **Check current configuration**:
```bash
curl -X GET http://localhost:3333/api/v1/captcha-solver/config \
  -H "X-API-Key: your-api-key" | jq
```

2. **Verify environment variables**:
```bash
# Check all captcha-related environment variables
env | grep -i captcha
```

3. **Check database configuration**:
```sql
SELECT * FROM captcha_solver_configs ORDER BY created_at DESC;
```

**Resolution**:

1. **Update configuration via API**:
```bash
curl -X PATCH http://localhost:3333/api/v1/captcha-solver/config \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "CAPTCHA_MIN_CONFIDENCE",
    "value": "0.5"
  }'
```

2. **Restart application** (if using environment variables):
```bash
# Docker
docker-compose restart api

# PM2
pm2 restart browsers-api

# Systemd
sudo systemctl restart browsers-api
```

3. **Verify configuration persistence**:
```bash
# Check if configuration is saved
curl -X GET http://localhost:3333/api/v1/captcha-solver/config \
  -H "X-API-Key: your-api-key" | jq '.configs.CAPTCHA_MIN_CONFIDENCE'
```

### Issue: Module Not Initialized

**Symptoms**:
- "No enabled solvers found" errors
- "Module not found" errors
- Solver endpoints return 404

**Diagnostic Steps**:

1. **Check module registration**:
```typescript
// Verify in app.module.ts
import { CaptchaSolverModule } from './modules/captcha-solver/captcha-solver.module';

@Module({
  imports: [
    CaptchaSolverModule,
    // ...
  ],
})
```

2. **Check application logs for initialization**:
```bash
grep -i "captcha.*init\|solver.*init" logs/application.log
```

3. **Verify database migration**:
```bash
# Check if migration ran
npm run typeorm migration:show

# Run migration if needed
npm run typeorm migration:run
```

**Resolution**:

1. **Import module in AppModule**:
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

2. **Run database migration**:
```bash
npm run typeorm migration:run
```

3. **Restart application**:
```bash
npm run start:dev
# or
docker-compose restart api
```

---

## Diagnostic Commands

### Quick Health Check

```bash
# Check provider availability
curl -X GET http://localhost:3333/api/v1/captcha-solver/providers \
  -H "X-API-Key: your-api-key" | jq

# Check configuration
curl -X GET http://localhost:3333/api/v1/captcha-solver/config \
  -H "X-API-Key: your-api-key" | jq

# Check usage statistics
curl -X GET http://localhost:3333/api/v1/captcha-solver/stats \
  -H "X-API-Key: your-api-key" | jq
```

### Test Captcha Solving

```bash
# Test reCAPTCHA solving
curl -X POST http://localhost:3333/api/v1/captcha-solver/test \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "recaptcha",
    "url": "https://www.google.com/recaptcha/api2/demo",
    "sitekey": "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
  }' | jq

# Test hCAPTCHA solving
curl -X POST http://localhost:3333/api/v1/captcha-solver/test \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "hcaptcha",
    "url": "https://hcaptcha.com/demo",
    "sitekey": "20000000-ffff-ffff-ffff-000000000002"
  }' | jq
```

### Log Analysis Commands

```bash
# Find all errors in last hour
grep -i error logs/application.log | tail -100

# Count solver failures by type
grep '"operation":"solving"' logs/application.log | jq -r 'select(.success == false) | .solverType' | sort | uniq -c

# Find timeout errors
grep -i "timeout" logs/application.log | jq 'select(.error != null)'

# Calculate success rate
grep '"operation":"solving"' logs/application.log | jq '[.[] | .success] | {total: length, successful: ([.[] | select(. == true)] | length), rate: (([.[] | select(. == true)] | length) / length * 100)}'
```

### Database Diagnostics

```sql
-- Check configuration entries
SELECT key, value, created_at, updated_at 
FROM captcha_solver_configs 
ORDER BY updated_at DESC;

-- Check for recent errors (if error logging table exists)
SELECT * FROM captcha_errors 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Network Diagnostics

```bash
# Test provider API connectivity
curl -v https://api.2captcha.com/in.php?key=test&method=user&action=getbalance
curl -v https://api.anti-captcha.com/getBalance \
  -H "Content-Type: application/json" \
  -d '{"clientKey":"test"}'

# Test DNS resolution
dig api.2captcha.com
dig api.anti-captcha.com

# Check SSL certificates
echo | openssl s_client -connect api.2captcha.com:443 2>/dev/null | openssl x509 -noout -subject -dates
```

### Performance Diagnostics

```bash
# Calculate average solving time by solver type
grep '"operation":"solving"' logs/application.log | jq '[.[] | select(.success == true) | {solver: .solverType, duration: .durationMs}] | group_by(.solver) | map({solver: .[0].solver, avgMs: ([.[] | .duration] | add / length), count: length})'

# Find slowest operations
grep '"operation":"solving"' logs/application.log | jq '[.[] | select(.success == true) | {solver: .solverType, duration: .durationMs, url: .url}] | sort_by(.duration) | reverse | .[0:10]'

# Calculate retry statistics
grep '"operation":"solving"' logs/application.log | jq '[.[] | {attempt: .attempt, maxAttempts: .maxAttempts, success: .success}] | group_by(.attempt) | map({attempt: .[0].attempt, total: length, successful: ([.[] | select(.success == true)] | length), rate: (([.[] | select(.success == true)] | length) / length * 100)})'
```

---

## Performance Issues

### Issue: Slow Solving Times

**Symptoms**:
- Solving takes >30 seconds consistently
- Jobs timeout frequently

**Diagnostic Steps**:

1. **Analyze solving duration**:
```bash
grep '"operation":"solving"' logs/application.log | jq '[.[] | select(.success == true) | .durationMs] | {min: min, max: max, avg: (add / length), p95: (sort | .[length * 0.95 | floor])}'
```

2. **Compare solver performance**:
```bash
grep '"operation":"solving"' logs/application.log | jq -r '[.[] | select(.success == true) | {solver: .solverType, duration: .durationMs}] | group_by(.solver) | map({solver: .[0].solver, avg: ([.[] | .duration] | add / length), count: length})'
```

**Resolution**:

1. **Optimize solver priority**:
```json
{
  "captcha": {
    "enabled": true,
    "solverPriority": ["native", "2captcha"]
  }
}
```

2. **Reduce retry attempts** (if native solver is slow):
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

3. **Use faster third-party providers**:
   - 2Captcha typically faster than Anti-Captcha
   - Consider provider-specific optimizations

### Issue: High Resource Usage

**Symptoms**:
- High CPU/memory usage during solving
- Browser instances not released

**Diagnostic Steps**:

1. **Monitor resource usage**:
```bash
# Check process resource usage
ps aux | grep node
top -p $(pgrep -f "node.*browsers-api")

# Check memory usage
free -h
```

2. **Check browser instance count**:
```bash
# Count browser processes
ps aux | grep -i "chrome\|chromium" | wc -l
```

**Resolution**:

1. **Limit concurrent solving**:
   - Configure browser pool size
   - Limit concurrent job processing

2. **Enable browser reuse**:
   - Reuse browser instances across jobs
   - Implement proper cleanup

3. **Monitor and cleanup**:
```bash
# Kill orphaned browser processes
pkill -f "chrome.*remote-debugging"
```

---

## Common Error Patterns

### Pattern 1: "Widget not detected" after page load

**Cause**: Page loaded but captcha widget not yet rendered

**Solution**:
```json
{
  "actions": [
    {
      "action": "wait",
      "timeout": 5000
    },
    {
      "action": "screenshot"
    }
  ],
  "captcha": {
    "enabled": true,
    "minConfidence": 0.3
  }
}
```

### Pattern 2: "All providers failed" with valid API keys

**Cause**: API keys valid but account balance insufficient or rate limited

**Solution**:
1. Check provider account balance
2. Verify API key permissions
3. Check rate limits
4. Enable native solver fallback

### Pattern 3: Timeout errors on complex captchas

**Cause**: Captcha complexity exceeds timeout configuration

**Solution**:
```json
{
  "captcha": {
    "enabled": true,
    "timeouts": {
      "recaptcha": 120000,
      "hcaptcha": 120000,
      "datadome": 180000
    },
    "maxRetries": {
      "recaptcha": 3,
      "hcaptcha": 3
    }
  },
  "timeoutMs": 300000
}
```

### Pattern 4: Audio captcha solving fails

**Cause**: Audio provider not configured or transcription failed

**Solution**:
1. Configure at least one audio provider:
```bash
export GOOGLE_SPEECH_API_KEY=your_key
# OR
export OPENAI_API_KEY=your_key
```

2. Verify audio provider connectivity
3. Check audio URL extraction logs

---

## Getting Help

If you're unable to resolve an issue using this guide:

1. **Check application logs** for detailed error messages
2. **Review Swagger documentation** at `/api/docs`
3. **Check provider status pages**:
   - 2Captcha: https://2captcha.com/status
   - Anti-Captcha: https://anti-captcha.com/status
4. **Review technical documentation** in `docs/tech/` directory
5. **Collect diagnostic information**:
   - Application logs
   - Configuration snapshot
   - Error messages with stack traces
   - Network connectivity test results

---

**Last Updated**: 2025-01-17

