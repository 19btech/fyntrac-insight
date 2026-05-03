#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/pids"
BACKEND_LOG="$ROOT_DIR/logs/backend.log"
FRONTEND_LOG="$ROOT_DIR/logs/frontend.log"
MONGO_CONTAINER="${MONGO_CONTAINER:-fyntrac-mongo}"
MONGO_PORT="${MONGO_PORT:-27017}"

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

# ── MongoDB (Docker) ──────────────────────────────────────────────────────────
# We always use the local dockerized MongoDB at localhost:27017.
# The backend's .env points both MONGODB_URI and TARGET_MONGODB_URI here.
if ! command -v docker >/dev/null 2>&1; then
  echo "[mongo]    ERROR: docker not available — cannot start MongoDB."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  if docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    echo "[mongo]    already running (container $MONGO_CONTAINER)"
  else
    echo "[mongo]    starting container $MONGO_CONTAINER ..."
    docker start "$MONGO_CONTAINER" >/dev/null
    echo "[mongo]    started"
  fi
else
  echo "[mongo]    creating container $MONGO_CONTAINER ..."
  docker run -d --name "$MONGO_CONTAINER" \
    -p "${MONGO_PORT}:27017" \
    -v fyntrac-mongo-data:/data/db \
    mongo:7 >/dev/null
  echo "[mongo]    created and started"
fi

# Wait until mongo accepts connections (max ~20s) so the backend doesn't race it.
echo -n "[mongo]    waiting for readiness "
for i in $(seq 1 20); do
  if docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q '^1$'; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 1
  if [[ "$i" -eq 20 ]]; then
    echo
    echo "[mongo]    WARNING: not ready after 20s — backend may fail to connect."
  fi
done

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
  echo "[frontend] starting on http://localhost:3000 ..."
  start_in_pgroup frontend "$FRONTEND_LOG" "$ROOT_DIR/frontend" "npm start"
  echo "[frontend] started  (PID $(cat "$PID_DIR/frontend.pid"))"
fi

echo ""
echo "Services are starting up:"
echo "  MongoDB  → mongodb://localhost:${MONGO_PORT} (container: $MONGO_CONTAINER)"
echo "  Backend  → http://localhost:4000"
echo "  Frontend → http://localhost:3000"
echo ""
echo "Logs:"
echo "  tail -f $BACKEND_LOG"
echo "  tail -f $FRONTEND_LOG"
echo ""
echo "Run ./stop.sh to stop all services."
