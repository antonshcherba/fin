#!/usr/bin/env bash
# Static checks for the E2E stack: test/docker-compose.test.yml, the Playwright config and the
# pinned Playwright version (the container image tag must match @playwright/test).
set -u
cd "$(dirname "$0")/.."

fail=0
check() {
  if ! "${@:2}"; then
    echo "FAIL: $1"
    fail=1
  else
    echo "ok:   $1"
  fi
}

C=test/docker-compose.test.yml
check "compose file exists" test -f "$C"
check "app builds from the repo root" bash -c "grep -A2 'build:' $C | grep -q 'context: \.\.'"
check "app runs with LLM_MOCK=true" grep -q 'LLM_MOCK: "true"' "$C"
check "app has no data volume (fresh db each run)" bash -c "! grep -q 'finally-data' $C"
check "app is not published to the host" bash -c "! grep -q '8000:8000' $C"
check "playwright waits for a healthy app" grep -q 'condition: service_healthy' "$C"
check "playwright targets the app service" grep -q 'BASE_URL: http://app:8000' "$C"
check "playwright runs unit and e2e projects" grep -q 'playwright test --project=unit --project=e2e' "$C"

pinned=$(sed -n 's/.*"@playwright\/test": "\([0-9.]*\)".*/\1/p' test/package.json)
check "@playwright/test is pinned to an exact version" test -n "$pinned"
check "container image tag matches pinned version ($pinned)" grep -q "playwright:v${pinned}-" "$C"

check "default baseURL is localhost:8000" grep -q "http://localhost:8000" test/playwright.config.ts
check "e2e runs serially" bash -c "grep -q 'workers: 1' test/playwright.config.ts && grep -q 'fullyParallel: false' test/playwright.config.ts"

for scenario in 01-fresh-start 02-watchlist 03-trading 04-portfolio-visuals 05-ai-chat 06-sse-resilience; do
  check "spec $scenario exists" test -f "test/e2e/$scenario.spec.ts"
done

if docker compose version >/dev/null 2>&1; then
  check "compose config validates" bash -c "docker compose -f $C config -q"
fi

exit $fail
