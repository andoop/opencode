#!/bin/bash

# OpenCode Services Restart Script
# This script stops and restarts all OpenCode development services

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp"
SERVER_LOG="$LOG_DIR/opencode-server.log"
APP_LOG="$LOG_DIR/opencode-app.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping existing services...${NC}"

# Find and kill processes using port 4096
if lsof -ti :4096 >/dev/null 2>&1; then
  echo "Killing processes on port 4096..."
  lsof -ti :4096 | xargs kill -9 2>/dev/null || true
fi

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
if lsof -i :4096 >/dev/null 2>&1; then
  echo -e "${RED}Warning: Port 4096 is still in use${NC}"
  lsof -i :4096 | grep LISTEN
fi

if lsof -i :3000 >/dev/null 2>&1 || lsof -i :3001 >/dev/null 2>&1 || lsof -i :5173 >/dev/null 2>&1; then
  echo -e "${YELLOW}Warning: Frontend ports may still be in use${NC}"
fi

echo -e "${GREEN}Starting services...${NC}"

# Ensure bun is in PATH
export PATH="$HOME/.bun/bin:$PATH"

# Set state directory to avoid permission issues
export XDG_STATE_HOME="$HOME/.local/state-opencode"
mkdir -p "$XDG_STATE_HOME"

# Enable multi-user mode for user data isolation
export OPENCODE_MULTI_USER=true

# Start backend server
echo -e "${GREEN}Starting backend server on port 4096...${NC}"
cd "$PROJECT_ROOT"
bun dev serve --port 4096 --hostname 0.0.0.0 > "$SERVER_LOG" 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ps -p $BACKEND_PID > /dev/null 2>&1; then
  echo -e "${GREEN}Backend server started (PID: $BACKEND_PID)${NC}"
else
  echo -e "${RED}Failed to start backend server. Check $SERVER_LOG for details${NC}"
  tail -20 "$SERVER_LOG"
  exit 1
fi

# Start frontend app
echo -e "${GREEN}Starting frontend app...${NC}"
cd "$PROJECT_ROOT/packages/app"
bun run dev > "$APP_LOG" 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

# Check if frontend started successfully
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
  echo -e "${GREEN}Frontend app started (PID: $FRONTEND_PID)${NC}"
else
  echo -e "${RED}Failed to start frontend app. Check $APP_LOG for details${NC}"
  tail -20 "$APP_LOG"
  exit 1
fi

# Wait a bit more and check service status
sleep 2

echo -e "\n${GREEN}Checking service status...${NC}"

# Check backend health
if curl -s http://localhost:4096/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Backend server is healthy (http://localhost:4096)${NC}"
else
  echo -e "${YELLOW}⚠ Backend server may still be starting...${NC}"
fi

# Check frontend port
FRONTEND_PORT=""
for port in 3000 3001 5173; do
  if lsof -i :$port >/dev/null 2>&1; then
    FRONTEND_PORT=$port
    break
  fi
done

if [ -n "$FRONTEND_PORT" ]; then
  echo -e "${GREEN}✓ Frontend app is running (http://localhost:$FRONTEND_PORT)${NC}"
else
  # Try to get port from log file
  LOG_PORT=$(grep -oE "Local:.*http://localhost:[0-9]+" "$APP_LOG" 2>/dev/null | grep -oE "[0-9]+" | head -1)
  if [ -n "$LOG_PORT" ]; then
    echo -e "${GREEN}✓ Frontend app is running (http://localhost:$LOG_PORT)${NC}"
    FRONTEND_PORT=$LOG_PORT
  else
    echo -e "${YELLOW}⚠ Frontend app may still be starting... Check $APP_LOG${NC}"
  fi
fi

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}Services restarted successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "Backend:  http://localhost:4096"
if [ -n "$FRONTEND_PORT" ]; then
  echo -e "Frontend: http://localhost:$FRONTEND_PORT"
else
  echo -e "Frontend: Check $APP_LOG for port"
fi
echo -e "\nLogs:"
echo -e "  Backend:  $SERVER_LOG"
echo -e "  Frontend: $APP_LOG"
echo -e "\nTo stop services, run:"
echo -e "  pkill -f 'bun.*serve.*4096' && pkill -f 'bun run dev'"
echo -e "\nOr use this script with: ./restart-services.sh"
