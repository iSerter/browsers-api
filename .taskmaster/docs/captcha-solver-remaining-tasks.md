# Captcha Solver Module - Remaining Tasks

**Date:** 2026-02-06
**Reference:** [captcha-solver-improvements-prd.md](./captcha-solver-improvements-prd.md)
**Audit Status:** 10 Implemented, 4 Partially Implemented, 9 Not Implemented

---

## Not Implemented

### 1.5 Parallel Solver Attempts
**Priority:** High | **Effort:** Medium | **PRD Section:** 1.5

Modify `solveWithFallback` in `src/modules/captcha-solver/factories/solver-factory.service.ts` to try top 2-3 solvers in parallel using `Promise.allSettled`. Currently uses a sequential `for` loop (line 325). Fall back to sequential attempts if all parallel attempts fail.

**Files to modify:**
- `src/modules/captcha-solver/factories/solver-factory.service.ts` (lines 277-456)

---

### 3.3 Configuration Schema Validation (Joi)
**Priority:** Medium | **Effort:** Medium | **PRD Section:** 3.3

No Joi validation exists anywhere in the module. Current validation is manual switch/case in `CaptchaSolverService.validateConfigKey()` (lines 430-483). Implement comprehensive Joi schemas for all configuration options and validate on module initialization.

**Files to modify:**
- `src/modules/captcha-solver/captcha-solver.service.ts`
- `src/modules/captcha-solver/config/captcha-solver-config.service.ts`

---

### 3.4 Replace `any` Types
**Priority:** Medium | **Effort:** Low | **PRD Section:** 3.4

68 occurrences of `catch (error: any)` across 17 files. Only 6 uses of `catch (error: unknown)` (in `native-solver-registry.service.ts` and `retry.util.ts`). Replace all `catch (error: any)` with `catch (error: unknown)` and add proper type guards.

**Key offenders (by file):**
- `solver-orchestration.service.ts` -- 3 occurrences
- `solver-factory.service.ts` -- 2 occurrences
- `captcha-solver.service.ts` -- 2 occurrences
- Native solvers (akamai, turnstile, hcaptcha, recaptcha, datadome) -- 7-14 each

---

### 4.2 Integration Tests
**Priority:** Medium | **Effort:** High | **PRD Section:** 4.2

Zero e2e or integration test files exist. All 40 spec files are unit tests. Need:
- Full solver workflow tests
- Multi-solver fallback scenario tests
- Error recovery flow tests
- End-to-end orchestration tests
- Concurrent solver access tests
- Health check failure during solving tests

**Files to create:**
- `src/modules/captcha-solver/__tests__/solver-workflow.e2e-spec.ts`
- `src/modules/captcha-solver/__tests__/fallback-scenarios.e2e-spec.ts`
- `src/modules/captcha-solver/__tests__/error-recovery.e2e-spec.ts`

---

### 5.1 API Versioning & Rate Limiting
**Priority:** Medium | **Effort:** Low | **PRD Section:** 5.1

Controller uses `@Controller('captcha-solver')` -- no `/v1/` prefix. No `@Throttle()` or `@nestjs/throttler` in the module. Error responses still use generic `BadRequestException` in places.

**Files to modify:**
- `src/modules/captcha-solver/captcha-solver.controller.ts` (line 28)
- `src/modules/captcha-solver/captcha-solver.module.ts` (add ThrottlerModule)

---

### 5.2 Performance Monitoring (Prometheus/StatsD)
**Priority:** Medium | **Effort:** Medium | **PRD Section:** 5.2

No Prometheus, StatsD, or OpenTelemetry integration. Internal `SolverPerformanceTracker` exists but is not exposed to external monitoring systems. Need to track: average solve time per CAPTCHA type, success rate by solver, resource usage under load.

**Files to create/modify:**
- `src/modules/captcha-solver/metrics/captcha-metrics.service.ts` (new)
- `src/modules/captcha-solver/factories/solver-factory.service.ts` (emit metrics)
- `src/modules/captcha-solver/captcha-solver.module.ts` (register metrics)

---

