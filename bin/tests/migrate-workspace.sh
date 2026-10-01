#!/bin/bash
# Tests for bin/migrate-workspace, file-moving part only (--skip-db), so they
# need no database. Run directly or through bin/test.

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/migrate-workspace"
TMP="$(mktemp -d)"
LISTENER_PID=""
FAILED=0
PASSED=0

cleanup() {
  [ -n "$LISTENER_PID" ] && kill "$LISTENER_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# A fresh old root with one project task and one legacy task, and a new root.
fixture() {
  rm -rf "$TMP/old" "$TMP/new"
  mkdir -p "$TMP/old/projects/acme-11111111/tasks/t1" "$TMP/old/tasks/legacy1"
  echo hi > "$TMP/old/projects/acme-11111111/tasks/t1/handoff.md"
  echo '{}' > "$TMP/old/tasks/legacy1/manifest.json"
}

# Runs the script against the fixture on a port nobody listens on.
migrate() {
  OLD_WORKSPACE_ROOT="$TMP/old" WORKSPACE_ROOT="$TMP/new" PORT="${TEST_PORT:-39999}" \
    "$SCRIPT" --skip-db "$@"
}

echo "bin/migrate-workspace"

fixture
OUT="$(migrate 2>&1)"
check "a dry run reports what it would move" '[[ "$OUT" == *"move  projects/"* && "$OUT" == *"move  tasks/"* ]]'
check "a dry run changes nothing" '[ -f "$TMP/old/projects/acme-11111111/tasks/t1/handoff.md" ] && [ ! -e "$TMP/new" ]'

fixture
migrate --apply > /dev/null 2>&1
check "--apply moves projects/" '[ "$(cat "$TMP/new/projects/acme-11111111/tasks/t1/handoff.md" 2>/dev/null)" = "hi" ]'
check "--apply moves the legacy tasks/" '[ -f "$TMP/new/tasks/legacy1/manifest.json" ]'
check "--apply leaves nothing behind" '[ ! -e "$TMP/old/projects" ] && [ ! -e "$TMP/old/tasks" ]'

OUT="$(migrate --apply 2>&1)"; CODE=$?
check "a second run succeeds" '[ "$CODE" = 0 ]'
check "a second run moves nothing" '[[ "$OUT" == *"nothing at the old location"* ]]'
check "a second run keeps the moved files" '[ -f "$TMP/new/projects/acme-11111111/tasks/t1/handoff.md" ]'

fixture
mkdir -p "$TMP/new/tasks/already-here"
echo keep > "$TMP/new/tasks/already-here/file"
OUT="$(migrate --apply 2>&1)"; CODE=$?
check "a non-empty destination stops the script" '[ "$CODE" != 0 ] && [[ "$OUT" == *"already has content"* ]]'
check "a non-empty destination moves nothing, not even other folders" '[ -d "$TMP/old/projects/acme-11111111" ] && [ -d "$TMP/old/tasks/legacy1" ]'
check "a non-empty destination is left untouched" '[ "$(cat "$TMP/new/tasks/already-here/file")" = "keep" ]'

fixture
mkdir -p "$TMP/new/tasks"
migrate --apply > /dev/null 2>&1
check "an empty destination folder is fine" '[ -f "$TMP/new/tasks/legacy1/manifest.json" ]'

fixture
python3 - <<'PY' &
import socket, time
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 39998))
s.listen(1)
time.sleep(30)
PY
LISTENER_PID=$!
sleep 1
TEST_PORT=39998 OUT="$(TEST_PORT=39998 migrate --apply 2>&1)"; CODE=$?
check "a running server stops the script" '[ "$CODE" != 0 ] && [[ "$OUT" == *"Stop the server"* ]]'
check "a running server means nothing is moved" '[ -d "$TMP/old/projects/acme-11111111" ]'
kill "$LISTENER_PID" 2>/dev/null; LISTENER_PID=""

fixture
OUT="$(OLD_WORKSPACE_ROOT="$TMP/old" WORKSPACE_ROOT="$TMP/old" PORT=39999 "$SCRIPT" --skip-db --apply 2>&1)"; CODE=$?
check "the same old and new root is refused" '[ "$CODE" != 0 ] && [ -d "$TMP/old/projects" ]'

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" = 0 ]
