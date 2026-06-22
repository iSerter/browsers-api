# Task: Seed Default API Credentials at Launch & Protect `/api/v1/jobs*` Endpoints

## Objective
Two related hardening changes:

1. **Seed default credentials at launch.** When the app boots, if a `CLIENT_ID` /
   `API_KEY` pair is supplied via environment variables, automatically create a
   matching `ApiKey` record **only if one does not already exist** (idempotent).
   This lets a freshly deployed instance be usable immediately with a known,
   operator-controlled credential — no manual `POST /admin/api-keys` step.

2. **Protect all job endpoints.** Currently only `POST /api/v1/jobs` requires
   authentication (`@UseGuards(ApiKeyGuard)`). The read/delete/artifact routes
   are open. Apply `ApiKeyGuard` to the whole `JobsController` so every
   `/api/v1/jobs*` route requires a valid API key.

## Current State (verified)

- **API keys are stored in plaintext** in the `api_keys` table.
  `ApiKeysService.generateApiKey()` (`src/modules/api-keys/api-keys.service.ts`)
  always generates a *random* 64-char hex key via `crypto.randomBytes(32)` — there
  is no way today to insert a key with a caller-supplied value.
- **Auth flow** (`src/modules/auth/`): `ApiKeyGuard` extends `AuthGuard('api-key')`,
  reading the key from `x-api-key` or `Authorization: Bearer <key>`. The
  `api-key` Passport strategy calls `ApiKeysService.validateApiKey(token)`, which
  looks the key up by value and checks `isActive` + `status=ACTIVE`. **There is no
  separate `clientId` check** — the `clientId` is just an attribute returned on the
  authenticated principal. So protecting an endpoint = requiring a valid `API_KEY`;
  `CLIENT_ID` is metadata attached to that key.
- **JobsController** (`src/modules/jobs/jobs.controller.ts`): class-level
  `@UseGuards(ThrottlerGuard)`; only `POST` additionally has
  `@UseGuards(ApiKeyGuard)`. `GET /jobs`, `GET /jobs/:id`, `DELETE /jobs/:id`,
  `GET /jobs/:id/artifacts`, `GET /jobs/:id/artifacts/:artifactId` are unauthenticated.
- **Bootstrap** (`src/main.ts`, `src/app.module.ts`): no `OnApplicationBootstrap` /
  `OnModuleInit` hooks, no seed-at-launch logic. Global prefix `api/v1` set via
  `app.setGlobalPrefix()`. Existing seeds (`src/database/seeds/browser-types.seed.ts`)
  are standalone scripts run manually, not wired into startup.
- **Config** (`src/config/validation.schema.ts`): Joi-validated env. Has
  `API_KEY_HEADER` (default `X-API-Key`), rate-limit vars, `API_PREFIX`. **No
  `CLIENT_ID` / `API_KEY` seed vars exist yet.**

## Design Decisions

- **Env var names:** use `SEED_CLIENT_ID` and `SEED_API_KEY` (the `SEED_` prefix
  makes intent unambiguous and avoids collision with the existing `API_KEY_HEADER`
  / runtime auth config). Document them in `.env.example` and README. Both must be
  present to trigger seeding; if only one is set, log a warning and skip.
- **Idempotency:** seeding is skipped if a key with the same `key` value already
  exists (the `key` column is unique). This makes restarts safe.
- **Where seeding runs:** a dedicated provider in the api-keys module implementing
  `OnApplicationBootstrap` (runs after the DB connection and all modules are
  initialized — safer than `OnModuleInit`). Keep `main.ts` untouched.
- **Job protection scope:** apply `ApiKeyGuard` at the controller class level so
  it covers all current and future routes. Remove the now-redundant per-route
  guard on `POST`. Keep `ThrottlerGuard` at class level (guards compose).
  > Note: artifact-download routes (`GET .../artifacts/:artifactId`) will also
  > require auth. This is intentional per the request ("protect `/api/v1/jobs*`").
  > If browser/direct-link download without a header is ever needed, that's a
  > separate follow-up (e.g. signed URLs) — out of scope here.

## Implementation Plan

### 1. Config / env

- `src/config/validation.schema.ts`: add
  - `SEED_CLIENT_ID: Joi.string().optional()`
  - `SEED_API_KEY: Joi.string().optional()`
- `.env.example`: add a documented block, e.g.
  ```env
  # Optional: seed a default API credential on startup (created only if absent)
  SEED_CLIENT_ID=default-client
  SEED_API_KEY=
  ```
- README "Environment Variables" → "Application" or a new "Auth/Seeding" subsection:
  document the two vars and the idempotent behavior.

### 2. Service support for inserting a fixed key

In `src/modules/api-keys/api-keys.service.ts`, add a method that inserts a key with
a **caller-supplied value** (the existing `generateApiKey` cannot do this):

