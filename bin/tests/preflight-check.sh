#!/bin/bash
# Tests for library/skills/preflight-check/scripts/preflight.py, including
# running it through the real enforcement wrapper the way a Claude Code agent
# has to. Needs python3 and git. Run directly or through bin/test.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/library/skills/preflight-check/scripts/preflight.py"
HOOKS="$ROOT/library/hooks"
TMP="$(mktemp -d)"
FAILED=0
PASSED=0

trap 'rm -rf "$TMP"' EXIT

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# A task with one repo worktree on the task's branch, with a git user.
new_repo_task() {
  rm -rf "$TMP/task" "$TMP/work"
  mkdir -p "$TMP/task" "$TMP/work/main"
  git -C "$TMP/work/main" init -q -b feat/abc-do-it
  git -C "$TMP/work/main" config user.name "Test"
  git -C "$TMP/work/main" config user.email "test@example.com"
  git -C "$TMP/work/main" commit -q --allow-empty -m init
  cat > "$TMP/task/manifest.json" <<EOF
{
  "branchName": "feat/abc-do-it",
  "primary": {"name": "Main", "repositoryLocalPath": "$TMP/repos/main", "workspaceLocalPath": "$TMP/work/main"},
  "otherRepos": [],
  "taskWorkspace": "$TMP/task"
}
EOF
}

new_scratch_task() {
  rm -rf "$TMP/task" "$TMP/work"
  mkdir -p "$TMP/task"
  cat > "$TMP/task/manifest.json" <<EOF
{"branchName": null, "primary": {"name": null, "repositoryLocalPath": null, "workspaceLocalPath": "$TMP/task"}, "otherRepos": [], "taskWorkspace": "$TMP/task"}
EOF
}

# Runs from the given folder, so the allowed-root check sees it.
run_in() { (cd "$1" && TASK_WORKSPACE_DIR="$TMP/task" python3 "$SCRIPT"); }

echo "preflight-check preflight.py"

new_repo_task
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a ready repo task passes" '[ "$CODE" = 0 ] && [[ "$OUT" == *"preflight: ready"* ]] && [[ "$OUT" != *FAIL* ]]'
check "it reports the branch" '[[ "$OUT" == *"ok    on branch feat/abc-do-it"* ]]'

new_scratch_task
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a ready scratch task passes without git" '[ "$CODE" = 0 ] && [[ "$OUT" == *"scratch mode"* ]]'

new_repo_task
git -C "$TMP/work/main" checkout -q -b other
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "the wrong branch fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"FAIL  on branch other"* ]]'

new_repo_task
touch "$TMP/work/main/stray.txt"
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "uncommitted changes only warn" '[ "$CODE" = 0 ] && [[ "$OUT" == *"warn  the working tree has 1"* ]]'

new_repo_task
echo "garbage" > "$TMP/work/main/.git/index"
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a failing git status fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"FAIL  git status failed"* ]]'

# Adds a linked repo worktree at $TMP/work/second, on the given branch.
add_linked_repo() {
  mkdir -p "$TMP/work/second"
  git -C "$TMP/work/second" init -q -b "$1"
  git -C "$TMP/work/second" config user.name "Test"
  git -C "$TMP/work/second" config user.email "test@example.com"
  git -C "$TMP/work/second" commit -q --allow-empty -m init
  python3 - "$TMP/task/manifest.json" "$TMP" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1]))
m["otherRepos"] = [{"name": "Second", "repositoryLocalPath": sys.argv[2] + "/repos/second",
                    "workspaceLocalPath": sys.argv[2] + "/work/second"}]
json.dump(m, open(sys.argv[1], "w"))
EOF
}

new_repo_task
add_linked_repo feat/abc-do-it
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a linked repo on the task's branch passes" '[ "$CODE" = 0 ] && [[ "$OUT" == *"preflight: ready"* ]]'

