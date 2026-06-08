#!/bin/bash
# ─────────────────────────────────────────────────────────────
# GRIDCo Dashboard — Start Script
# Run this once: bash start.sh
# Opens the dashboard at http://localhost:3000
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Colours for terminal output ───────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

echo ""
echo -e "${GREEN}⚡ GRIDCo Dashboard — Starting up...${NC}"
echo ""

# ── Check backend folder exists ───────────────────────────────
if [ ! -f "$BACKEND_DIR/main.py" ]; then
  echo -e "${RED}Error: backend/main.py not found.${NC}"
  echo "Make sure you're running this from inside GRIDCO_DASHBOARD_SAMUEL_NSP/"
  exit 1
fi

# ── Check frontend folder exists ──────────────────────────────
if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo -e "${RED}Error: frontend/package.json not found.${NC}"
  exit 1
fi

# ── Kill any existing processes on ports 8000 and 3000 ────────
echo -e "${YELLOW}► Clearing ports 8000 and 3000...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# ── Start backend ─────────────────────────────────────────────
echo -e "${BLUE}► Starting backend (FastAPI) on port 8000...${NC}"
cd "$BACKEND_DIR"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/gridco_backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo -e "${YELLOW}  Waiting for backend...${NC}"
for i in {1..15}; do
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Backend is ready${NC}"
    break
  fi
  sleep 1
done

# ── Start frontend ────────────────────────────────────────────
echo -e "${BLUE}► Starting frontend (React) on port 3000...${NC}"
cd "$FRONTEND_DIR"
npm start > /tmp/gridco_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

# ── Save PIDs so we can stop them later ───────────────────────
echo "$BACKEND_PID $FRONTEND_PID" > /tmp/gridco_pids.txt

# ── Wait for frontend to open ────────────────────────────────
echo -e "${YELLOW}  Waiting for browser to open...${NC}"
sleep 6

echo ""
echo -e "${GREEN}✓ GRIDCo Dashboard is running!${NC}"
echo ""
echo "  Dashboard → http://localhost:3000"
echo "  Backend   → http://localhost:8000"
echo ""
echo -e "${YELLOW}  To stop everything, run:  bash stop.sh${NC}"
echo ""

# Keep script alive so Ctrl+C stops everything cleanly
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
wait
