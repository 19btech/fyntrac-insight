#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/pids"
BACKEND_LOG="$ROOT_DIR/logs/backend.log"
FRONTEND_LOG="$ROOT_DIR/logs/frontend.log"

mkdir -p "$PID_DIR" "$ROOT_DIR/logs"

# Spawn a command in its own session/process group (setsid) so stop.sh can
# kill the whole group with `kill -- -PGID`. The recorded PID is the PGID.
start_in_pgroup() {
  local name="$1" log="$2" workdir="$3"; shift 3
  (
    cd "$workdir"
    setsid bash -c "exec $* >> '$log' 2>&1" &
    echo $! > "$PID_DIR/${name}.pid"
  )
}



# ── Backend ───────────────────────────────────────────────────────────────────
if [[ -f "$PID_DIR/backend.pid" ]] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
  echo "[backend]  already running (PID $(cat "$PID_DIR/backend.pid"))"
else
  echo "[backend]  starting on http://localhost:4000 ..."
  start_in_pgroup backend "$BACKEND_LOG" "$ROOT_DIR/backend" "npm run dev"
  echo "[backend]  started  (PID $(cat "$PID_DIR/backend.pid"))"
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
if [[ -f "$PID_DIR/frontend.pid" ]] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
  echo "[frontend] already running (PID $(cat "$PID_DIR/frontend.pid"))"
else
  echo "[frontend] starting on http://localhost:3001 ..."
  start_in_pgroup frontend "$FRONTEND_LOG" "$ROOT_DIR/frontend" "env PORT=3001 npm start"
  echo "[frontend] started  (PID $(cat "$PID_DIR/frontend.pid"))"
fi

echo ""
echo "Services are starting up:"
echo "  Backend  → http://localhost:4000"
echo "  Frontend → http://localhost:3001"
echo ""
echo "Logs:"
echo "  tail -f $BACKEND_LOG"
echo "  tail -f $FRONTEND_LOG"
echo ""
echo "Run ./stop.sh to stop all services."
