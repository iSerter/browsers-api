# Docker Quick Reference

## Using the Helper Script (Recommended)

```bash
./scripts/docker-dev.sh start     # Start full stack
./scripts/docker-dev.sh stop      # Stop stack
./scripts/docker-dev.sh logs      # View logs
./scripts/docker-dev.sh migrate   # Run migrations
./scripts/docker-dev.sh seed      # Run seeds
./scripts/docker-dev.sh build     # Build image
./scripts/docker-dev.sh clean     # Clean up everything
```

## Manual Docker Commands

### Build & Run

```bash
# Build image
docker build -t browsers-api:latest .

# Run with env file (default port 3333)
docker run --rm -p 3333:3333 --env-file ./.env browsers-api:latest

# Run detached
docker run -d --name browsers-api -p 3333:3333 --env-file ./.env browsers-api:latest

# Run with custom port
docker run --rm -p 8080:8080 -e PORT=8080 --env-file ./.env browsers-api:latest
```

### Docker Compose

```bash
# Start app + bundled PostgreSQL (migrations run automatically on startup).
# The bundled DB is opt-in via the "with-db" profile:
COMPOSE_PROFILES=with-db docker compose up -d

# App only, against an external DB (set DB_HOST/DB_* first):
docker compose up -d

# Stop stack
docker compose down

# View logs
docker compose logs -f api

# Run migrations manually (if RUN_MIGRATIONS=false)
docker compose exec api npm run migration:run

# Skip automatic migrations on startup
docker compose up -d -e RUN_MIGRATIONS=false

# Rebuild and restart
docker compose up -d --build
```

### Debugging

```bash
# View container logs
docker logs browsers-api

# Enter container shell
docker exec -it browsers-api /bin/bash

# Check container status
docker ps

# Inspect container
docker inspect browsers-api

# View resource usage
docker stats
```

### Cleanup

```bash
# Remove container
docker rm -f browsers-api

# Remove image
docker rmi browsers-api:latest

# Remove all stopped containers
docker container prune

# Remove unused images
docker image prune

# Full cleanup (careful!)
docker system prune -a --volumes
```

## Docker Hub Publishing

```bash
# Login
docker login

# Tag for Docker Hub
docker tag browsers-api:latest <username>/browsers-api:latest
docker tag browsers-api:latest <username>/browsers-api:v1.0.0

# Push
docker push <username>/browsers-api:latest
docker push <username>/browsers-api:v1.0.0

# Pull
docker pull <username>/browsers-api:latest
```

## Environment Variables

Key environment variables (see `.env.example`):

- `NODE_ENV` - Environment mode
- `PORT` - Application port
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` - Database config
- `RUN_MIGRATIONS` - Auto-run migrations on startup (default: `true`, set to `false` to skip)
- `WORKER_MAX_CONCURRENT_JOBS` - Worker concurrency
- `PLAYWRIGHT_HEADLESS` - Browser mode
- `LOG_LEVEL` - Logging level

## Ports

- `3333` - API server (default, configurable via `PORT` env variable)
- `9090` - Metrics endpoint (published on host `9091` in local dev)
- `5432` - PostgreSQL (bundled DB only, with the `with-db` profile)

> Host ports are published only for local development via
> `docker-compose.override.yml`. Production (base compose only) exposes ports
> internally and routes through a reverse proxy.

## Volumes

When using docker-compose (named volumes managed by Docker):
- `postgres_data` - Database persistence (bundled DB)
- `artifacts` - Job artifacts
- `screenshots` - Screenshots

## Health Check

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' browsers-api

# Manual health check (default port 3333)
curl http://localhost:3333/api/v1/health

# With custom port
curl http://localhost:8080/api/v1/health
```

## Common Issues

### Port already in use
```bash
# Find what's using port 3333
lsof -i :3333

# Use different port by setting PORT environment variable
docker run -p 8080:8080 -e PORT=8080 ...
```

### Database connection failed
```bash
# Check the bundled database is running (lives behind the with-db profile)
docker compose --profile with-db ps postgres

# Check database logs
docker compose --profile with-db logs postgres
```

### Out of memory
```bash
# Increase Docker memory limit in Docker Desktop settings
# Or add resource limits to docker-compose.yml
```

### Browser automation fails
```bash
# Ensure sufficient resources
docker stats

# Check Playwright installation
docker compose exec api npx playwright --version
```

## Additional Resources

- Full documentation: [docs/DOCKER.md](DOCKER.md)
- Docker Hub: https://hub.docker.com
- Playwright Docker: https://playwright.dev/docs/docker
