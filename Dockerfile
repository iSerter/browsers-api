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

# Build the application
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

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Create necessary directories
RUN mkdir -p ./artifacts ./screenshots

# Expose application port (configurable via PORT env variable, default: 3333)
EXPOSE 3333

# Health check (uses PORT env variable)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3333; require('http').get(`http://localhost:${port}/api/v1/health`, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the application
CMD ["node", "dist/main.js"]
