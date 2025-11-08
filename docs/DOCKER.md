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
   # Start with docker-compose (default port 3333)
   docker-compose up -d
   
   # Start with custom port (set PORT in .env or export before running)
   PORT=8080 docker-compose up -d
   
   # Stop services
   docker-compose down
   
   # View logs
   docker-compose logs -f api
   ```

## Environment Variables

The application requires the following environment variables. These are configured in `docker-compose.yml` by default, but can be overridden using a `.env` file.

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
# Verify database is running
docker-compose ps postgres

# Check database health
docker-compose exec postgres pg_isready -U automation_user
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

### GitHub Actions Example
```yaml
name: Build and Push Docker Image

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_USERNAME }}/browsers-api:latest
            ${{ secrets.DOCKER_USERNAME }}/browsers-api:${{ github.ref_name }}
```

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
