# ─── Stage 1: Build the web app ───────────────────────────────────────────────
FROM node:22-slim AS builder

# Enable corepack so pnpm is available without a separate install step
# Update corepack first to get the latest signing keys (older bundled corepack
# versions fail to verify signatures for newer pnpm releases).
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY release/app/package.json release/app/package.json
COPY patches ./patches

# Install dependencies (skip postinstall scripts that require Electron native bindings)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the full source
COPY . .

# Build the web bundle
# CHATBOX_BUILD_PLATFORM=web is already set by the build:web script via cross-env,
# but we also set it explicitly here so it is visible to any pre-build scripts.
# Pass Google OAuth client IDs at build time via --build-arg if desired.
ARG CHATBOX_GOOGLE_CLIENT_ID_WEB=""
ARG CHATBOX_GOOGLE_CLIENT_ID_DESKTOP=""
ENV CHATBOX_GOOGLE_CLIENT_ID_WEB=${CHATBOX_GOOGLE_CLIENT_ID_WEB}
ENV CHATBOX_GOOGLE_CLIENT_ID_DESKTOP=${CHATBOX_GOOGLE_CLIENT_ID_DESKTOP}

RUN pnpm exec cross-env CHATBOX_BUILD_PLATFORM=web electron-vite build && find /app/release/app/dist -name '*.js.map' -delete

# ─── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove the default nginx index page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from the builder stage
COPY --from=builder /app/release/app/dist/renderer /usr/share/nginx/html

# Inject an nginx config that handles SPA routing (all unknown paths → index.html)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
