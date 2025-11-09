# Database Schema

## Entity Relationship Diagram

```
┌─────────────────┐
│  browser_types  │
│─────────────────│
│ id (PK)         │
│ name (UNIQUE)   │
│ type            │
│ device_type     │
│ user_agent      │
│ viewport_*      │
│ is_active       │
└────────┬────────┘
         │
         │ 1:N
         │
┌────────▼────────┐      ┌─────────────────┐
│ automation_jobs │      │ browser_workers │
│─────────────────│      │─────────────────│
│ id (PK)         │◄─────┤ id (PK)         │
│ browser_type_id │      │ browser_type_id │
│ target_url      │      │ status          │
│ actions (JSONB) │      │ current_job_id  │
│ status          │      │ last_heartbeat  │
│ priority        │      └─────────────────┘
│ retry_count     │
│ max_retries     │
│ timeout_ms      │
│ result (JSONB)  │
│ error_message   │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────┴────┬──────────────┐
    │         │              │
┌───▼───┐ ┌──▼────┐ ┌───────▼────┐
│ job_  │ │ job_  │ │ api_keys   │
│artifacts│ │logs  │ │            │
│───────│ │──────│ │────────────│
│ id    │ │ id   │ │ id (PK)    │
│ job_id│ │ job_ │ │ key (UNIQUE)│
│ type  │ │ id   │ │ client_id  │
│ path  │ │ level│ │ status     │
│ data  │ │ msg  │ │ rate_limit │
└───────┘ └──────┘ └─────────────┘
```

## Tables

### browser_types

Browser type configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(50) | UNIQUE, NOT NULL | Browser name (e.g., "Chromium") |
| type | VARCHAR(20) | NOT NULL | Browser type: chromium, firefox, webkit |
| device_type | VARCHAR(20) | DEFAULT 'desktop' | Device type: desktop, mobile |
| user_agent | TEXT | NULLABLE | Custom user agent string |
| viewport_width | INTEGER | NULLABLE | Viewport width in pixels |
| viewport_height | INTEGER | NULLABLE | Viewport height in pixels |
| is_active | BOOLEAN | DEFAULT true | Whether browser type is active |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_browser_types_name` on `name`

**Seed Data**: Chromium, Firefox, WebKit (desktop and mobile variants)

### automation_jobs

Job queue and execution records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Job identifier |
| browser_type_id | INTEGER | FK → browser_types | Browser type to use |
| target_url | TEXT | NOT NULL | Target URL for automation |
| actions | JSONB | NOT NULL | Array of action configurations |
| wait_until | VARCHAR(20) | DEFAULT 'networkidle' | Page load strategy |
| status | VARCHAR(20) | DEFAULT 'pending' | Job status |
| priority | INTEGER | DEFAULT 0 | Job priority (0-100) |
| retry_count | INTEGER | DEFAULT 0 | Number of retry attempts |
| max_retries | INTEGER | DEFAULT 3 | Maximum retry attempts |
| timeout_ms | INTEGER | DEFAULT 30000 | Job timeout in milliseconds |
| created_at | TIMESTAMP | DEFAULT NOW() | Job creation time |
| started_at | TIMESTAMP | NULLABLE | Job start time |
| completed_at | TIMESTAMP | NULLABLE | Job completion time |
| error_message | TEXT | NULLABLE | Error message if failed |
| result | JSONB | NULLABLE | Job execution results |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_jobs_status` on `status`
- `idx_jobs_browser_type` on `browser_type_id`
- `idx_jobs_created_at` on `created_at`
- `idx_jobs_priority_created` on `(priority DESC, created_at ASC)` WHERE `status = 'pending'`

**Status Values**: `pending`, `processing`, `completed`, `failed`, `cancelled`

**Wait Until Options**: `load`, `domcontentloaded`, `networkidle`

### job_artifacts

