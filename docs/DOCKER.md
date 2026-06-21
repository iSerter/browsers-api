# Docker Setup Guide

This guide covers Docker containerization for the Browsers API project, including local development, production deployment, and Docker Hub publishing.

## Quick Start

### Prerequisites
- Docker CLI ≥ 24
- Docker Compose ≥ 2.0
- 4GB+ RAM available for Docker
- Access to Docker Hub (for publishing)

### Local Development

1. **Using Docker Compose (Recommended)**
   ```bash
   # Start the full stack (PostgreSQL + API)
   ./scripts/docker-dev.sh start
   
   # Run migrations
   ./scripts/docker-dev.sh migrate
   
   # Run seeds
   ./scripts/docker-dev.sh seed
   
   # View logs
   ./scripts/docker-dev.sh logs
   
   # Stop the stack
   ./scripts/docker-dev.sh stop
   ```

2. **Using Docker Commands Directly**
   ```bash
   # Start the app + bundled PostgreSQL (default port 3333).
   # The bundled DB is gated behind the "with-db" profile; the helper script
   # enables it automatically, but with raw compose you opt in explicitly:
   COMPOSE_PROFILES=with-db docker compose up -d

   # App only, using an external database (set DB_HOST/DB_* first):
   docker compose up -d

   # Start with custom port (set PORT in .env or export before running)
   PORT=8080 COMPOSE_PROFILES=with-db docker compose up -d

   # Stop services
   docker compose down

   # View logs
   docker compose logs -f api
   ```

   > Host ports (`3333`, `9091`, `5432`) are published only for local
   > development, via `docker-compose.override.yml` — which the `docker compose`
   > CLI merges automatically. Production deployments use the base
   > `docker-compose.yml` only (no host port bindings; the reverse proxy routes
   > traffic). See [Production Deployment](#production-deployment).

## Environment Variables

The application requires the following environment variables. Sensible defaults
live in `docker-compose.yml`, but every value can be overridden via a `.env`
file (local) or your platform's environment settings (e.g. Coolify).

> **Database:** the `DB_*` defaults target the bundled `postgres` service. To
> use an external PostgreSQL, set `DB_HOST` (and the other `DB_*` values) and
> leave the bundled database disabled (the default — it only starts with the
> `with-db` compose profile).

### Required Variables

#### Application
- `NODE_ENV`: Environment mode (development/production)
- `PORT`: Application port (default: 3333, configurable)
- `API_PREFIX`: API route prefix (default: api/v1)

#### Database
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_USERNAME`: Database user
- `DB_PASSWORD`: Database password
- `DB_DATABASE`: Database name

#### Worker Configuration
- `WORKER_POLL_INTERVAL_MS`: Job polling interval (default: 1000)
- `WORKER_MAX_CONCURRENT_JOBS`: Max concurrent jobs (default: 10)
- `BROWSER_POOL_MIN_SIZE`: Minimum browser instances (default: 1)
- `BROWSER_POOL_MAX_SIZE`: Maximum browser instances (default: 5)
- `BROWSER_IDLE_TIMEOUT_MS`: Browser idle timeout (default: 300000)

#### Job Configuration
- `DEFAULT_JOB_TIMEOUT_MS`: Default job timeout (default: 30000)
- `MAX_JOB_RETRIES`: Maximum retry attempts (default: 3)
- `JOB_CLEANUP_AFTER_DAYS`: Job retention period (default: 7)

#### Storage
- `ARTIFACT_STORAGE_TYPE`: Storage type (filesystem)
- `ARTIFACT_STORAGE_PATH`: Artifact storage path
- `MAX_ARTIFACT_SIZE_MB`: Max artifact size (default: 50)

#### Playwright
- `PLAYWRIGHT_HEADLESS`: Run browsers headless (default: true)
- `PLAYWRIGHT_TIMEOUT_MS`: Operation timeout (default: 30000)
- `PLAYWRIGHT_SCREENSHOTS_DIR`: Screenshot directory

#### Security
- `API_KEY_HEADER`: API key header name (default: X-API-Key)
- `RATE_LIMIT_MAX`: Rate limit max requests (default: 100)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window (default: 60000)

#### Monitoring
- `ENABLE_METRICS`: Enable Prometheus metrics (default: true)
- `METRICS_PORT`: Metrics endpoint port (default: 9090)
- `LOG_LEVEL`: Logging level (info/debug/warn/error)

## Building the Image

### Standard Build
```bash
docker build -t browsers-api:latest .
```

### Build with Custom Tag
```bash
docker build -t browsers-api:v1.0.0 .
```

### Build Arguments (if needed)
```bash
docker build \
  --build-arg NODE_VERSION=20 \
  -t browsers-api:latest .
```

## Running the Container

### Run with Environment File
```bash
docker run --rm \
  -p 3333:3333 \
  --env-file ./.env \
  browsers-api:latest
```

### Run with Inline Environment Variables
```bash
docker run --rm \
  -p 3333:3333 \
  -e NODE_ENV=production \
  -e PORT=3333 \
  -e DB_HOST=your-db-host \
  -e DB_PORT=5432 \
  -e DB_USERNAME=user \
  -e DB_PASSWORD=pass \
  -e DB_DATABASE=browser_automation \
  browsers-api:latest
```

### Run with Custom Port
```bash
# Use a different port by setting PORT environment variable
docker run --rm \
  -p 8080:8080 \
  -e PORT=8080 \
  --env-file ./.env \
  browsers-api:latest
```

### Run as Detached Container
```bash
docker run -d \
  --name browsers-api \
  -p 3333:3333 \
  --env-file ./.env \
  browsers-api:latest
```

### Run with Volume Mounts
```bash
docker run --rm \
  -p 3333:3333 \
  -v $(pwd)/artifacts:/app/artifacts \
  -v $(pwd)/screenshots:/app/screenshots \
  --env-file ./.env \
  browsers-api:latest
```

## Database Operations

### Run Migrations
```bash
# Using docker-compose
docker-compose run --rm api npm run migration:run

# Using standalone container
docker run --rm \
  --env-file ./.env \
  browsers-api:latest \
  npm run migration:run
```

### Generate Migration
```bash
docker-compose run --rm api npm run migration:generate -- src/database/migrations/MigrationName
```

### Revert Migration
```bash
docker-compose run --rm api npm run migration:revert
```

### Run Seeds
```bash
docker-compose run --rm api npm run seed
```

## Docker Hub Publishing

### 1. Authenticate
```bash
docker login --username <dockerhub-username>
# Enter password when prompted
```

### 2. Tag Image for Docker Hub
```bash
# Latest tag
docker tag browsers-api:latest <dockerhub-username>/browsers-api:latest

# Version tag
docker tag browsers-api:latest <dockerhub-username>/browsers-api:v1.0.0

# Both
docker tag browsers-api:latest <dockerhub-username>/browsers-api:latest
docker tag browsers-api:latest <dockerhub-username>/browsers-api:v1.0.0
```

### 3. Push to Docker Hub
```bash
# Push latest
docker push <dockerhub-username>/browsers-api:latest

# Push version
docker push <dockerhub-username>/browsers-api:v1.0.0

# Push all tags
docker push <dockerhub-username>/browsers-api --all-tags
```

### 4. Verify Publication
```bash
# Pull from another machine
docker pull <dockerhub-username>/browsers-api:latest

# Verify at
https://hub.docker.com/r/<dockerhub-username>/browsers-api
```

## Multi-Stage Build Explanation

The Dockerfile uses a multi-stage build for optimization:

1. **Builder Stage**
   - Based on `mcr.microsoft.com/playwright:v1.56.1-jammy`
   - Installs all dependencies (including devDependencies)
   - Builds the TypeScript application
   - Produces optimized `/app/dist` directory

2. **Runner Stage**
   - Also uses Playwright base image (includes browsers)
   - Copies only production dependencies
   - Copies built artifacts from builder
   - Sets production environment
   - Minimal final image with all runtime requirements

## Health Checks

The container includes a built-in health check:
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Start Period**: 40 seconds
- **Retries**: 3

Check container health:
```bash
docker inspect --format='{{.State.Health.Status}}' browsers-api
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs browsers-api

# Check with docker-compose
docker-compose logs api
```

### Database Connection Issues
```bash
# Verify the bundled database is running (it lives behind the with-db profile)
docker compose --profile with-db ps postgres

# Check database health
docker compose --profile with-db exec postgres pg_isready -U automation_user

# Using an external database? Confirm DB_HOST/DB_PORT are reachable from the
# api container instead:
docker compose exec api node -e "require('net').connect(Number(process.env.DB_PORT||5432), process.env.DB_HOST).on('connect',()=>{console.log('ok');process.exit(0)}).on('error',e=>{console.error(e.message);process.exit(1)})"
```

### Port Already in Use
```bash
# Find process using port 3333
lsof -i :3333

# Use different port by setting PORT environment variable
docker run -p 8080:8080 -e PORT=8080 ...
```

### Browser Automation Fails
```bash
# Ensure sufficient resources
docker stats

# Check Playwright installation
docker-compose exec api npx playwright --version
```

### Clear Everything and Start Fresh
```bash
./scripts/docker-dev.sh clean
./scripts/docker-dev.sh start
```

## Production Deployment

In production the `docker-compose.yml` runs **only the `api` service** — the
bundled PostgreSQL stays disabled (`with-db` profile) and no host ports are
published (`docker-compose.override.yml` is not merged when you pass an explicit
`-f`). Provide a database via `DB_*` environment variables and let your reverse
proxy route to the container's exposed port `3333`.

### Using Coolify (v4)

1. Create a **Docker Compose** resource pointing at this repository.
2. Set **environment variables**: `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
   `DB_PASSWORD`, `DB_DATABASE` (your external PostgreSQL), plus any captcha /
   proxy keys. Leave `COMPOSE_PROFILES` empty to keep the bundled DB off.
3. Enable **Connect to Predefined Network** so the container can reach your
   PostgreSQL service (make sure that DB is attached to the same network).
4. Set the **domain** for the `api` service, mapped to container port `3333`.
   Coolify's proxy handles TLS and routing — no host port binding required.
5. Migrations run automatically on boot (`RUN_MIGRATIONS=true`); set it to
   `false` to manage them manually.

To run the bundled PostgreSQL on the same stack instead of an external one, set
`COMPOSE_PROFILES=with-db` and keep the default `DB_HOST=postgres`.

### Using Docker Swarm
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml browsers-api

# Scale services
docker service scale browsers-api_api=3
```

### Using Kubernetes
```bash
# Generate Kubernetes manifests (using kompose)
kompose convert -f docker-compose.yml

# Apply to cluster
kubectl apply -f .
```

### Resource Limits (Production)
```yaml
# In docker-compose.yml or deployment config
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Security Considerations

1. **Never commit .env files** with real credentials
2. **Use Docker secrets** for production deployments
3. **Scan images** for vulnerabilities:
   ```bash
   docker scan browsers-api:latest
   ```
4. **Run as non-root** user (consider adding in Dockerfile)
5. **Use specific version tags** instead of `latest` in production

## CI/CD Integration

Image publishing is **manual** — there is no automated Docker build/push
workflow. Release tagging is handled by `.github/workflows/release-please.yml`
(conventional commits → version bump, `CHANGELOG.md`, and a `v*` tag). To ship
an image, build and push it yourself:

```bash
docker build -t <dockerhub-username>/browsers-api:<tag> .
docker push <dockerhub-username>/browsers-api:<tag>
```

If you later want this automated, add a workflow that triggers on `v*` tags and
runs `docker/build-push-action` with `DOCKER_USERNAME` / `DOCKER_PASSWORD`
secrets.

## Helper Scripts

The project includes `scripts/docker-dev.sh` for common operations:

```bash
# Available commands
./scripts/docker-dev.sh build    # Build image
./scripts/docker-dev.sh start    # Start stack
./scripts/docker-dev.sh stop     # Stop stack
./scripts/docker-dev.sh logs     # View logs
./scripts/docker-dev.sh migrate  # Run migrations
./scripts/docker-dev.sh seed     # Run seeds
./scripts/docker-dev.sh clean    # Clean up
./scripts/docker-dev.sh help     # Show help
```

## Support

For issues or questions:
- Check container logs: `docker-compose logs api`
- Verify configuration: `docker-compose config`
- Review environment variables in `.env`
- Ensure Docker has sufficient resources allocated
