#!/usr/bin/env bash
# Verifies the repo skeleton: required files/dirs exist and gitignore rules behave.
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

check "planning/PLAN.md matches SPEC.md" cmp -s SPEC.md planning/PLAN.md
check "db/.gitkeep exists" test -f db/.gitkeep
for d in frontend backend scripts test; do
  check "$d/ exists" test -d "$d"
done

ignored() { git check-ignore -q "$1"; }
not_ignored() { ! git check-ignore -q "$1"; }
for p in db/finally.db .env node_modules/x .venv/x frontend/out/index.html backend/app/__pycache__/x.pyc; do
  check "$p is ignored" ignored "$p"
done
for p in .env.example db/.gitkeep; do
  check "$p is not ignored" not_ignored "$p"
done

env_keys=$(grep -oE '^[A-Z_]+=' .env.example | sort | tr '\n' ' ')
check ".env.example defines the three documented keys" \
  test "$env_keys" = "LLM_MOCK= MASSIVE_API_KEY= OPENROUTER_API_KEY= "
no_secret() { ! grep -qE 'sk-[A-Za-z0-9]' .env.example; }
check ".env.example has no real secret" no_secret

exit $fail
