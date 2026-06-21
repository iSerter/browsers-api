# AGENTS.md

Concise orientation for AI coding agents working in this repository. For deeper
detail see `README.md` and `docs/` (especially `docs/tech/` and `docs/DOCKER.md`).

## What this is

**Browsers API** — an HTTP API for browser automation built on **NestJS 11**
(TypeScript) + **Playwright**. It follows a producer–consumer pattern: API
requests create **jobs** queued in **PostgreSQL**, which background **workers**
process using a pooled set of Playwright browsers. Includes a captcha-solving
subsystem (2Captcha / AntiCaptcha / CapMonster) and Prometheus metrics.

## Tech stack

- Runtime: Node.js 20, TypeScript 5
- Framework: NestJS 11 (`@nestjs/*`), Express platform, Socket.IO for WS
- DB / ORM: PostgreSQL 15, TypeORM 0.3 (migrations in `src/database/migrations`)
- Browser: Playwright 1.56 (Docker image `mcr.microsoft.com/playwright:v1.56.1-jammy`)
- Auth: Passport HTTP Bearer (API keys), `@nestjs/throttler` rate limiting
- Observability: `winston` logging, `prom-client` / `@willsoto/nestjs-prometheus`
- Validation: `class-validator` + `joi` (env schema in `src/config/validation.schema.ts`)

## Layout

```
src/
  main.ts            # bootstrap: global prefix (api/v1), global ValidationPipe, Swagger at /api/docs
  app.module.ts      # root module wiring
  config/            # config + joi env validation (database.config.ts, validation.schema.ts)
  database/          # data-source.ts, migrations/, seeds/
  common/            # middleware, guards (incl. health indicators), shared services (logger)
  modules/
    jobs/            # job CRUD + DTOs (the core queue API)
    workers/         # background job processors
    browsers/        # Playwright browser pool / lifecycle
    actions/         # browser action implementations (navigate, screenshot, executeScript, ...)
    captcha-solver/  # provider-abstracted captcha solving (see docs/captcha-solver/)
    api-keys/ auth/  # API-key issuance + bearer auth
    admin/ health/ metrics/
test/                # e2e + integration specs (jest-e2e.json)
```

## Key conventions

- **Routes** are under the global prefix `api/v1` (e.g. health is `GET /api/v1/health`).
  Swagger UI is served at `/api/docs` (not under the prefix).
- **Validation pipe** is global with `whitelist`, `forbidNonWhitelisted`, and
  `transform: true` — every request body must be a decorated DTO; unknown
  properties are rejected. Add/maintain DTOs in each module's `dto/`.
- **New env vars** must be added to `src/config/validation.schema.ts` (joi) or the
  app fails to boot, and documented in `.env.example`.
- **Schema changes**: edit entities, then `npm run migration:generate -- src/database/migrations/<Name>`.
  Migrations are NOT auto-generated at runtime; they run on startup via the
  entrypoint (`RUN_MIGRATIONS=true`) or `npm run migration:run`. Do not rely on
  `synchronize` (enabled only outside production).
- **Tests** are colocated `*.spec.ts` (unit, `jest`) and `test/*.e2e-spec.ts`
  (e2e, `jest -c test/jest-e2e.json`), run with `ts-jest`.
- **Commits**: this repo uses **Conventional Commits** (release-please drives
  versioning/changelog). Prefix with `feat:`, `fix:`, `docs:`, etc.

## Common commands

```bash
npm run start:dev          # watch-mode dev server (needs a reachable PostgreSQL)
npm run build              # nest build -> dist/
npm test                   # unit tests
npm run test:e2e           # e2e tests
npm run lint               # eslint --fix
npm run format             # prettier
npm run migration:run      # apply pending migrations
npm run seed               # seed browser types

# Docker (local full stack incl. bundled PostgreSQL):
./scripts/docker-dev.sh start | logs | migrate | seed | stop | clean
```

## Docker / deployment

- **`docker-compose.yml`** is the base stack used in production. Only the `api`
  service runs by default; ports are exposed **internally** (no host binding).
- **PostgreSQL is optional** — the bundled `postgres` service is gated behind the
  `with-db` compose profile (`COMPOSE_PROFILES=with-db`). Production points
  `DB_HOST`/`DB_*` at an external database.
- **`docker-compose.override.yml`** publishes host ports (3333, 9091→9090, 5432)
  for local dev only; the `docker compose` CLI merges it automatically, but an
  explicit `-f docker-compose.yml` (e.g. Coolify) does not.
- **Coolify (v4)** is the target deploy: Docker Compose resource, external DB via
  env vars, "Connect to Predefined Network" to reach the DB, domain → port 3333.
  See the Production Deployment section of `docs/DOCKER.md`.
- **Releases**: `.github/workflows/release-please.yml` manages versioning/tags.
  Docker image publishing is **manual** (`docker build` / `docker push`).

## Gotchas

- The app won't boot if required env vars are missing (joi validation) or the DB
  is unreachable (entrypoint waits, then migrations run).
- `ENABLE_EXECUTE_SCRIPT=true` permits arbitrary in-browser JS — security
  sensitive; keep it gated behind trusted callers.
- Playwright needs the browser image / system deps; run non-Docker tests after
  `npm run test:setup` (`npx playwright install`).
- Health endpoint pings the DB, so it reports unhealthy until the database is up.
