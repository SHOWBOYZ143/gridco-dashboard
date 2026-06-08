#!/bin/bash
# ─────────────────────────────────────────────────────────────
# GRIDCo Dashboard — Stop Script
# Run: bash stop.sh
# ─────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}⚡ Stopping GRIDCo Dashboard...${NC}"

# Kill by saved PIDs
if [ -f /tmp/gridco_pids.txt ]; then
  read BACKEND_PID FRONTEND_PID < /tmp/gridco_pids.txt
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  rm /tmp/gridco_pids.txt
fi

# Also kill anything still on those ports
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo -e "${GREEN}✓ Dashboard stopped.${NC}"
echo ""
