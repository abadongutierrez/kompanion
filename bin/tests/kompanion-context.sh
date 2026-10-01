#!/bin/bash
# Tests for library/skills/kompanion-context/scripts/manifest.py, including
# running it through the real enforcement wrapper the way a Claude Code agent
# has to. Needs python3 only. Run directly or through bin/test.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/library/skills/kompanion-context/scripts/manifest.py"
HOOKS="$ROOT/library/hooks"
TMP="$(mktemp -d)"
FAILED=0
PASSED=0

trap 'rm -rf "$TMP"' EXIT

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# A task workspace with a manifest: one primary worktree, one other repo.
new_task() {
  rm -rf "$TMP/task"
  mkdir -p "$TMP/task" "$TMP/work/main" "$TMP/work/other"
  cat > "$TMP/task/manifest.json" <<EOF
{
  "branchName": "feat/abc-do-it",
  "primary": {"name": "Main", "repositoryLocalPath": "$TMP/repos/main", "workspaceLocalPath": "$TMP/work/main"},
  "otherRepos": [{"name": "Other", "repositoryLocalPath": "$TMP/repos/other", "workspaceLocalPath": "$TMP/work/other"}],
  "taskWorkspace": "$TMP/task"
}
EOF
}

run() { TASK_WORKSPACE_DIR="$TMP/task" python3 "$SCRIPT" "$@"; }

echo "kompanion-context manifest.py"

new_task
check "worktree prints the primary worktree" '[ "$(run worktree)" = "$TMP/work/main" ]'
check "task-workspace prints the task folder" '[ "$(run task-workspace)" = "$TMP/task" ]'
check "branch prints the branch" '[ "$(run branch)" = "feat/abc-do-it" ]'
check "roots lists the worktrees then the task folder" \
  '[ "$(run roots)" = "$TMP/work/main
$TMP/work/other
$TMP/task" ]'
check "repos is JSON with each repo and its role" \
  'run repos | python3 -c "import json,sys; r=json.load(sys.stdin); assert [x[\"role\"] for x in r]==[\"primary\",\"other\"]; assert r[0][\"name\"]==\"Main\"; assert r[1][\"worktree\"].endswith(\"work/other\")"'

# Scratch mode: no repo linked, the worktree is the task folder.
cat > "$TMP/task/manifest.json" <<EOF
{"branchName": null, "primary": {"name": null, "repositoryLocalPath": null, "workspaceLocalPath": "$TMP/task"}, "otherRepos": [], "taskWorkspace": "$TMP/task"}
EOF
check "with no branch, branch prints nothing and succeeds" '[ -z "$(run branch)" ] && run branch > /dev/null'
check "in scratch mode roots does not repeat the task folder" '[ "$(run roots)" = "$TMP/task" ]'

new_task
BEFORE="$(find "$TMP" -type f | sort | xargs md5sum)"
run worktree > /dev/null; run roots > /dev/null; run repos > /dev/null; run branch > /dev/null
check "it writes nothing" '[ "$BEFORE" = "$(find "$TMP" -type f | sort | xargs md5sum)" ]'

OUT="$(python3 "$SCRIPT" worktree 2>&1)"; CODE=$?
check "without TASK_WORKSPACE_DIR it fails clearly" '[ "$CODE" = 2 ] && [[ "$OUT" == *"TASK_WORKSPACE_DIR is not set"* ]]'

rm -f "$TMP/task/manifest.json"
OUT="$(run worktree 2>&1)"; CODE=$?
check "a missing manifest fails clearly" '[ "$CODE" = 2 ] && [[ "$OUT" == *"cannot read"* ]]'

echo "not json" > "$TMP/task/manifest.json"
OUT="$(run worktree 2>&1)"; CODE=$?
check "a broken manifest fails clearly" '[ "$CODE" = 2 ] && [[ "$OUT" == *"not valid JSON"* ]]'

echo '{"primary": {"workspaceLocalPath": "/x"}}' > "$TMP/task/manifest.json"
OUT="$(run task-workspace 2>&1)"; CODE=$?
check "an old manifest without a field says so" '[ "$CODE" = 2 ] && [[ "$OUT" == *"taskWorkspace"* ]]'

new_task
OUT="$(run nonsense 2>&1)"; CODE=$?
check "an unknown command fails with the usage" '[ "$CODE" = 2 ] && [[ "$OUT" == *"usage"* ]]'
OUT="$(run 2>&1)"; CODE=$?
check "no command fails with the usage" '[ "$CODE" = 2 ] && [[ "$OUT" == *"usage"* ]]'

echo "  through the enforcement wrapper (how Claude Code has to run it)"
new_task
WRAPPED="$(TASK_WORKSPACE_DIR="$TMP/task" TASK_ID=abc python3 "$HOOKS/exec_in_folder.py" \
  --taskId abc --folder "$TMP/work/main" --command "python3 $SCRIPT task-workspace" 2>&1)"
check "the wrapper runs it and the environment reaches the script" '[ "$WRAPPED" = "$TMP/task" ]'
check "the wrapper logged the call" 'grep -q "manifest.py task-workspace" "$TMP/task/commands.log"'

OUT="$(TASK_WORKSPACE_DIR="$TMP/task" TASK_ID=abc python3 "$HOOKS/exec_in_folder.py" \
  --taskId abc --folder /etc --command "python3 $SCRIPT worktree" 2>&1)"; CODE=$?
check "the wrapper still refuses a folder outside the allowed roots" '[ "$CODE" = 2 ]'

PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"python3 .claude/hooks/exec_in_folder.py --taskId \"$TASK_ID\" --folder . --command \"python3 .claude/skills/kompanion-context/scripts/manifest.py task-workspace\""}}'
check "the hook allows the exact command the skill tells Claude Code to run" \
  'echo "$PAYLOAD" | TASK_WORKSPACE_DIR="$TMP/task" python3 "$HOOKS/enforce-workspace.py" | grep -q "\"permissionDecision\": \"allow\""'

PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"python3 .claude/skills/kompanion-context/scripts/manifest.py worktree"}}'
check "the hook denies the same script run raw, which is why the skill says to wrap it" \
  'echo "$PAYLOAD" | TASK_WORKSPACE_DIR="$TMP/task" python3 "$HOOKS/enforce-workspace.py" | grep -q "\"permissionDecision\": \"deny\""'

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" = 0 ]
