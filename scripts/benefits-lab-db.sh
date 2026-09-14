#!/usr/bin/env bash
set -euo pipefail
# Dedicated disposable fixture database. Never uses .env or the production database.
pgbin="$(pg_config --bindir)"
data="$HOME/.local/share/benny-benefits-lab/postgres"
mkdir -p "$data"
chmod 700 "$data"
if [[ ! -f "$data/PG_VERSION" ]]; then
  "$pgbin/initdb" -D "$data" --username=benny_lab --auth=trust --encoding=UTF8 --no-locale
fi
# Foreground process belongs to the Amp service supervisor; never pg_ctl start or &.
exec "$pgbin/postgres" -D "$data" -h 127.0.0.1 -p 55432 -k "$data"
