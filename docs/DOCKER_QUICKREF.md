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

# Run with env file
docker run --rm -p 3000:3000 --env-file ./.env browsers-api:latest

# Run detached
docker run -d --name browsers-api -p 3000:3000 --env-file ./.env browsers-api:latest
```

### Docker Compose

```bash
# Start stack
docker compose up -d

# Stop stack
docker compose down

# View logs
docker compose logs -f api

# Run command in container
docker compose exec api npm run migration:run

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
- `WORKER_MAX_CONCURRENT_JOBS` - Worker concurrency
- `PLAYWRIGHT_HEADLESS` - Browser mode
- `LOG_LEVEL` - Logging level

## Ports

- `3000` - API server
- `9090` - Metrics endpoint
- `5432` - PostgreSQL (when using docker-compose)

## Volumes

When using docker-compose:
- `postgres_data` - Database persistence
- `./artifacts` - Job artifacts
- `./screenshots` - Screenshots

## Health Check

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' browsers-api

# Manual health check
curl http://localhost:3000/api/v1/health
```

## Common Issues

### Port already in use
```bash
# Find what's using port 3000
lsof -i :3000

# Use different port
docker run -p 3001:3000 ...
```

### Database connection failed
```bash
# Check database is running
docker compose ps postgres

# Check database logs
docker compose logs postgres
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
