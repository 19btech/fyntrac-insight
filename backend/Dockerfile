FROM node:20-bookworm-slim

WORKDIR /app

# Install wget for healthchecks
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

CMD ["node", "src/index.js"]
