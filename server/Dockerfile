# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 4000
USER node
ENTRYPOINT ["docker-entrypoint.sh"]

# API:     docker run <image>
# Worker:  docker run <image> node dist/src/worker/run.js
# Migrate: docker run <image> node dist/src/db/migrate-run.js
CMD ["node", "dist/index.js"]
