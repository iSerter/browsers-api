# Captcha Solver Module Improvements - Product Requirements Document

**Date:** 2025-01-15  
**Status:** Ready for Implementation  
**Breaking Changes:** Acceptable (app not launched yet)

## Executive Summary

This PRD outlines improvements to the captcha-solver module based on comprehensive code review. The improvements focus on architecture, performance, error handling, security, testing, and maintainability. Backward-incompatible changes are acceptable as the application has not launched yet.

## 1. Critical Fixes (High Priority)

### 1.1 Fix Test Failures
**Priority:** CRITICAL  
**Impact:** Blocks CI/CD pipeline  
**Effort:** Low

Fix all test failures in the captcha-solver module:
- Resolve dependency injection issues in `confidence-scoring.service.spec.ts`
- Ensure all tests pass
- Verify test coverage is maintained

### 1.2 Implement Circuit Breaker Pattern
**Priority:** High  
**Impact:** Prevents wasted time on failing solvers  
**Effort:** Medium

Create `SolverCircuitBreaker` service that:
- Tracks consecutive failures per solver type
- Temporarily disables solvers after threshold (default: 3 failures)
- Implements timeout period (default: 60 seconds)
- Integrates with `SolverRegistry` and `SolverFactory`
- Provides configurable thresholds and timeouts

### 1.3 Custom Exception Hierarchy
**Priority:** High  
**Impact:** Better error handling and debugging  
**Effort:** Low

Create custom exception classes:
- `CaptchaSolverException` base class with error codes, categories, and recovery flags
- Error categories: AVAILABILITY, VALIDATION, NETWORK, PROVIDER, INTERNAL
- Specific exceptions: `SolverUnavailableException`, `ProviderException`, `ValidationException`
- Replace all generic `Error` throws throughout module

### 1.4 Refactor SolverFactory.createSolver()
**Priority:** High  
**Impact:** Reduces complexity, improves maintainability  
**Effort:** Medium

Refactor `SolverFactory.createSolver()` method (lines 38-81):
- Eliminate complex conditional logic
- Replace hard-coded if statements with strategy map or builder pattern
- Make adding new solver types easier without modifying existing code

### 1.5 Parallel Solver Attempts
**Priority:** High  
**Impact:** Significant performance improvement  
**Effort:** Medium

Implement parallel solver attempts:
- Modify `solveWithFallback` to try top 2-3 solvers in parallel using `Promise.allSettled`
- Fall back to sequential attempts if all parallel attempts fail
- Ensure proper error handling and result selection

## 2. Performance & Reliability (Medium Priority)

### 2.1 Detection Result Caching
**Priority:** Medium  
**Impact:** Performance improvement  
**Effort:** Medium

Add detection result caching:
- Cache using page URL + content hash as key
- TTL: 5-10 minutes (configurable)
- Use in-memory cache or Redis if available
- Include cache invalidation strategy

### 2.2 Error Context Enrichment
**Priority:** Medium  
**Impact:** Better debugging and monitoring  
**Effort:** Medium

Enhance error handling:
- Add correlation IDs for request tracking
- Include solver metadata and timing information
- Implement centralized error handling middleware/interceptor
- Consistent error response format
- Error aggregation for multi-attempt scenarios

### 2.3 Extract Constants for Magic Numbers
**Priority:** Medium  
**Impact:** Maintainability  
**Effort:** Low

Replace hard-coded values with named constants:
- Consecutive failure thresholds (currently 3)
- Timeout values
- Retry counts
- Store in configuration file
- Make values configurable

## 3. Security & Quality (Medium Priority)

### 3.1 SSRF Protection
**Priority:** Medium  
**Impact:** Security improvement  
**Effort:** Medium

Implement SSRF protection:
- Validate URLs against allowlist
- Block private IP ranges
- Use validated URL library
- Prevent SSRF attacks through user-provided URLs

### 3.2 Secure File Handling
**Priority:** Medium  
**Impact:** Security improvement  
**Effort:** Medium

Secure temporary file handling:
- Secure temp file creation
- Guaranteed cleanup
- Path validation for screenshots and audio files
- Prevent path traversal attacks

### 3.3 Configuration Schema Validation
**Priority:** Medium  
**Impact:** Reliability  
**Effort:** Medium

Implement configuration validation using Joi:
- Comprehensive validation schema for all configuration options
- Validate confidence thresholds, timeout values, retry counts, provider settings
- Validate on module initialization

### 3.4 Replace 'any' Types
**Priority:** Medium  
**Impact:** Type safety  
**Effort:** Low

