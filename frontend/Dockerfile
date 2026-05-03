# ── Stage 1: Build React app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (layer cache friendly)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
# REACT_APP_API_BASE_URL is baked into the React bundle at build time.
# nginx proxies /api/insight/** → gateway → backend (StripPrefix=2 removes /api/insight).
ARG REACT_APP_API_BASE_URL=/api/insight
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
COPY public/ ./public/
COPY src/ ./src/
# CI=false prevents CRA from treating ESLint warnings as fatal errors.
# DISABLE_ESLINT_PLUGIN=true skips the eslint-webpack-plugin pass entirely.
RUN CI=false DISABLE_ESLINT_PLUGIN=true npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Copy Nginx config template — nginx docker image automatically expands
# environment variables in /etc/nginx/templates/*.template at container start
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Default gateway — override at runtime via -e GATEWAY_URI=...
ENV GATEWAY_URI=http://localhost:8585

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
