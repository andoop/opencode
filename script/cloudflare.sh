#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cmd="${1:-up}"

case "$cmd" in
  up|start|restart)
    "$ROOT/script/public-site.sh" restart
    ;;
  down|stop)
    "$ROOT/script/public-site.sh" stop
    ;;
  status)
    "$ROOT/script/public-site.sh" status
    ;;
  *)
    echo "usage: script/cloudflare.sh [up|down|status]" >&2
    exit 1
    ;;
esac
