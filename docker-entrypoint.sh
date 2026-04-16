#!/usr/bin/env bash
set -euo pipefail

node index.js &
BACKEND_PID=$!

npm --prefix frontend start -- --hostname 0.0.0.0 --port 3000 &
FRONTEND_PID=$!

cleanup() {
  kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM

wait -n "$BACKEND_PID" "$FRONTEND_PID"
STATUS=$?

cleanup
exit "$STATUS"