new_repo_task
add_linked_repo other
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a linked repo on the wrong branch fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"FAIL  on branch other"* ]]'

new_repo_task
rm -rf "$TMP/work/main/.git"
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a worktree that is not a git repo fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"not a git work tree"* ]]'

new_repo_task
rm -rf "$TMP/work/main"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a missing worktree fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"does not exist"* ]]'

new_repo_task
OUT="$(run_in /)"; CODE=$?
check "running outside the allowed roots fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"outside every allowed root"* ]]'

new_repo_task
python3 - "$TMP/task/manifest.json" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1])); m["branchName"] = None; json.dump(m, open(sys.argv[1], "w"))
EOF
OUT="$(run_in "$TMP/work/main")"; CODE=$?
check "a repo task with no branch fails" '[ "$CODE" = 1 ] && [[ "$OUT" == *"names no branch"* ]]'

new_repo_task
BEFORE="$(find "$TMP" -path '*/.git' -prune -o -type f -print | sort | xargs md5sum)"
run_in "$TMP/work/main" > /dev/null
check "it writes nothing" '[ "$BEFORE" = "$(find "$TMP" -path "*/.git" -prune -o -type f -print | sort | xargs md5sum)" ]'

OUT="$(env -u TASK_WORKSPACE_DIR python3 "$SCRIPT" 2>&1)"; CODE=$?
check "without TASK_WORKSPACE_DIR it fails clearly" '[ "$CODE" = 1 ] && [[ "$OUT" == *"TASK_WORKSPACE_DIR is not set"* ]]'

rm -f "$TMP/task/manifest.json"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a missing manifest fails clearly" '[ "$CODE" = 1 ] && [[ "$OUT" == *"cannot read"* ]]'

echo "not json" > "$TMP/task/manifest.json"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "a broken manifest fails clearly" '[ "$CODE" = 1 ] && [[ "$OUT" == *"not valid JSON"* ]]'

echo '{"primary": {"workspaceLocalPath": "/x"}}' > "$TMP/task/manifest.json"
OUT="$(run_in "$TMP/task")"; CODE=$?
check "an old manifest without a field says so" '[ "$CODE" = 1 ] && [[ "$OUT" == *"taskWorkspace"* ]]'

OUT="$(python3 "$SCRIPT" extra 2>&1)"; CODE=$?
check "an argument fails with the usage" '[ "$CODE" = 2 ] && [[ "$OUT" == *"usage"* ]]'

echo "  through the enforcement wrapper (how Claude Code has to run it)"
new_repo_task
WRAPPED="$(cd "$TMP/work/main" && TASK_WORKSPACE_DIR="$TMP/task" TASK_ID=abc python3 "$HOOKS/exec_in_folder.py" \
  --taskId abc --folder "$TMP/work/main" --command "python3 $SCRIPT" 2>&1)"
check "the wrapper runs it and it passes" '[[ "$WRAPPED" == *"preflight: ready"* ]]'
check "the wrapper logged the call" 'grep -q "preflight.py" "$TMP/task/commands.log"'

PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"python3 .claude/hooks/exec_in_folder.py --taskId \"$TASK_ID\" --folder . --command \"python3 .claude/skills/preflight-check/scripts/preflight.py\""}}'
check "the hook allows the exact command the skill tells Claude Code to run" \
  'echo "$PAYLOAD" | TASK_WORKSPACE_DIR="$TMP/task" python3 "$HOOKS/enforce-workspace.py" | grep -q "\"permissionDecision\": \"allow\""'

PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"python3 .claude/skills/preflight-check/scripts/preflight.py"}}'
check "the hook denies the same script run raw, which is why the skill says to wrap it" \
  'echo "$PAYLOAD" | TASK_WORKSPACE_DIR="$TMP/task" python3 "$HOOKS/enforce-workspace.py" | grep -q "\"permissionDecision\": \"deny\""'

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" = 0 ]
