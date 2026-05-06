#!/usr/bin/env bash
# api/scripts/dump_schema.sh
set -e
source .env 2>/dev/null || true

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set" >&2
  exit 1
fi

# Convert SQLAlchemy URL to psql-compatible format
PSQL_URL="${DATABASE_URL/postgresql+asyncpg/postgresql}"

pg_dump --schema-only --no-owner --no-privileges -n public "$PSQL_URL" \
  | sed '1s/^/-- AUTO-GENERATED. Do not edit. Run api\/scripts\/dump_schema.sh to regenerate.\n/' \
  > ../supabase/schema.sql

echo "schema.sql regenerated"
