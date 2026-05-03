#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/pids"
MONGO_CONTAINER="${MONGO_CONTAINER:-fyntrac-mongo}"
STOP_MONGO="${STOP_MONGO:-1}"   # set STOP_MONGO=0 to keep mongo running

# Kill the whole process group led by $1 (PGID == leader PID when started with setsid).
kill_group() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
  fi
}

stop_service() {
  local name="$1" pattern="$2"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ -f "$pid_file" ]]; then
    local pid; pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "[$name] stopping process group (PGID $pid) ..."
      kill_group "$pid"
      echo "[$name] stopped."
    else
      echo "[$name] not running (stale PID $pid)."
    fi
    rm -f "$pid_file"
  else
    echo "[$name] no pid file."
  fi

  # Belt-and-braces: kill any orphans matching the service pattern.
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "[$name] killing leftover processes matching: $pattern"
    pkill -TERM -f "$pattern" 2>/dev/null || true
    sleep 1
    pkill -KILL -f "$pattern" 2>/dev/null || true
  fi
}

stop_service "frontend" "react-scripts(/| ).*start"
stop_service "backend"  "(nodemon.*src/index|node .*backend/src/index)"

# ── MongoDB ───────────────────────────────────────────────────────────────────
# Stop the dockerized MongoDB unless STOP_MONGO=0.
# Data persists on the docker volume (fyntrac-mongo-data), so restarting
# preserves the restored TNT001 + fyntrac_analytics_meta databases.
if [[ "$STOP_MONGO" == "1" ]] && command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    echo "[mongo]    stopping container $MONGO_CONTAINER ..."
    docker stop "$MONGO_CONTAINER" >/dev/null && echo "[mongo]    stopped."
  else
    echo "[mongo]    not running."
  fi
else
  echo "[mongo]    skipped (STOP_MONGO=$STOP_MONGO)."
fi

echo ""
echo "All services stopped."
