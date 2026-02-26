# syntax=docker/dockerfile:1

# Base image with Bun runtime
FROM oven/bun:1.3 AS base
WORKDIR /usr/src/app

# Install git (needed for cloning repositories)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies into temp directory for caching
FROM base AS install

# Install dev dependencies (for type checking if needed)
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install production dependencies only
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Prerelease stage - copy source and prepare for production
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY package.json bun.lock tsconfig.json bunfig.toml ./
COPY src/ ./src/

ENV NODE_ENV=production

# Final release image
FROM base AS release

# Install opencode-ai globally and point `opencode` to the native binary.
# The package ships a Node-based launcher script, but this image doesn't include Node.
RUN bun add -g opencode-ai && \
    ln -sf /root/.bun/install/global/node_modules/opencode-ai/bin/.opencode /usr/local/bin/opencode && \
    opencode --version

# Copy production dependencies
COPY --from=install /temp/prod/node_modules node_modules

# Copy source code and config files
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/tsconfig.json .
COPY --from=prerelease /usr/src/app/bunfig.toml .
COPY --from=prerelease /usr/src/app/src ./src

# Create data directory
RUN mkdir -p /usr/src/app/data && chown -R bun:bun /usr/src/app/data

ENV NODE_ENV=production

EXPOSE 3000/tcp
EXPOSE 4000-4099/tcp

CMD ["bun", "run", "start"]
