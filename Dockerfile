# =============================================================================
# MULTI-STAGE DOCKER BUILD FOR TASSIE REDDIT BOT
# =============================================================================
# Production-ready Dockerfile with security, caching, and size optimisation

# =============================================================================
# STAGE 1: Build Dependencies and Compile TypeScript
# =============================================================================
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
# Use npm ci for faster, reliable, reproducible builds
RUN npm ci --only=production=false --silent

# Copy source code
COPY . .

# Build TypeScript to JavaScript
# This creates the dist/ directory with compiled code
RUN npm run build

# Remove development dependencies to reduce image size
RUN npm prune --production

# =============================================================================
# STAGE 2: Production Runtime
# =============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Create necessary directories with proper permissions
RUN mkdir -p logs data && \
    chown -R botuser:nodejs /app

# Copy package.json for runtime dependencies info
COPY --from=builder --chown=botuser:nodejs /app/package*.json ./

# Copy production dependencies from builder stage
COPY --from=builder --chown=botuser:nodejs /app/node_modules ./node_modules

# Copy compiled application from builder stage
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist

# Copy static files if any (like health check endpoints)
COPY --from=builder --chown=botuser:nodejs /app/package.json ./

# Switch to non-root user
USER botuser

# Expose health check port
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1); \
    }).on('error', () => { process.exit(1); });"

# Set environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    LOG_DIRECTORY=/app/logs \
    STORAGE_FILE_PATH=/app/data/posted-ids.json

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# =============================================================================
# METADATA
# =============================================================================
LABEL maintainer="Tassie Reddit Bot"
LABEL description="Reddit to Discord bot for monitoring r/tasmania subreddit"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/your-username/tassie-reddit-bot"
LABEL org.opencontainers.image.description="Monitors Reddit posts and forwards them to Discord"
LABEL org.opencontainers.image.licenses="MIT"

# =============================================================================
# BUILD INSTRUCTIONS
# =============================================================================
# To build this image:
#   docker build -t tassie-reddit-bot .
#
# To run with environment file:
#   docker run -d --name tassie-bot --env-file .env tassie-reddit-bot
#
# To run with docker-compose:
#   docker-compose up -d
#
# For development with volume mounting:
#   docker run -d -v $(pwd)/data:/app/data -v $(pwd)/logs:/app/logs --env-file .env tassie-reddit-bot