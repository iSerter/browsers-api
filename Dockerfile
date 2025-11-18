# Multi-stage Dockerfile for Browsers API with Playwright
# Based on official Playwright image with Node 20 and all browser dependencies

# ============================================
# Builder Stage
# ============================================
FROM mcr.microsoft.com/playwright:v1.56.1-jammy AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with clean install
RUN npm ci

# Copy source code and configuration
COPY . .

# Build the application (commented out for test stage - tests run with ts-jest)
# RUN npm run build

# ============================================
# Test Stage
# ============================================
FROM builder AS test

# Set working directory
WORKDIR /app

# Note: Tests run with ts-jest, so no build step needed
# This stage can be used to run tests in CI/CD
# Usage: docker build --target test -t browsers-api-test .
# Then: docker run --rm browsers-api-test npm test
# Or: docker run --rm browsers-api-test npm run test:e2e

# Default command runs all tests
CMD ["npm", "test"]

# ============================================
# Builder for Production (with build step)
# ============================================
FROM builder AS builder-prod

# Build the application for production
RUN npm run build

# ============================================
# Runner Stage
# ============================================
FROM mcr.microsoft.com/playwright:v1.56.1-jammy AS runner

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3333

# Copy package files for reference
COPY package.json package-lock.json ./

# Copy TypeScript configs (needed if running migrations or CLI tools)
COPY tsconfig.json tsconfig.build.json ./

# Copy source files (needed for TypeORM CLI migrations)
COPY --from=builder /app/src ./src

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder-prod
COPY --from=builder-prod /app/dist ./dist

# Install Xvfb for virtual display support
RUN apt-get update && \
    apt-get install -y xvfb x11-utils && \
    rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p ./artifacts ./screenshots

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose application port (configurable via PORT env variable, default: 3333)
EXPOSE 3333

# Health check (uses PORT env variable)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3333; require('http').get(`http://localhost:${port}/api/v1/health`, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the application via entrypoint script (handles Xvfb startup)
CMD ["./docker-entrypoint.sh"]
