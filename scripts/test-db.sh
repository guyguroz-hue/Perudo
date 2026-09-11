#!/usr/bin/env bash
# Verify supabase/migrations against a throwaway local PostgreSQL instance.
#
# Why this exists: the database is the security boundary for this game, so the
# schema and its RLS policies need to be tested before they reach the live
# project — not after. It also keeps Phase 1 verifiable while direct network
# access to Supabase is unavailable.
#
# Requires the PostgreSQL 16 server binaries (not just psql).
# Usage: scripts/test-db.sh
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDIR=${PGDIR:-/var/lib/postgresql/perudo_test}
PGPORT=${PGPORT:-55432}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# initdb refuses to run as root, so the cluster is driven as the postgres user.
if [ "$(id -u)" -eq 0 ]; then
  AS_PG() { su postgres -c "$1"; }
else
  AS_PG() { bash -c "$1"; }
fi

cleanup() {
  AS_PG "$PGBIN/pg_ctl -D $PGDIR stop -m immediate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> fresh cluster at $PGDIR"
rm -rf "$PGDIR"
mkdir -p "$PGDIR"
[ "$(id -u)" -eq 0 ] && chown postgres:postgres "$PGDIR"
AS_PG "$PGBIN/initdb -D $PGDIR -A trust -U postgres" >/dev/null

AS_PG "$PGBIN/pg_ctl -D $PGDIR \
  -o '-k $PGDIR -p $PGPORT -c listen_addresses= -c wal_level=logical' \
  -l $PGDIR/server.log start -w -t 30" >/dev/null
echo "    started on port $PGPORT"

PSQL="PGOPTIONS='-c client_min_messages=warning' psql -h $PGDIR -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
AS_PG "$PSQL -c 'create database perudo owner postgres'" >/dev/null
PSQL="$PSQL -d perudo"

echo "==> applying local Supabase shim (roles, auth schema, publication)"
AS_PG "$PSQL -f $ROOT/supabase/tests/00_local_shim.sql"

# Migrations run as app_owner — a role WITHOUT superuser and WITHOUT bypassrls —
# so that any accidental reliance on owner-level RLS bypass fails here rather
# than in production.
echo "==> applying migrations as non-superuser owner"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  AS_PG "$PSQL -c 'set role app_owner' -f $f" \
    || { echo "MIGRATION FAILED: $(basename "$f")"; exit 1; }
done

echo "==> running tests"
for t in "$ROOT"/supabase/tests/0[1-9]*.sql; do
  AS_PG "$PSQL -f $t"
done

echo
echo "==> concurrency: real simultaneous sessions racing for the last seat"
if [ "$(id -u)" -eq 0 ]; then
  chmod +x "$ROOT/scripts/test-concurrency.sh"
  su postgres -c "$ROOT/scripts/test-concurrency.sh $PGDIR $PGPORT 5"
else
  "$ROOT/scripts/test-concurrency.sh" "$PGDIR" "$PGPORT" 5
fi
