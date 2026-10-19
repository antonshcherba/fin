#!/usr/bin/env bash
# Stop and remove the FinAlly container. The finally-data volume is kept.
set -euo pipefail

CONTAINER=finally

if [ -n "$(docker ps -aq -f "name=^${CONTAINER}\$")" ]; then
  docker rm -f "$CONTAINER" >/dev/null
  echo "FinAlly stopped. Data volume 'finally-data' preserved."
else
  echo "FinAlly is not running."
fi
