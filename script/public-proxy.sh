#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/script/Caddyfile"

cmd="${1:-restart}"

status() {
  if caddy adapt --config "$CONFIG" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:2019/config/" >/dev/null 2>&1; then
    echo "caddy proxy is running on http://127.0.0.1:7777"
    return 0
  fi
  echo "caddy proxy is not running"
  return 1
}

start() {
  caddy validate --config "$CONFIG"
  if curl -fsS "http://127.0.0.1:2019/config/" >/dev/null 2>&1; then
    caddy reload --config "$CONFIG"
    echo "caddy proxy reloaded on http://127.0.0.1:7777"
    return
  fi
  caddy start --config "$CONFIG"
  echo "caddy proxy started on http://127.0.0.1:7777"
}

stop() {
  if curl -fsS "http://127.0.0.1:2019/config/" >/dev/null 2>&1; then
    caddy stop
    echo "caddy proxy stopped"
    return
  fi
  echo "caddy proxy is not running"
}

case "$cmd" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop || true
    start
    ;;
  status)
    status
    ;;
  *)
    echo "usage: script/public-proxy.sh [start|stop|restart|status]" >&2
    exit 1
    ;;
esac
