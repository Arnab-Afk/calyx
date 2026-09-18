# Calyx — Node app image (ingestion, consumer, Slack, migrate)
FROM node:22-bookworm-slim

# chartjs-node-canvas / node-canvas native deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production

# Override per service in docker-compose
CMD ["npm", "run", "dev:ingestion"]
