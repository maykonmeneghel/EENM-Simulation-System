#!/usr/bin/env bash
# Start engine (:8001), API (:8080) and web (:5173) locally without Docker. Ctrl-C stops all three.
# Needs: uv, Java 21, Node 24.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
logs="$root/.dev-logs"; mkdir -p "$logs"
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

wait_for() {  # url name
  for _ in $(seq 1 120); do curl -sf "$1" >/dev/null && { echo "  $2 ready"; return; }; sleep 1; done
  echo "  $2 did not start, see $logs" >&2; exit 1
}

echo "engine  -> $logs/engine.log"
(cd "$root/services/simulation-engine" && uv run uvicorn eenm_engine.interfaces.http.app:app --port 8001) >"$logs/engine.log" 2>&1 &
pids+=($!); wait_for http://localhost:8001/health engine

echo "api     -> $logs/api.log"
(cd "$root/services/simulation-api" && ./mvnw -q spring-boot:run) >"$logs/api.log" 2>&1 &
pids+=($!); wait_for http://localhost:8080/actuator/health api

echo "web     -> $logs/web.log"
(cd "$root/apps/web" && npm run dev -- --port 5173 --strictPort) >"$logs/web.log" 2>&1 &
pids+=($!); wait_for http://localhost:5173 web

echo "open http://localhost:5173"
wait
