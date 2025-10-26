# Task 8 Implementation Summary: API Authentication and Rate Limiting

## Overview
Implemented a comprehensive API authentication and rate limiting system with database-backed API keys, URL policy management, and request logging.

## Components Implemented

### 1. Entities Created

#### ApiKey Entity (`src/modules/api-keys/entities/api-key.entity.ts`)
- **Fields:**
  - `id`: UUID primary key
  - `key`: Unique 64-character hex string (indexed)
  - `clientId`: Client identifier string
  - `name`: Human-readable API key name
  - `status`: Enum (ACTIVE/REVOKED)
  - `rateLimit`: Requests per minute (default: 100)
  - `isActive`: Boolean flag
  - `lastUsedAt`: Timestamp of last usage
  - `expiresAt`: Optional expiration timestamp
  - `metadata`: JSONB field for additional data
  - `createdAt`, `updatedAt`: Timestamps

#### UrlPolicy Entity (`src/modules/api-keys/entities/url-policy.entity.ts`)
- **Fields:**
  - `id`: UUID primary key
  - `pattern`: URL pattern/domain string
  - `type`: Enum (WHITELIST/BLACKLIST)
  - `description`: Optional description
  - `isActive`: Boolean flag
  - `metadata`: JSONB field
  - `createdAt`, `updatedAt`: Timestamps

### 2. API Key Service (`src/modules/api-keys/api-keys.service.ts`)

**Methods:**
- `generateApiKey(dto)`: Creates cryptographically secure API key using `crypto.randomBytes(32)`
- `validateApiKey(key)`: Validates key exists, is active, and not expired
- `revokeApiKey(id)`: Sets key to inactive/revoked
- `findAllApiKeys()`: Lists all API keys
- `findApiKeyById(id)`: Gets specific API key

**URL Policy Methods:**
- `createUrlPolicy(dto)`: Creates whitelist/blacklist policy
- `checkUrlAllowed(url)`: Validates URL against policies
  - Blacklist check: If URL matches blacklist pattern → blocked
  - Whitelist check: If whitelist exists, URL must match one pattern
  - Pattern matching supports wildcards (`*`)
- `findAllUrlPolicies()`: Lists all policies
- `deleteUrlPolicy(id)`: Removes policy
- `deleteApiKey(id)`: Deletes API key

### 3. Authentication Guard (`src/modules/auth/guards/api-key.guard.ts`)

**Features:**
- Extracts API key from `X-API-Key` header or `Authorization: Bearer {key}` header
- Validates key using ApiKeysService
- Attaches client info to request object
- Returns 401 Unauthorized for invalid/missing keys
- Extends Passport's AuthGuard

### 4. Passport Strategy (`src/modules/auth/strategies/api-key.strategy.ts`)

**Features:**
- Uses `passport-http-bearer` strategy
- Validates token via ApiKeysService
- Returns user object with API key details:
  - apiKeyId
  - clientId
  - name
  - rateLimit

### 5. Throttle Configuration (`src/modules/auth/config/throttle.config.ts`)

**Rate Limits:**
- **Short:** 10 requests per 1 second
- **Medium:** 50 requests per 10 seconds
- **Long:** 100 requests per 1 minute (default per API key)

### 6. Admin Controller (`src/modules/api-keys/api-keys.controller.ts`)

**Endpoints:**
- `POST /admin/api-keys`: Generate new API key (returns key immediately)
- `GET /admin/api-keys`: List all API keys (without sensitive key)
- `GET /admin/api-keys/:id`: Get specific API key details
- `DELETE /admin/api-keys/:id`: Revoke API key
- `GET /admin/api-keys/url-policies`: List all URL policies
- `POST /admin/api-keys/url-policies`: Create URL policy
- `GET /admin/api-keys/url-policies/:id`: Get specific policy
- `DELETE /admin/api-keys/url-policies/:id`: Delete policy

### 7. Request Logging Middleware (`src/modules/auth/middleware/request-logger.middleware.ts`)

**Features:**
- Logs request start with method, URL, client, user agent, IP
- Logs request completion with status code and duration
- Extracts client info from headers
- Console-based logging (can be extended for database storage)

### 8. Module Integration

**AppModule Updates:**
- Added `ThrottlerModule.forRoot(throttleConfig)`
- Imported `ApiKeysModule`

**JobsModule Updates:**
- Imported `ApiKeysModule`
- Injected `ApiKeysService` into `JobsController`

**JobsController Updates:**
- Applied `@UseGuards(ThrottlerGuard)` at controller level
- Applied `@UseGuards(ApiKeyGuard)` on `POST /jobs` endpoint
- Added URL policy validation before job creation
- Returns 403 Forbidden for blocked URLs

**ApiKeysModule:**
- Includes entities: `ApiKey`, `UrlPolicy`
- Provides: `ApiKeysService`, `ApiKeyStrategy`
- Controller: `ApiKeysController`
- Exports: `ApiKeysService`

## URL Policy Logic

### Blacklist (Default)
- Blocks URLs matching blacklist patterns
- Example: Block all URLs containing "malicious-site.com"

### Whitelist
- If any whitelist policies exist, URL must match at least one
- If whitelist exists and URL doesn't match → blocked
- Example: Only allow URLs from "example.com" and "subdomain.example.com"

### Pattern Matching
Supports wildcard patterns:
- `*example.com` → matches example.com, subdomain.example.com
- `example.com*` → matches example.com/anything
- `*example*` → matches anything containing "example"

## Security Features

1. **Cryptographically Secure Keys:** Generated using `crypto.randomBytes(32)`
2. **Key Expiration:** Optional expiresAt timestamp
3. **Key Revocation:** Status-based (ACTIVE/REVOKED)
4. **Rate Limiting:** Per-client limits configurable
5. **URL Policy Enforcement:** Whitelist/blacklist support
6. **Request Logging:** Tracks all API usage
7. **Last Used Tracking:** Monitors API key usage

## Dependencies Installed

- `@nestjs/throttler`: Rate limiting
- `@nestjs/passport`: Authentication framework
- `passport`: Core Passport
- `passport-http-bearer`: Bearer token strategy
- `@types/passport`, `@types/passport-http-bearer`: TypeScript definitions

## Usage Examples

### Generate API Key
```bash
POST /admin/api-keys
{
  "clientId": "client-123",
  "name": "Production API Key",
  "rateLimit": 200,
  "expiresAt": "2025-12-31T00:00:00Z"
}

Response:
{
  "id": "...",
  "key": "abc123...",  // Only shown once!
  "clientId": "client-123",
  "name": "Production API Key",
  "rateLimit": 200
}
```

### Create Job with API Key
```bash
POST /jobs
Headers: X-API-Key: <your-api-key>
Body: {
  "browserTypeId": 1,
  "targetUrl": "https://example.com",
  "actions": [...]
}
```

### URL Policy Examples
```bash
# Block malicious sites
POST /admin/api-keys/url-policies
{
  "pattern": "malicious-site.com",
  "type": "blacklist"
}

# Whitelist specific domain
POST /admin/api-keys/url-policies
{
  "pattern": "example.com",
  "type": "whitelist"
}
```

## Next Steps

- [ ] Create database migration for ApiKey and UrlPolicy entities
- [ ] Implement Redis backend for distributed rate limiting
- [ ] Add request logging to database (separate RequestLog entity)
- [ ] Add API key usage analytics dashboard
- [ ] Implement key rotation mechanism
- [ ] Add webhook notifications for API key events
- [ ] Implement OAuth2 integration as alternative auth method

