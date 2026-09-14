#!/usr/bin/env bash
set -euo pipefail
# Fixed local destination deliberately ignores PGHOST, PGDATABASE and DATABASE_URL.
pgbin="$(pg_config --bindir)"
for attempt in $(seq 1 30); do
  if "$pgbin/pg_isready" -h 127.0.0.1 -p 55432 -U benny_lab -d postgres >/dev/null; then break; fi
  sleep 1
done
if [[ "$("$pgbin/psql" -X -h 127.0.0.1 -p 55432 -U benny_lab -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='benny_benefits_lab'")" != 1 ]]; then
  "$pgbin/createdb" -h 127.0.0.1 -p 55432 -U benny_lab benny_benefits_lab
fi
exec ./node_modules/.bin/tsx src/benefits/server.ts
