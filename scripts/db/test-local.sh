#!/usr/bin/env bash
# Runs all migrations and pgTAP tests against a throwaway database on a plain
# PostgreSQL server (no Docker needed). Usage:
#   PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/db/test-local.sh
# Requires psql and the pgtap extension installed on that server.
# With the Supabase CLI and Docker, use `pnpm db:test` (supabase test db) instead.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${TEST_DB:-cohortglobal_test}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/db/local-supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" > /dev/null || { echo "Migration failed: $f"; exit 1; }
done
echo "Migrations applied."
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "create extension if not exists pgtap with schema extensions"
status=0
for t in supabase/tests/*.test.sql; do
  out=$(cd supabase/tests && psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$(basename "$t")" 2>&1) || true
  if echo "$out" | grep -qE '^not ok|ERROR|Looks like you|Bad plan'; then
    echo "FAIL $t"; echo "$out" | grep -E '^not ok|ERROR|#' | head -40; status=1
  else
    echo "ok   $t ($(echo "$out" | grep -c '^ok'))"
  fi
done
exit $status
