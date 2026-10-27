#!/bin/bash
# QA tests for the Operator's requirement on the preflight-check skill: a task
# with no repository linked must fail preflight. The manifests below are the
# exact shape RunTaskService writes when a task has no linked repository.
# Needs python3. Run directly or through bin/test.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/library/skills/preflight-check/scripts/preflight.py"
HOOKS="$ROOT/library/hooks"
TMP="$(mktemp -d)"
FAILED=0
PASSED=0

trap 'rm -rf "$TMP"' EXIT

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1"; echo "$OUT" | sed 's/^/         /'; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

write_manifest() {
  rm -rf "$TMP/task"
  mkdir -p "$TMP/task"
  echo "$1" > "$TMP/task/manifest.json"
}

run_in() { (cd "$1" && TASK_WORKSPACE_DIR="$TMP/task" python3 "$SCRIPT"); }

echo "preflight-check: a task without a repository fails"

# 1. What the server writes for a task with no linked repository.
write_manifest "{\"branchName\": null, \"primary\": {\"name\": null, \"repositoryLocalPath\": null, \"workspaceLocalPath\": \"$TMP/task\"}, \"otherRepos\": [], \"taskWorkspace\": \"$TMP/task\"}"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a task with no repository exits 1" '[ "$CODE" = 1 ]'
check "it prints a FAIL line about the missing repository" '[[ "$OUT" == *FAIL*repositor* ]]'
check "it does not say ready" '[[ "$OUT" != *"preflight: ready"* ]]'

# 2. Same, but repositoryLocalPath is absent rather than null.
write_manifest "{\"primary\": {\"workspaceLocalPath\": \"$TMP/task\"}, \"otherRepos\": [], \"taskWorkspace\": \"$TMP/task\"}"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a manifest with no repositoryLocalPath key exits 1" '[ "$CODE" = 1 ]'

# 3. Empty string is not a repository either.
write_manifest "{\"branchName\": \"\", \"primary\": {\"repositoryLocalPath\": \"\", \"workspaceLocalPath\": \"$TMP/task\"}, \"otherRepos\": [], \"taskWorkspace\": \"$TMP/task\"}"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "an empty repositoryLocalPath exits 1" '[ "$CODE" = 1 ]'

# 4. Through the real enforcement wrapper, the way a Claude Code agent runs it.
write_manifest "{\"branchName\": null, \"primary\": {\"name\": null, \"repositoryLocalPath\": null, \"workspaceLocalPath\": \"$TMP/task\"}, \"otherRepos\": [], \"taskWorkspace\": \"$TMP/task\"}"
OUT="$(cd "$TMP/task" && TASK_WORKSPACE_DIR="$TMP/task" TASK_ID=abc python3 "$HOOKS/exec_in_folder.py" \
  --taskId abc --folder "$TMP/task" --command "python3 $SCRIPT" 2>&1)"; CODE=$?
check "through the wrapper, a task with no repository exits 1" '[ "$CODE" = 1 ]'
check "the wrapper logged the failing exit code" 'grep -q "\"exitCode\": 1" "$TMP/task/commands.log"'

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" = 0 ]
