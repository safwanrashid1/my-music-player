#!/bin/bash
# Wavform dev startup script
# Runs backend (port 3001) and frontend (port 5173) concurrently

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  🎵 Wavform — lossless audio platform"
echo "  ────────────────────────────────────"
echo "  Backend  → http://localhost:3001"
echo "  Frontend → http://localhost:5173"
echo ""

# Install deps if needed
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd "$ROOT/backend" && npm install
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# Run both
cd "$ROOT"
trap 'kill 0' EXIT
(cd backend && node src/index.js) &
(cd frontend && npx vite --port 5173) &
wait
