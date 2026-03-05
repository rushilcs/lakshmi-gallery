#!/bin/sh
# Compose DATABASE_URL from individual env vars if not already set
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-gallery}"
fi
exec "$@"
