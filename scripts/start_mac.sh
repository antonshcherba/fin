#!/usr/bin/env bash
# Build (if needed) and start the FinAlly container. Safe to run repeatedly.
# Usage: scripts/start_mac.sh [--build] [--no-open]
set -euo pipefail

IMAGE=finally
CONTAINER=finally
VOLUME=finally-data
PORT=8000
URL="http://localhost:$PORT"

cd "$(dirname "$0")/.."

build=0
open_browser=1
for arg in "$@"; do
  case "$arg" in
    --build) build=1 ;;
    --no-open) open_browser=0 ;;
    *) echo "Unknown option: $arg" >&2; echo "Usage: $0 [--build] [--no-open]" >&2; exit 2 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or not installed. Start Docker and try again." >&2
  exit 1
fi

if [ "$build" -eq 1 ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image '$IMAGE'..."
  docker build -t "$IMAGE" .
  build=1
fi

if [ -n "$(docker ps -q -f "name=^${CONTAINER}\$")" ]; then
  if [ "$build" -eq 0 ]; then
    echo "FinAlly is already running at $URL"
    exit 0
  fi
  docker rm -f "$CONTAINER" >/dev/null
elif [ -n "$(docker ps -aq -f "name=^${CONTAINER}\$")" ]; then
  docker rm -f "$CONTAINER" >/dev/null
fi

env_args=()
if [ -f .env ]; then
  env_args=(--env-file .env)
else
  echo "Warning: .env not found; copy .env.example to .env to configure API keys." >&2
fi

docker run -d --name "$CONTAINER" \
  -v "$VOLUME:/app/db" \
  -p "$PORT:8000" \
  ${env_args[@]+"${env_args[@]}"} \
  "$IMAGE" >/dev/null

if command -v curl >/dev/null 2>&1; then
  printf 'Waiting for FinAlly'
  for _ in $(seq 1 30); do
    if curl -fsS "$URL/api/health" >/dev/null 2>&1; then break; fi
    printf '.'
    sleep 1
  done
  echo
fi

echo "FinAlly is running at $URL"

if [ "$open_browser" -eq 1 ]; then
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
fi
