# Stage 1: Build Stage
FROM node:20-alpine3.19 AS build

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    yaml-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev && \
    npm install --save \
    js-yaml@latest \
    winston@latest \
    ajv@latest \
    yaml-validator@latest

# Copy source files
COPY bin ./bin
COPY config ./config
COPY plugin-management ./plugin-management
COPY src ./src

# Create post-install script
RUN echo '#!/bin/sh\n\
if [ -f "/config/plugins.yaml" ]; then\n\
  PLUGINS=$(cat /config/plugins.yaml | grep "postInstall:" -A 10 | grep -v "postInstall:" | grep "^[[:space:]]*-" | sed "s/^[[:space:]]*-[[:space:]]*//g" | tr -d "\"")\n\
  if [ ! -z "$PLUGINS" ]; then\n\
    echo "Running post-install scripts..."\n\
    echo "$PLUGINS" | while read -r cmd; do\n\
      if [ ! -z "$cmd" ]; then\n\
        echo "Executing: $cmd"\n\
        sh -c "$cmd"\n\
      fi\n\
    done\n\
  fi\n\
fi' > /app/post-install.sh && chmod +x /app/post-install.sh

# Stage 2: Production Stage
FROM node:20-alpine3.19

# Install runtime dependencies
RUN apk add --no-cache \
    yaml \
    tini

# Set working directory
WORKDIR /app

# Copy only the necessary files from the build stage
COPY --from=build /app /app

# Create required directories
RUN mkdir -p /headlamp/plugins && \
    mkdir -p /config && \
    mkdir -p /logs

# Set environment variables
ENV NODE_ENV=production \
    PLUGINS_DIR=/headlamp/plugins \
    CONFIG_DIR=/config \
    LOG_DIR=/logs \
    LOG_LEVEL=info

# Add volume mount points
VOLUME ["/headlamp/plugins", "/config", "/logs"]

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Set the default command to run the plugin installer and post-install script
CMD ["sh", "-c", "node bin/headlamp-plugin.js install --config /config/plugins.yaml && /app/post-install.sh"]
