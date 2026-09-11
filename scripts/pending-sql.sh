#!/usr/bin/env bash
# Prints the migrations the live project has not had yet, ready to paste into
# the Supabase SQL editor.
#
# The point is that this never depends on memory. supabase/APPLIED.txt records
# how far the live project has got; everything after it, in filename order, is
# what is still owed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLIED=$(grep -v '^#' "$ROOT/supabase/APPLIED.txt" | grep -v '^[[:space:]]*$' | tail -1)

FOUND=0
PENDING=()
for f in "$ROOT"/supabase/migrations/*.sql; do
  name=$(basename "$f")
  if [ "$FOUND" = "1" ]; then PENDING+=("$f"); fi
  if [ "$name" = "$APPLIED" ]; then FOUND=1; fi
done

if [ "$FOUND" = "0" ]; then
  echo "ERROR: supabase/APPLIED.txt names '$APPLIED', which is not a migration." >&2
  exit 1
fi

if [ ${#PENDING[@]} -eq 0 ]; then
  echo "-- Nothing pending. The live project is up to date through $APPLIED." >&2
  exit 0
fi

{
  echo "-- ============================================================================="
  echo "-- Pending migrations — ${#PENDING[@]} file(s), in order."
  echo "-- Safe to re-run: every statement is written to be idempotent."
  echo "-- ============================================================================="
  for f in "${PENDING[@]}"; do echo; echo; cat "$f"; done
}
