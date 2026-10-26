# Claude usage window monitor in the left sidebar — research

Status: research only, nothing built yet. Written 2026-10-26.

## The question

Can the left sidebar show how much of the Claude usage window is left, so
the operator knows before starting runs whether Claude Code agents will
hit a limit?

## What "usage window" means

Claude subscriptions (Pro, Max, Team, Enterprise seats) limit use with
rolling windows, not dollars:

| Window | What it is |
| --- | --- |
| `five_hour` | Rolling 5-hour session window. The one people usually mean. |
| `seven_day` | Rolling 7-day window across all models. |
| per-model weekly | Extra weekly windows for some models (e.g. Opus). |

Each window has a **utilization** (percent used) and a **reset time**.

This only applies when the Claude Code CLI is logged in with a
subscription (OAuth). When it runs with `ANTHROPIC_API_KEY`, there is no
usage window — only per-minute API rate limits and dollar cost, which the
Budget page already tracks from `total_cost_usd`.

## Where the data can come from

None of these are official, documented APIs. All were found in community
tooling and Claude Code issues, so field names must be checked against a
real payload before we code against them.

### 1. OAuth usage endpoint (best fit)

`GET https://api.anthropic.com/api/oauth/usage`

- Headers: `Authorization: Bearer <oauth access token>`,
  `anthropic-beta: oauth-2025-04-20`.
- Token: the CLI's own credentials, `~/.claude/.credentials.json`
  (`claudeAiOauth.accessToken`) of the user the server runs as. On macOS
  it is in the Keychain instead. The CLI refreshes it itself.
- Response (older shape): `five_hour` and `seven_day` objects, each with
  `utilization` (0–100) and `resets_at` (ISO timestamp); either can be
  `null`. Newer reports say the flat keys may be null and the live data is
  in a `limits` array (`kind`, percent, reset time). Parse both.
- This is what Claude Code's own `/usage` / `/status` screen calls.

Pros: on demand, works with no run in progress, gives real percentages.
Cons: undocumented, may change or be blocked any time; the server must
read a credential file it does not own (read-only, never log it, never
send it to the UI).

### 2. `rate_limit_event` in stream-json (free side signal)

Since CLI ~v2.1.45, `claude -p --output-format stream-json` — which
`ClaudeCodeRunner` already uses — can emit:

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1761500000,"rateLimitType":"five_hour", "utilization": 0.82}}
```

- `status`: `allowed` / `allowed_warning` / `rejected`.
- Field casing differs between sources (`resetsAt` vs `resets_at`).
- Headless mode often has status only, no utilization — the requests to
  add percentages (anthropics/claude-code #77018, #78476) are not done.
- Known bug in v2.1.74: the event could be written mid-line and break
  NDJSON parsing. Our reader should tolerate a bad line.

Pros: no extra calls, no credential reading; we already get these events.
Cons: only updates while a run is active; may lack percentages.

Today `ClaudeCodeRunner.interpret` only reads the final `result` event, so
these events are ignored.

### 3. Status line JSON

Claude Code passes `rate_limits.five_hour` / `rate_limits.seven_day`
(`used_percentage`, `resets_at` epoch seconds) to a status line script.
Only in interactive sessions, so not usable from our headless runs.

### 4. Local transcripts (`~/.claude/projects/**/*.jsonl`)

Tools like `ccusage` (npm) sum tokens from local logs and guess the
5-hour block. It is an estimate: it does not see usage from other
machines or claude.ai, and does not know the real limit. Not worth it now
that options 1 and 2 exist.

## Recommendation

Build it in two small steps.

**Step 1 — sidebar widget backed by the OAuth endpoint.**

- Server: `GET /api/claude/usage` in `server-kotlin` (new
  `ClaudeUsageService` + controller).
  - Reads the token from `~/.claude/.credentials.json` (path overridable
    by env `CLAUDE_CREDENTIALS_PATH`).
  - Calls the endpoint, caches the result for 60 s so many open tabs do
    not hammer it.
  - Returns a normalized shape, e.g.
    `{ available: boolean, reason?: string, windows: [{ kind, utilization, resetsAt }], fetchedAt }`.
  - Missing file, API-key setup, or any error → `available: false` with a
    reason. Never return the token.
- Shared: add the Zod schema to `packages/shared/`.
- UI: a small `ClaudeUsageCard` at the bottom of `ui/src/app/layouts/Sidebar.tsx`
  — not a new nav item, since the usage is per machine/account, not per
  project.
  - One thin bar per window: "5h 62% · resets 14:30", "7d 31%".
  - Colors: neutral under 70%, amber 70–90%, red over 90%.
  - Polls every 60 s with React Query (`refetchInterval`), and refetches
    when a run finishes.
  - Hidden or shows "Usage not available" when `available` is false.
  - Sidebar is `w-40`; keep text short or let the card use two lines.

**Step 2 — use `rate_limit_event` from runs.**

- In `ClaudeCodeRunner`, pick up the latest `rate_limit_event` and push it
  to `ClaudeUsageService` (update the cache), so the widget updates live
  during a run without extra calls.
- Optional: store it on `task_runs` so a run that failed with `rejected`
  can say "hit the 5-hour limit, resets at …".
- Later: let the scheduler/heartbeat skip starting Claude Code runs while
  status is `rejected`, the same way the budget gate does.

## Risks and open questions

- **Undocumented endpoint.** Could break without warning. Keep the code
  isolated and fail soft (widget hides).
- **Terms of use.** Using the CLI's OAuth token from our own server is a
  grey area. It is the same machine and user, read-only, and only for a
  usage readout, but check before shipping more widely.
- **Which account?** The server reads one credentials file. If runs use a
  different `HOME` or `CLAUDE_CONFIG_DIR`, the widget would show the wrong
  account. Use the same config dir the runner uses.
- **Other runtimes.** opencode and pi have no such window (or a different
  provider). The widget is Claude-only; label it "Claude usage".
- **macOS Keychain.** Token is not in a file there. Out of scope for now
  (dev setup is Linux/WSL); report `available: false`.

## Sources

- ccusage (PyPI) — OAuth usage endpoint shape: https://pypi.org/project/ccusage/
- ClaudeUsage — endpoint and headers: https://github.com/backmind/ClaudeUsage
- Status line limits: https://skoula.cz/blog/2026/6/how-to-display-context-and-5h-7d-limits-in-the-claude-code-status-bar/
- `RateLimitEvent` shape: https://claude-code.hexdocs.pm/ClaudeCode.Message.RateLimitEvent.html
- stream-json cheatsheet: https://littlebearapps.com/help/untether/claude-stream-json-cheatsheet/
- Mid-line bug: https://claudeissues.com/issue/49640-bug-rate-limit-event-injected-mid-ndjson-line-in-stream-json-output-corrupting-a
- Headless percentages requests: https://claudeissues.com/issue/77018-expose-rate-limit-utilization-used-percentage-in-headless-contexts-stream-json-o,
  https://claudeissues.com/issue/78476-feature-request-expose-subscription-usage-percentages-headlessly-stream-json-rat
