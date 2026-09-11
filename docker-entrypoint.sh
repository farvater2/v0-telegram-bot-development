#!/bin/sh
# Runs as root so it can fix ownership of bind-mounted volumes (which may
# belong to any uid on the host), then drops privileges to the `node` user
# before starting the app.
set -e

mkdir -p /app/data /app/logs
chown -R node:node /app/data /app/logs

exec su-exec node "$@"