Artifacts generated during job execution (screenshots, PDFs, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Artifact identifier |
| job_id | UUID | FK → automation_jobs | Associated job |
| artifact_type | VARCHAR(50) | NOT NULL | Type: screenshot, pdf, video, trace, data |
| file_path | TEXT | NULLABLE | Filesystem path to artifact |
| file_data | BYTEA | NULLABLE | Binary file data (if stored in DB) |
| mime_type | VARCHAR(100) | NULLABLE | MIME type (e.g., image/png) |
| size_bytes | BIGINT | NULLABLE | File size in bytes |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes**:
- `idx_artifacts_job_id` on `job_id`

**Artifact Types**: `screenshot`, `pdf`, `video`, `trace`, `data`

### job_logs

Execution logs for jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Log entry ID |
| job_id | UUID | FK → automation_jobs | Associated job |
| level | VARCHAR(20) | NOT NULL | Log level: debug, info, warn, error |
| message | TEXT | NOT NULL | Log message |
| metadata | JSONB | NULLABLE | Additional log data |
| created_at | TIMESTAMP | DEFAULT NOW() | Log timestamp |

**Indexes**:
- `idx_logs_job_id` on `job_id`
- `idx_logs_created_at` on `created_at`

**Log Levels**: `debug`, `info`, `warn`, `error`

### browser_workers

Worker instance status tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Worker identifier |
| browser_type_id | INTEGER | FK → browser_types | Browser type worker handles |
| status | VARCHAR(20) | DEFAULT 'idle' | Worker status |
| current_job_id | UUID | FK → automation_jobs | Currently processing job |
| last_heartbeat | TIMESTAMP | DEFAULT NOW() | Last heartbeat timestamp |
| started_at | TIMESTAMP | DEFAULT NOW() | Worker start time |
| metadata | JSONB | NULLABLE | Additional worker metadata |

**Indexes**:
- `idx_workers_status` on `status`
- `idx_workers_browser_type` on `browser_type_id`

**Status Values**: `idle`, `busy`, `offline`

### api_keys

API key authentication records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | API key record ID |
| key | VARCHAR(64) | UNIQUE, NOT NULL | Hashed API key |
| client_id | VARCHAR(255) | NOT NULL | Client identifier |
| name | VARCHAR(255) | NOT NULL | API key name/description |
| status | VARCHAR(20) | DEFAULT 'active' | Key status: active, revoked |
| rate_limit | INTEGER | DEFAULT 100 | Requests per minute |
| is_active | BOOLEAN | DEFAULT true | Whether key is active |
| last_used_at | TIMESTAMP | NULLABLE | Last usage timestamp |
| expires_at | TIMESTAMP | NULLABLE | Expiration timestamp |
| metadata | JSONB | NULLABLE | Additional metadata |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_api_keys_key` on `key`
- `idx_api_keys_client_id` on `client_id`
- `idx_api_keys_status` on `status`
- `idx_api_keys_is_active` on `is_active`

**Status Values**: `active`, `revoked`

### url_policies

URL whitelist/blacklist policies.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Policy identifier |
| pattern | VARCHAR(255) | NOT NULL | URL pattern or domain |
| type | VARCHAR(20) | DEFAULT 'blacklist' | Policy type: whitelist, blacklist |
| description | TEXT | NULLABLE | Policy description |
| is_active | BOOLEAN | DEFAULT true | Whether policy is active |
| metadata | JSONB | NULLABLE | Additional metadata |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_url_policies_type` on `type`
- `idx_url_policies_is_active` on `is_active`

**Policy Types**: `whitelist`, `blacklist`

## Relationships

### One-to-Many

- `browser_types` → `automation_jobs` (1:N)
- `browser_types` → `browser_workers` (1:N)
- `automation_jobs` → `job_artifacts` (1:N, CASCADE DELETE)
- `automation_jobs` → `job_logs` (1:N, CASCADE DELETE)
- `automation_jobs` → `browser_workers` (1:1, current_job_id)

## Query Patterns

### Job Selection (Worker Polling)
```sql
SELECT * FROM automation_jobs
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

### Job Statistics
```sql
SELECT status, COUNT(*) as count
FROM automation_jobs
GROUP BY status;
```

### Worker Health Check
```sql
SELECT * FROM browser_workers
WHERE last_heartbeat < NOW() - INTERVAL '1 minute'
AND status != 'offline';
```

## Migration Strategy

Migrations are managed via TypeORM:
- Location: `src/database/migrations/`
- Naming: `{timestamp}-{Description}.ts`
- Run: `npm run migration:run`
- Revert: `npm run migration:revert`

## Data Retention

- **Jobs**: Configurable cleanup after N days (default: 7)
- **Artifacts**: Deleted with parent job (CASCADE)
- **Logs**: Deleted with parent job (CASCADE)
- **Workers**: Cleaned up on application shutdown