```ts
async ensureApiKey(params: {
  clientId: string;
  key: string;
  name?: string;
  rateLimit?: number;
}): Promise<{ created: boolean; apiKey: ApiKey }> {
  const existing = await this.apiKeyRepository.findOne({ where: { key: params.key } });
  if (existing) return { created: false, apiKey: existing };

  const apiKey = this.apiKeyRepository.create({
    key: params.key,
    clientId: params.clientId,
    name: params.name ?? 'Seeded default key',
    rateLimit: params.rateLimit ?? 100,
    status: ApiKeyStatus.ACTIVE,
    isActive: true,
  });
  return { created: true, apiKey: await this.apiKeyRepository.save(apiKey) };
}
```

(Match the actual repository injection token / field names used in the service.)

### 3. Startup seeder

Create `src/modules/api-keys/api-keys.seeder.ts`:

```ts
@Injectable()
export class ApiKeysSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApiKeysSeeder.name);
  constructor(
    private readonly config: ConfigService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async onApplicationBootstrap() {
    const clientId = this.config.get<string>('SEED_CLIENT_ID');
    const key = this.config.get<string>('SEED_API_KEY');
    if (!clientId || !key) {
      if (clientId || key) {
        this.logger.warn(
          'Both SEED_CLIENT_ID and SEED_API_KEY must be set to seed a default credential — skipping.',
        );
      }
      return;
    }
    const { created } = await this.apiKeysService.ensureApiKey({
      clientId,
      key,
      name: 'Seeded default key',
    });
    this.logger.log(
      created
        ? `Seeded default API key for clientId="${clientId}".`
        : `Default API key for clientId="${clientId}" already exists — skipping.`,
    );
  }
}
```

Register `ApiKeysSeeder` in `ApiKeysModule` providers (it already provides
`ApiKeysService`; ensure `ConfigModule` is available — it's global). Never log the
key value.

### 4. Protect job endpoints

In `src/modules/jobs/jobs.controller.ts`:

```ts
@Controller('jobs')
@UseGuards(ThrottlerGuard, ApiKeyGuard)   // <- add ApiKeyGuard at class level
export class JobsController {
  ...
  @Post()
  // remove the now-redundant @UseGuards(ApiKeyGuard) here
  @HttpCode(HttpStatus.CREATED)
  async createJob(...) { ... }
```

All other routes inherit the guard automatically — no per-route changes needed.

## Testing

- **Unit:**
  - `ApiKeysService.ensureApiKey` — creates when absent; returns `created:false` and
    does not duplicate when the key already exists.
  - `ApiKeysSeeder.onApplicationBootstrap` — seeds when both vars set; skips (with
    warning) when only one set; skips silently when neither set; idempotent on
    second boot.
- **E2E** (`test/`):
  - With seeding vars set, after boot a `GET /api/v1/jobs` with
    `x-api-key: <SEED_API_KEY>` returns 200; without the header returns 401.
  - `GET /api/v1/jobs/:id`, `DELETE`, and artifact routes return 401 without a key
    and succeed with the seeded key (regression for the new class-level guard).
  - Restarting the app does not create a second key for the same value.

## Security Considerations

- API keys remain plaintext in the DB (pre-existing). Seeding does not worsen this,
  but note as a known limitation; a future task could hash keys at rest.
- `SEED_API_KEY` is a long-lived shared secret — document that it should be a
  high-entropy value and rotated via `POST /admin/api-keys` + revoke for production.
- Ensure the seeder/logs never print the key value.
- Confirm `/admin/api-keys` access expectations are unchanged (out of scope, but
  worth noting it remains unguarded today).

## Addendum: Protect the Admin API (`/admin/*`)

The `/admin/api-keys*` endpoints (create/list/revoke keys and URL policies) were
unauthenticated — anyone reaching the service could mint credentials. Added an
admin-password guard.

- **Env:** `ADMIN_PASSWORD` (optional in Joi, `src/config/validation.schema.ts`;
  documented in `.env.example` and README).
- **Guard:** `src/modules/auth/guards/admin.guard.ts` — `AdminGuard implements
  CanActivate`, injects `ConfigService`. **Fail-closed**: if `ADMIN_PASSWORD` is
  unset/empty it throws `503 ServiceUnavailableException` ("Admin API is
  disabled"). Otherwise it reads the password from `X-Admin-Password` or
  `Authorization: Bearer <value>` and compares with `crypto.timingSafeEqual`
  (length-guarded, constant-time). Wrong/missing → `401`.
- **Applied:** class-level `@UseGuards(AdminGuard)` on `ApiKeysController`
  (`@Controller('admin/api-keys')`), covering all current and future admin routes.
- **DI:** `AdminGuard` registered in `ApiKeysModule` providers.
- **Tests:** `admin.guard.spec.ts` — fail-closed when unset/empty, accepts correct
  password via both header forms, rejects wrong/missing/length-mismatched.
- **Note:** pairs with credential seeding so production never needs to open the
  admin API; seed a key via env and leave `ADMIN_PASSWORD` set for rotation only.

## Out of Scope / Follow-ups

- Hashing API keys at rest.
- Per-admin-user accounts / audit log (current model is a single shared password).
- Signed/unauthenticated artifact download links.
