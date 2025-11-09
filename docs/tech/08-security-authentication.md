# Security & Authentication

## Authentication Architecture

The API uses **API Key authentication** via Bearer tokens in the `X-API-Key` header.

```
Client Request
    │
    ├─► X-API-Key Header
    │
    ├─► ApiKeyGuard
    │   │
    │   ├─► Extract API Key
    │   │
    │   ├─► ApiKeyStrategy.validate()
    │   │   │
    │   │   ├─► Query Database
    │   │   │
    │   │   ├─► Check Status (active/revoked)
    │   │   │
    │   │   ├─► Check Expiration
    │   │   │
    │   │   └─► Update last_used_at
    │   │
    │   └─► Attach to Request
    │
    └─► Controller Handler
```

## API Key Management

### Key Structure

API keys are stored in the `api_keys` table:

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  key VARCHAR(64) UNIQUE,        -- Hashed key
  client_id VARCHAR(255),        -- Client identifier
  name VARCHAR(255),            -- Key name/description
  status VARCHAR(20),            -- active | revoked
  rate_limit INTEGER,            -- Requests per minute
  is_active BOOLEAN,             -- Active flag
  last_used_at TIMESTAMP,        -- Last usage timestamp
  expires_at TIMESTAMP,          -- Expiration date
  metadata JSONB                 -- Additional metadata
);
```

### Key Validation

```typescript
async validate(apiKey: string): Promise<ApiKey | null> {
  // 1. Find key in database
  const key = await this.apiKeysRepository.findOne({
    where: { key: hashApiKey(apiKey), isActive: true }
  });
  
  // 2. Check status
  if (!key || key.status !== ApiKeyStatus.ACTIVE) {
    return null;
  }
  
  // 3. Check expiration
  if (key.expiresAt && key.expiresAt < new Date()) {
    return null;
  }
  
  // 4. Update last used
  key.lastUsedAt = new Date();
  await this.apiKeysRepository.save(key);
  
  return key;
}
```

### Key Hashing

API keys are hashed before storage:

```typescript
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
```

**Security Note**: Keys should be hashed using a secure one-way hash function. The original key is never stored.

## URL Policy System

### Policy Types

- **Whitelist**: Only allowlisted URLs are permitted
- **Blacklist**: All URLs except blocklisted are permitted

### Policy Structure

```sql
CREATE TABLE url_policies (
  id UUID PRIMARY KEY,
  pattern VARCHAR(255),          -- URL pattern or domain
  type VARCHAR(20),              -- whitelist | blacklist
  description TEXT,              -- Policy description
  is_active BOOLEAN,             -- Active flag
  metadata JSONB                 -- Additional metadata
);
```

### Policy Enforcement

```typescript
async checkUrlAllowed(url: string): Promise<boolean> {
  const policies = await this.urlPolicyRepository.find({
    where: { isActive: true }
  });
  
  const whitelist = policies.filter(p => p.type === 'whitelist');
  const blacklist = policies.filter(p => p.type === 'blacklist');
  
  // If whitelist exists, URL must match
  if (whitelist.length > 0) {
    return whitelist.some(p => this.matchesPattern(url, p.pattern));
  }
  
  // If blacklist exists, URL must not match
  if (blacklist.length > 0) {
    return !blacklist.some(p => this.matchesPattern(url, p.pattern));
  }
  
  // No policies = allow all
  return true;
}
```

### Pattern Matching

Supports:
- **Exact domain**: `example.com`
- **Subdomain wildcard**: `*.example.com`
- **Path patterns**: `example.com/admin/*`
- **Full URL**: `https://example.com/api/*`

## Rate Limiting

### Configuration

Per-API-key rate limits:

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,                    // Time window (seconds)
      limit: 100,                 // Requests per window
    })
  ]
})
```

### Per-Key Limits

API keys can have custom rate limits:

```typescript
{
  rate_limit: 200  // 200 requests per minute
}
```

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642680000
```

### Throttle Guard

Applied globally via `@UseGuards(ThrottlerGuard)`:

```typescript
@Controller('jobs')
@UseGuards(ThrottlerGuard)
export class JobsController {
  // All endpoints are rate-limited
}
```

## Input Validation

### DTO Validation

All request bodies are validated using `class-validator`:

```typescript
export class CreateJobDto {
  @IsInt()
  @Min(1)
  browserTypeId: number;

  @IsUrl({ require_protocol: true })
  targetUrl: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  actions: ActionConfigDto[];
}
```

### Validation Pipe

Global validation pipe configured in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // Strip unknown properties
    transform: true,              // Transform to DTO instances
    forbidNonWhitelisted: true,   // Reject unknown properties
    transformOptions: {
      enableImplicitConversion: true
    }
  })
);
```

## SQL Injection Prevention

### Parameterized Queries

TypeORM uses parameterized queries by default:

```typescript
// ✅ Safe
await repository.find({
  where: { status: userInput }
});

// ✅ Safe
await queryBuilder
  .where('status = :status', { status: userInput })
  .getMany();

// ❌ Never do this
await query(`SELECT * FROM jobs WHERE status = '${userInput}'`);
```

### Query Builder

TypeORM Query Builder prevents SQL injection:

```typescript
const jobs = await this.jobRepository
  .createQueryBuilder('job')
  .where('job.status = :status', { status: 'pending' })
  .andWhere('job.browserTypeId = :browserTypeId', { browserTypeId })
  .getMany();
```

## CORS Configuration

### Setup

CORS is enabled with configurable origins:

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true
});
```

### Production Recommendations

- Set specific origins instead of `*`
- Use environment variables for configuration
- Enable credentials only when needed

## Security Headers

### Recommended Headers

Consider adding security headers:

```typescript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

## Error Handling

### Secure Error Messages

Errors should not expose sensitive information:

```typescript
// ✅ Good
throw new NotFoundException('Job not found');

// ❌ Bad
throw new Error(`Job ${jobId} not found for user ${userId} with key ${apiKey}`);
```

### Exception Filter

Global exception filter standardizes error responses:

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Format error response
    // Log error details
    // Return sanitized error to client
  }
}
```

## Best Practices

### 1. API Key Security

- **Never log API keys**: Hash keys before logging
- **Use HTTPS**: Always use TLS in production
- **Rotate keys**: Implement key rotation policy
- **Monitor usage**: Track unusual API key activity

### 2. URL Policies

- **Default deny**: Use whitelist when possible
- **Regular review**: Audit policies periodically
- **Pattern testing**: Test patterns before deployment

### 3. Rate Limiting

- **Per-key limits**: Configure appropriate limits
- **Monitor abuse**: Alert on rate limit violations
- **Graceful degradation**: Return 429 with retry info

### 4. Input Validation

- **Validate all inputs**: Use DTOs and validators
- **Sanitize URLs**: Validate URL format and protocol
- **Limit action arrays**: Prevent excessive action counts

### 5. Database Security

- **Connection encryption**: Use SSL for database connections
- **Least privilege**: Database user with minimal permissions
- **Regular updates**: Keep PostgreSQL updated

### 6. Logging

- **No sensitive data**: Don't log API keys, passwords
- **Structured logging**: Use structured log format
- **Log retention**: Implement log retention policies

## Security Checklist

- [ ] API keys are hashed before storage
- [ ] URL policies are enforced on all job creation
- [ ] Rate limiting is configured and tested
- [ ] Input validation is applied to all endpoints
- [ ] SQL injection prevention via parameterized queries
- [ ] CORS is configured appropriately
- [ ] Error messages don't expose sensitive data
- [ ] HTTPS is enforced in production
- [ ] Database connections use SSL
- [ ] Logs don't contain sensitive information

