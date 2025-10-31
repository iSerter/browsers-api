# Docker Containerization Plan

## Goals
- Package the Nest.js Browsers API with all Playwright dependencies.
- Provide deterministic builds and runtime configuration.
- Enable local development, CI usage, and Docker Hub publishing.

## Prerequisites
- Docker CLI ≥ 24
- Access to Docker Hub registry
- Project dependencies locked in `package-lock.json`
- Environment variables available in `.env` (copy `.env.example` if needed)

## Dockerfile Strategy
1. **Base Image**
   - Use `mcr.microsoft.com/playwright:v1.56.1-jammy` (includes Node 20, browsers, fonts, and Playwright deps).
2. **Multi-Stage Layout**
   - `builder` stage:
     - Install system updates (apt-get clean).
     - Install Node dependencies with `npm ci`.
     - Run `npm run build` to produce `/app/dist`.
   - `runner` stage:
     - Re-use the Playwright base image to keep browsers available.
     - Copy `node_modules` (production) and `dist` from builder.
     - Add `package.json`, `package-lock.json`, and `tsconfig*.json` if CLI tools are needed.
     - Set `NODE_ENV=production`.
3. **Runtime Entrypoint**
   - `CMD ["node", "dist/main.js"]`
   - Expose port `3000` (Nest default) or match `process.env.PORT`.
4. **Environment & Secrets**
   - Load env via `.env` file mounted at run time or Docker secrets.
   - Document required variables (DB credentials, Redis host, auth tokens, etc.).

## Supporting Scripts
- Add `scripts/docker-dev.sh` (optional) to simplify build/run for contributors.
- Consider `docker-compose.yml` for local stack (PostgreSQL, Redis, API).

## Build & Run Instructions

### 1. Build Image
```bash
docker build -t browsers-api:latest .
```

### 2. Run Locally
```bash
docker run --rm \
  -p 3000:3000 \
  --env-file ./.env \
  browsers-api:latest
```

### 3. Run With Detached Container & Named Volume (optional)
```bash
docker run -d \
  --name browsers-api \
  -p 3000:3000 \
  --env-file ./.env \
  browsers-api:latest
```

### 4. Run Database Migrations (if required)
```bash
docker run --rm \
  --env-file ./.env \
  browsers-api:latest \
  npm run migration:run
```

## Docker Hub Publishing

### 1. Authenticate
```bash
docker login --username <dockerhub-username>
```

### 2. Tag Image
```bash
docker tag browsers-api:latest <dockerhub-username>/browsers-api:latest
docker tag browsers-api:latest <dockerhub-username>/browsers-api:<version>
```

### 3. Push
```bash
docker push <dockerhub-username>/browsers-api:latest
docker push <dockerhub-username>/browsers-api:<version>
```

### 4. Verify
- Confirm repository at `https://hub.docker.com/r/<dockerhub-username>/browsers-api`.
- Pull image on another machine: `docker pull <dockerhub-username>/browsers-api:latest`.

## Next Steps
- Implement Dockerfile per plan.
- Add CI pipeline step to build & push on tagged releases.
- Document environment variables in `docs/env.md`.
- Optional: publish a Helm chart or Compose stack in `deploy/`.
