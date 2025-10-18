<!--
Sync Impact Report
Version change: (none prior) → 1.0.0
Modified principles: N/A (initial ratification)
Added sections: Core Principles (5), Operational Constraints & Standards, Development Workflow & Quality Gates, Governance
Removed sections: None
Templates requiring updates:
	.specify/templates/plan-template.md ✅ (principle references align generically)
	.specify/templates/spec-template.md ✅ (no conflicting language; independence & testability align with Principle 3)
	.specify/templates/tasks-template.md ✅ (test tasks optional; aligns with Test Pyramid principle)
Deferred TODOs: None
-->

# Browsers API Constitution

## Core Principles

### I. Layered Modular Architecture
The codebase MUST use clear Nest.js module boundaries: feature modules, a root `AppModule`, and optional shared modules for cross-cutting providers.
Controllers MUST remain thin (routing, parameter parsing, delegation). Business rules MUST reside in injectable services. Data persistence logic MUST be abstracted behind repositories or data access services.
Circular dependencies MUST be eliminated (detect via `npm run start:dev` warnings or dependency graph tools). Shared utilities MUST live in dedicated internal libraries/directories (e.g., `src/common`). Module public surface MUST be explicit (export only necessary providers).
Rationale: Enforces high cohesion, low coupling, improves testability, and supports incremental feature delivery.

### II. Dependency Injection & Providers Discipline
All new functionality MUST be implemented as injectable providers (services, repositories, factories) registered in the appropriate module. Direct instantiation with `new` inside controllers or other providers (except simple data objects) is FORBIDDEN.
Configuration, external clients (HTTP, DB, cache) MUST use provider tokens and factory providers for lifecycle control. Global singletons MUST be justified in PR description.
Transient or request-scoped providers MUST be used only when a clear stateful per-request need is documented. Provider naming MUST reflect responsibility (e.g., `UserService`, `AuditRepository`).
Rationale: Proper DI maximizes composability, enables mocking in tests, and ensures consistent lifecycle management.

### III. Test Pyramid & TDD Enforcement (NON-NEGOTIABLE)
Red-Green-Refactor MUST be followed: write failing unit test(s) (service logic), then implement, then refine. Every feature MUST include:
- Unit tests covering pure service logic (target ≥ 80% line coverage and 100% of critical branches)
- Integration tests for module wiring (controllers + services + repositories) focusing on behavior contracts
- E2E tests (Nest `TestingModule` + HTTP) for critical API endpoints (P1 stories only)
Mocks MUST be used only at external boundaries (DB, external HTTP). DTO validation MUST be test-covered (invalid payload → 400). Regression tests MUST be added for every production incident before fix merge.
Rationale: Ensures reliability, prevents regressions, and validates contracts at each layer.

### IV. Configuration & Environment Integrity
All configuration MUST be centralized (e.g., `ConfigModule` or custom module). No hard-coded environment-dependent values in services or controllers.
Each config value MUST have: default (where safe), schema validation (e.g., `class-validator` or Joi), and explicit typing. Access to configuration MUST occur via injected service, not `process.env` directly (except inside config factory).
Secrets MUST NOT be committed. Environment parity MUST be maintained (dev mimics prod core settings). Feature flags MUST be documented with scope & rollback path.
Rationale: Robust configuration management prevents deployment drift and runtime failures.

### V. Security, Observability & Performance Baselines
Security: Input validation MUST use DTOs + `class-validator`. Authorization MUST be implemented via guards; sensitive endpoints MUST include explicit role/permission checks. Error responses MUST avoid leaking internals.
Observability: All controllers MUST log start/end of requests with correlation id; errors MUST be captured by global exception filter. Structured logging (JSON) SHOULD be used in production.
Performance: Primary HTTP endpoints MUST meet p95 latency < 200ms under nominal load. N+1 DB query patterns MUST trigger a refactor task. Heavy CPU tasks MUST be offloaded (queue or worker) before release.
API Versioning: Public endpoints MUST be namespaced (e.g., `/v1/...`). Breaking changes MUST increment MAJOR API tag and include migration notes.
Metrics: Basic request count, error count, and latency metrics MUST be implemented (Prometheus/OpenTelemetry planned—add when instrumentation library adopted).
Rationale: Embeds security, reliability, and measurable performance into baseline delivery.

## Operational Constraints & Standards

Runtime Stack: Node.js LTS (current), Nest.js current minor stable, TypeScript strict mode enabled. ESLint and Prettier MUST pass before merge.
DTO & Validation: All external input MUST go through DTO + validation pipe. Raw object usage in controllers is FORBIDDEN.
Error Handling: Global exception filter MUST map domain errors to HTTP codes. Uncaught exceptions MUST be logged with stack + correlation id.
Logging: Use Nest Logger abstraction; no `console.log` in committed code (except provisional debugging removed before merge).
Metrics & Tracing: Prepare interfaces for metrics injection; tracing context propagation MUST be preserved where implemented.
Performance Budget: Any endpoint exceeding p95 200ms or p99 500ms MUST create a remediation task within the same sprint.
API Versioning: New public endpoints MUST be added under latest stable version path. Deprecated endpoints MUST emit structured warning logs until removal.
Environment Parity: Dev/stage/prod MUST share config schema; differences documented in `docs/configuration.md` (create if absent).
12-Factor Alignment: Codebase is single repository; config in environment; backing services treated as attached resources.

## Development Workflow & Quality Gates

Branch Naming: `feat/###-short-name`, `fix/###-short-name`, `chore/###-short-name`.
Commit Messages: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:` etc.).
PR Checklist MUST confirm: Principles adherence, tests added & passing, coverage thresholds met (global ≥ 80%, critical modules ≥ 90%), lint/format pass, no circular dependencies, updated docs if config or endpoint changed.
CI Pipeline Stages (blocking): 1) Install & Lint, 2) Unit Tests & Coverage, 3) Integration Tests, 4) E2E Tests (P1 endpoints), 5) Security Scan (dependencies & simple static analysis).
Release: Tag with `vX.Y.Z`; generate changelog including API version changes and migration steps. Any MAJOR bump MUST include written migration guide in `docs/migrations/`.
Review Roles: At least one reviewer with module ownership for feature module changes; security-sensitive code requires second reviewer.
Hotfixes: MUST include regression test before tag creation.
Rollback: Document rollback command or procedure in PR if release involves schema migration.

## Governance

Supremacy: This Constitution supersedes conflicting guidance in other docs.
Amendment Process: Open issue describing rationale → Draft PR updating constitution → Impact assessment (affected modules, migration steps) → Reviewer approval (module owner + maintainer) → Merge updates version.
Versioning Policy: Semantic—MAJOR (principle removal or fundamental change), MINOR (new principle/section or material expansion), PATCH (clarifications/typos). This initial adoption sets 1.0.0.
Compliance Reviews: Monthly scheduled review + pre-release audit for each tagged version. Non-compliance items MUST produce remediation tasks before next sprint planning.
Emergency Amendments: Allowed for critical security or stability; MUST include post-mortem within 7 days.
Deviation Justification: Any deviation MUST be documented in PR with alternative considered and why rejected; tracked in `docs/deviations.md` (create if absent).
Enforcement: PR merge blocked until checklist passes; CI MUST enforce test & coverage gates.

**Version**: 1.0.0 | **Ratified**: 2025-10-18 | **Last Amended**: 2025-10-18