### 7.1 Lazy Loading
**Priority:** Low | **Effort:** Medium | **PRD Section:** 7.1

All imports are eager. Audio processing libraries (`GoogleCloudSpeechProvider`, `OpenAIWhisperProvider`, `AzureSpeechProvider`) are imported at module load time in `AudioCaptchaProcessingService` (lines 23-24).

**Files to modify:**
- `src/modules/captcha-solver/services/audio-captcha-processing.service.ts`

---

### 7.3 CapMonster Integration
**Priority:** Low | **Effort:** Medium | **PRD Section:** 7.3

Only 2Captcha and AntiCaptcha providers exist. Add CapMonster as a third provider following the same pattern.

**Files to create:**
- `src/modules/captcha-solver/providers/capmonster.provider.ts`
- `src/modules/captcha-solver/providers/capmonster.provider.spec.ts`

**Files to modify:**
- `src/modules/captcha-solver/captcha-solver.module.ts`
- `src/modules/captcha-solver/services/api-key-manager.service.ts`

---

## Partially Implemented

### 3.2 Secure File Handling
**Priority:** Medium | **Effort:** Low | **PRD Section:** 3.2

**Done:** UUID filenames (`crypto.randomUUID()`), cleanup calls in `processAudioCaptcha`.
**Remaining:**
- Add path traversal validation (ensure filenames stay within temp directory)
- Implement guaranteed cleanup (e.g., `finally` blocks, process exit handlers)
- Set secure file permissions (mode) on creation

**Files to modify:**
- `src/modules/captcha-solver/services/audio-captcha-processing.service.ts` (lines 218-230, 330-335, 773-778)

---

### 4.3 Architecture Documentation
**Priority:** Medium | **Effort:** Medium | **PRD Section:** 4.3

**Done:** README.md, EXTENSIBILITY.md, error-context-enrichment.md.
**Remaining:**
- System architecture diagrams
- Component interaction diagrams
- Data flow diagrams
- Architecture Decision Records (ADRs)

---

### 4.4 Troubleshooting Guide
**Priority:** Low | **Effort:** Low | **PRD Section:** 4.4

**Done:** Basic troubleshooting section in README (3 issues).
**Remaining:**
- Standalone troubleshooting guide
- Debugging tips and techniques
- Performance tuning guide
- Comprehensive error scenario examples with resolution steps

---

### 7.2 Database Query Optimization
**Priority:** Low | **Effort:** Medium | **PRD Section:** 7.2

**Done:** `@Index()` on `key` (CaptchaSolverConfig) and `provider` (CaptchaSolverApiKey).
**Remaining:**
- Query result caching for configuration lookups
- Compound indexes for common query patterns
- Query optimization for hot paths

**Files to modify:**
- `src/modules/captcha-solver/entities/captcha-solver-config.entity.ts`
- `src/modules/captcha-solver/entities/api-key.entity.ts`
- `src/modules/captcha-solver/captcha-solver.service.ts`

---

## Bugs Fixed During Audit (2026-02-06)

These bugs were found and fixed during the audit:

| Suite | Tests Fixed | Root Cause | Fix |
|-------|------------|------------|-----|
| SSRF Guard | 2 | Code used `dns.promises.lookup` directly; tests mocked non-existent `dnsLookup` | Added `dnsLookup` instance method |
| SSRF Pipe | 2 | Same as guard | Same fix |
| CaptchaSolverService | 1 | `onModuleInit` swallowed all errors | Now rethrows in production |
| ExecuteScriptActionHandler | 1 | Handler wraps script in IIFE; test asserted raw script | Updated test assertion |
| StealthService | 4 | `applyStealthToPage` only used `addInitScript` (future navigations); WebGL test used wrong constant; battery mock required pre-existing API | Added `page.evaluate()`, fixed WebGL constant, fixed battery mock |
| HumanBehaviorSimulation | 4 | `setContent()` followed by `goto('about:blank')` navigated away from content | Swapped order, increased timeout |

**Result:** 58 test suites passing, 972 tests passing (was 52 suites, 958 tests)
