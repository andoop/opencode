#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/.cursor"
LOG_FILE="$STATE_DIR/cloudflared-opencode.log"
PID_FILE="$STATE_DIR/cloudflared-opencode.pid"

mkdir -p "$STATE_DIR"

running_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi

  local pid
  pid="$(pgrep -f "cloudflared tunnel run opencode" | head -n 1 || true)"
  if [[ -n "$pid" ]]; then
    echo "$pid" >"$PID_FILE"
    echo "$pid"
    return 0
  fi

  return 1
}

start_tunnel() {
  if pid="$(running_pid)"; then
    echo "cloudflared tunnel is already running (pid=$pid)"
    return
  fi

  nohup cloudflared tunnel run opencode >"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    echo "cloudflared tunnel started (pid=$pid)"
    return
  fi

  echo "failed to start cloudflared tunnel" >&2
  [[ -f "$LOG_FILE" ]] && tail -n 20 "$LOG_FILE" >&2
  exit 1
}

stop_tunnel() {
  if pid="$(running_pid)"; then
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "cloudflared tunnel stopped"
    return
  fi

  rm -f "$PID_FILE"
  echo "cloudflared tunnel is not running"
}

status() {
  "$ROOT/script/public-proxy.sh" status || true
  if pid="$(running_pid)"; then
    echo "cloudflared tunnel is running (pid=$pid)"
  else
    echo "cloudflared tunnel is not running"
  fi
}

cmd="${1:-restart}"

case "$cmd" in
  start)
    "$ROOT/script/public-proxy.sh" start
    start_tunnel
    ;;
  stop)
    "$ROOT/script/public-proxy.sh" stop || true
    stop_tunnel
    ;;
  restart)
    "$ROOT/script/public-proxy.sh" restart
    stop_tunnel
    start_tunnel
    ;;
  status)
    status
    ;;
  *)
    echo "usage: script/public-site.sh [start|stop|restart|status]" >&2
    exit 1
    ;;
esac
