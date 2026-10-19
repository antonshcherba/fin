#!/usr/bin/env bash
# Unit tests for the Docker packaging: start/stop scripts run against a stub `docker`,
# plus static checks on Dockerfile, docker-compose.yml and the PowerShell scripts.
set -u
cd "$(dirname "$0")/.."
ROOT=$PWD

fail=0
check() {
  if ! "${@:2}"; then
    echo "FAIL: $1"
    fail=1
  else
    echo "ok:   $1"
  fi
}

work=$(mktemp -d)
had_env=0
cleanup() { rm -rf "$work"; [ "$had_env" -eq 1 ] && rm -f "$ROOT/.env"; return 0; }
trap cleanup EXIT
mkdir -p "$work/bin" "$work/state"

# Stub docker: records every call and tracks image/container state in files.
cat > "$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_STATE/calls.log"
case "$1" in
  info) exit 0 ;;
  image) [ -f "$STUB_STATE/image" ] || exit 1 ;;
  build) touch "$STUB_STATE/image" ;;
  ps)
    if [[ " $* " == *" -aq "* ]]; then [ -f "$STUB_STATE/container" ] && echo abc123
    else [ -f "$STUB_STATE/running" ] && echo abc123
    fi
    exit 0 ;;
  run) touch "$STUB_STATE/container" "$STUB_STATE/running" ;;
  rm) rm -f "$STUB_STATE/container" "$STUB_STATE/running" ;;
esac
exit 0
STUB
for cmd in curl open sleep; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$STUB_STATE/calls.log"\n' "$cmd" > "$work/bin/$cmd"
done
chmod +x "$work/bin/"*

export STUB_STATE="$work/state"
run() { PATH="$work/bin:$PATH" "$@" >/dev/null 2>&1; }
reset() { rm -f "$STUB_STATE"/*; }
called() { grep -qE -e "$1" "$STUB_STATE/calls.log"; }
not_called() { ! grep -qE -e "$1" "$STUB_STATE/calls.log"; }
count() { [ "$(grep -cE -- "$1" "$STUB_STATE/calls.log")" -eq "$2" ]; }

for s in scripts/start_mac.sh scripts/stop_mac.sh; do
  check "$s is executable" test -x "$s"
  check "$s has valid syntax" bash -n "$s"
done

# start: builds when image missing, runs with volume, port and env file
reset
[ -f .env ] || { touch .env; had_env=1; }
check "start builds missing image" run scripts/start_mac.sh --no-open
check "start builds image tagged finally" called 'docker build -t finally \.'
check "start mounts finally-data at /app/db" called 'docker run .*-v finally-data:/app/db'
check "start maps port 8000" called 'docker run .*-p 8000:8000'
check "start passes .env" called 'docker run .*--env-file \.env'
check "start does not open browser with --no-open" not_called '^open '

# start: idempotent when already running
: > "$STUB_STATE/calls.log"
check "second start succeeds" run scripts/start_mac.sh --no-open
check "second start does not rebuild" not_called 'docker build'
check "second start does not run again" not_called 'docker run'

# start --build: rebuilds and recreates
: > "$STUB_STATE/calls.log"
check "start --build succeeds" run scripts/start_mac.sh --build --no-open
check "start --build rebuilds" called 'docker build'
check "start --build removes old container" called 'docker rm -f finally'
check "start --build runs new container" called 'docker run'

# start: replaces a stopped container, opens browser by default
reset; rm -f "$STUB_STATE/running"; touch "$STUB_STATE/image" "$STUB_STATE/container"
: > "$STUB_STATE/calls.log"
check "start with stopped container succeeds" run scripts/start_mac.sh
check "start removes stopped container" called 'docker rm -f finally'
check "start opens browser" called '^open http://localhost:8000'
check "start skips build when image exists" not_called 'docker build'

# start: no .env -> no --env-file
reset; touch "$STUB_STATE/image"; : > "$STUB_STATE/calls.log"
[ "$had_env" -eq 1 ] && rm -f .env
if [ -f .env ]; then
  echo "skip: .env present, cannot test missing .env"
else
  check "start without .env succeeds" run scripts/start_mac.sh --no-open
  check "start without .env omits --env-file" not_called '--env-file'
fi

check "start rejects unknown option" bash -c '! PATH="'"$work"'/bin:$PATH" scripts/start_mac.sh --bogus >/dev/null 2>&1'

# stop: removes container, never touches the volume, idempotent
reset; touch "$STUB_STATE/container" "$STUB_STATE/running"; : > "$STUB_STATE/calls.log"
check "stop succeeds" run scripts/stop_mac.sh
check "stop removes container" called 'docker rm -f finally'
check "stop leaves volume" not_called 'volume'
: > "$STUB_STATE/calls.log"
check "second stop succeeds" run scripts/stop_mac.sh
check "second stop does not remove" not_called 'docker rm'

# Dockerfile
check "Dockerfile has node 20 build stage" grep -qE '^FROM node:20-slim AS' Dockerfile
check "Dockerfile has python 3.12 slim final stage" grep -qE '^FROM python:3\.12-slim' Dockerfile
check "Dockerfile installs uv and syncs from lockfile" grep -q 'uv sync --frozen' Dockerfile
check "Dockerfile copies static export to backend/static" grep -qE 'COPY --from=frontend .*/out \./static' Dockerfile
check "Dockerfile exposes 8000" grep -q '^EXPOSE 8000' Dockerfile
check "Dockerfile runs uvicorn on 0.0.0.0:8000" grep -qE 'CMD \["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"\]' Dockerfile
check "Dockerfile has /api/health healthcheck" grep -q 'HEALTHCHECK.*\|/api/health' Dockerfile
check ".dockerignore excludes .env and node_modules" bash -c 'grep -qx "\.env" .dockerignore && grep -q node_modules .dockerignore'

# docker-compose.yml
check "compose maps 8000" grep -q '"8000:8000"' docker-compose.yml
check "compose uses shared finally-data volume" bash -c 'grep -q "finally-data:/app/db" docker-compose.yml && grep -q "name: finally-data" docker-compose.yml'
check "compose uses optional .env" bash -c 'grep -q "path: .env" docker-compose.yml && grep -q "required: false" docker-compose.yml'
if docker compose version >/dev/null 2>&1; then
  check "compose config validates" bash -c 'docker compose -f docker-compose.yml config >/dev/null'
fi

# PowerShell scripts (static checks; pwsh not required)
for s in scripts/start_windows.ps1 scripts/stop_windows.ps1; do
  check "$s exists" test -f "$s"
  check "$s uses container name finally" grep -q "'finally'" "$s"
done
check "start_windows supports -Build" grep -q '\[switch\]\$Build' scripts/start_windows.ps1
check "start_windows mounts finally-data" grep -q 'finally-data' scripts/start_windows.ps1
check "start_windows maps port 8000" grep -q '8000' scripts/start_windows.ps1
check "stop_windows keeps volume" bash -c '! grep -q "volume rm" scripts/stop_windows.ps1'

exit $fail
