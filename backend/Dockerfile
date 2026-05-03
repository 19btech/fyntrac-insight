FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

CMD ["node", "src/index.js"]