Improve type safety:
- Audit all error handling code
- Replace `catch (error: any)` with `catch (error: unknown)`
- Implement proper type guards
- Improve type safety throughout module

## 4. Documentation & Testing (Medium Priority)

### 4.1 Complete API Documentation
**Priority:** Medium  
**Impact:** Developer experience  
**Effort:** Low

Complete API documentation:
- Ensure all endpoints have Swagger/OpenAPI documentation
- Add request/response examples
- Document error responses
- Create integration guide with code examples

### 4.2 Integration Tests
**Priority:** Medium  
**Impact:** Quality assurance  
**Effort:** High

Add comprehensive integration tests:
- Test full solver workflow
- Test multi-solver fallback scenarios
- Test error recovery flows
- Test end-to-end orchestration
- Test concurrent solver access
- Test health check failures during solving

### 4.3 Architecture Documentation
**Priority:** Medium  
**Impact:** Maintainability  
**Effort:** Medium

Create architecture documentation:
- System architecture diagrams
- Component interaction diagrams
- Data flow diagrams
- Decision records (ADRs)
- Document registry, factory, and strategy patterns

### 4.4 Troubleshooting Guide
**Priority:** Low  
**Impact:** Developer experience  
**Effort:** Low

Create troubleshooting guide:
- Common issues and solutions
- Debugging tips
- Performance tuning guide
- Error scenario examples

## 5. API & Integration (Medium Priority)

### 5.1 API Versioning
**Priority:** Medium  
**Impact:** API stability  
**Effort:** Low

Implement API versioning:
- Add `/v1/` prefix to captcha-solver endpoints
- Standardize error response format with error codes, messages, optional details
- Add rate limiting using NestJS Throttler
- Different limits per endpoint

### 5.2 Performance Monitoring
**Priority:** Medium  
**Impact:** Observability  
**Effort:** Medium

Add performance monitoring:
- Integrate Prometheus/StatsD for metrics
- Add distributed tracing support
- Track average solve time per CAPTCHA type
- Track success rate by solver
- Track resource usage under load

## 6. Code Quality (Medium Priority)

### 6.1 Shared Utilities
**Priority:** Medium  
**Impact:** Code quality  
**Effort:** Medium

Create shared utilities:
- Extract duplicated retry logic
- Extract error message formatting
- Extract health check patterns
- Reduce code duplication
- Improve consistency

### 6.2 Refactor Large Services
**Priority:** Low  
**Impact:** Maintainability  
**Effort:** High

Refactor large services:
- Split `DetectionService.detectAll()` (1239 lines) into smaller methods
- Use composition and extract helper methods
- Improve code readability

## 7. Optimization (Low Priority)

### 7.1 Lazy Loading
**Priority:** Low  
**Impact:** Performance  
**Effort:** Medium

Implement lazy loading:
- Load audio processing libraries on first use
- Load ML models on first use
- Improve startup time
- Reduce memory usage

### 7.2 Database Query Optimization
**Priority:** Low  
**Impact:** Performance  
**Effort:** Medium

Optimize database:
- Add indexes on frequently queried fields
- Implement query result caching for configuration
- Optimize queries in hot paths

### 7.3 CapMonster Integration
**Priority:** Low  
**Impact:** Feature enhancement  
**Effort:** Medium

Add CapMonster provider:
- Similar to existing 2Captcha and AntiCaptcha providers
- Provides additional provider option

## Success Criteria

### Code Quality Metrics
- 80%+ test coverage
- 0 critical security vulnerabilities
- All tests passing
- No methods > 200 lines
- Cyclomatic complexity < 10

### Performance Metrics
- < 30s average solve time
- 95%+ success rate
- < 500ms detection time

### Maintainability Metrics
- All TODOs tracked and prioritized
- Comprehensive documentation
- Clear architecture

## Implementation Phases

### Phase 1: Critical Fixes (Week 1-2)
- Fix test failures
- Implement custom exception hierarchy
- Add basic error context enrichment

### Phase 2: Performance & Reliability (Week 3-4)
- Implement circuit breaker pattern
- Add parallel solver attempts
- Implement detection caching

### Phase 3: Security & Quality (Week 5-6)
- SSRF protection
- Enhanced input validation
- Secure file handling improvements

### Phase 4: Documentation & Testing (Week 7-8)
- Complete API documentation
- Add integration tests
- Create architecture diagrams

### Phase 5: Enhancements (Ongoing)
- Refactor large services
- Add new features as needed
- Continuous improvement

