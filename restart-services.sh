#!/bin/bash

[ -n "$BASH_VERSION" ] || exec bash "$0" "$@"

# OpenCode Services Restart Script
# This script stops and restarts all OpenCode development services

set -e

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
LOG_DIR="/tmp"
SERVER_LOG="$LOG_DIR/opencode-server.log"
APP_LOG="$LOG_DIR/opencode-app.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

printf "%b\n" "${YELLOW}Stopping existing services...${NC}"

listening_on_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

kill_port_listeners() {
  local port="$1"
  if listening_on_port "$port"; then
    echo "Killing processes listening on port $port..."
    lsof -tiTCP:"$port" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  fi
}

# Find and kill processes using port 4096
kill_port_listeners 4096

# Stop all bun processes related to opencode
pkill -9 -f "bun.*serve.*4096" 2>/dev/null || true
pkill -9 -f "bun.*dev.*opencode" 2>/dev/null || true
pkill -9 -f "bun run --cwd packages/opencode" 2>/dev/null || true

# Stop frontend processes
pkill -9 -f "bun run dev" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true

# Wait a bit for processes to stop
sleep 3

# Check if ports are still in use
if listening_on_port 4096; then
  printf "%b\n" "${RED}Warning: Port 4096 is still in use${NC}"
  lsof -nP -iTCP:4096 -sTCP:LISTEN
fi

if listening_on_port 3000 || listening_on_port 3001 || listening_on_port 5173; then
  printf "%b\n" "${YELLOW}Warning: Frontend ports may still be in use${NC}"
fi

printf "%b\n" "${GREEN}Starting services...${NC}"

# Ensure bun is in PATH
export PATH="$HOME/.bun/bin:$PATH"

# Set state directory to avoid permission issues
export XDG_STATE_HOME="$HOME/.local/state-opencode"
mkdir -p "$XDG_STATE_HOME"

# Enable multi-user mode for user data isolation
export OPENCODE_MULTI_USER=true

# Start backend server
printf "%b\n" "${GREEN}Starting backend server on port 4096...${NC}"
cd "$PROJECT_ROOT"
bun dev serve --port 4096 --hostname 0.0.0.0 > "$SERVER_LOG" 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ps -p $BACKEND_PID > /dev/null 2>&1; then
  printf "%b\n" "${GREEN}Backend server started (PID: $BACKEND_PID)${NC}"
else
  printf "%b\n" "${RED}Failed to start backend server. Check $SERVER_LOG for details${NC}"
  tail -20 "$SERVER_LOG"
  exit 1
fi

# Start frontend app
printf "%b\n" "${GREEN}Starting frontend app...${NC}"
cd "$PROJECT_ROOT/packages/app"
bun run dev > "$APP_LOG" 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

# Check if frontend started successfully
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
  printf "%b\n" "${GREEN}Frontend app started (PID: $FRONTEND_PID)${NC}"
else
  printf "%b\n" "${RED}Failed to start frontend app. Check $APP_LOG for details${NC}"
  tail -20 "$APP_LOG"
  exit 1
fi

# Wait a bit more and check service status
sleep 2

printf "\n%b\n" "${GREEN}Checking service status...${NC}"

# Check backend health
if curl -s http://localhost:4096/health > /dev/null 2>&1; then
  printf "%b\n" "${GREEN}✓ Backend server is healthy (http://localhost:4096)${NC}"
else
  printf "%b\n" "${YELLOW}⚠ Backend server may still be starting...${NC}"
fi

# Check frontend port
FRONTEND_PORT=""
for port in 3000 3001 5173; do
  if listening_on_port "$port"; then
    FRONTEND_PORT=$port
    break
  fi
done

if [ -n "$FRONTEND_PORT" ]; then
  printf "%b\n" "${GREEN}✓ Frontend app is running (http://localhost:$FRONTEND_PORT)${NC}"
else
  # Try to get port from log file
  LOG_PORT=$(grep -oE "Local:.*http://localhost:[0-9]+" "$APP_LOG" 2>/dev/null | grep -oE "[0-9]+" | head -1)
  if [ -n "$LOG_PORT" ]; then
    printf "%b\n" "${GREEN}✓ Frontend app is running (http://localhost:$LOG_PORT)${NC}"
    FRONTEND_PORT=$LOG_PORT
  else
    printf "%b\n" "${YELLOW}⚠ Frontend app may still be starting... Check $APP_LOG${NC}"
  fi
fi

printf "\n%b\n" "${GREEN}════════════════════════════════════════${NC}"
printf "%b\n" "${GREEN}Services restarted successfully!${NC}"
printf "%b\n" "${GREEN}════════════════════════════════════════${NC}"
printf "%s\n" "Backend:  http://localhost:4096"
if [ -n "$FRONTEND_PORT" ]; then
  printf "%s\n" "Frontend: http://localhost:$FRONTEND_PORT"
else
  printf "%s\n" "Frontend: Check $APP_LOG for port"
fi
printf "\n%s\n" "Logs:"
printf "%s\n" "  Backend:  $SERVER_LOG"
printf "%s\n" "  Frontend: $APP_LOG"
printf "\n%s\n" "To stop services, run:"
printf "%s\n" "  pkill -f 'bun.*serve.*4096' && pkill -f 'bun run dev'"
printf "\n%s\n" "Or use this script with: ./restart-services.sh"
