# Feature Spec: Agent Models — pluggable agent execution backends

> Reverse-engineered from the implementation plan
> `.plans/agent-models-and-opencode.md`. This document describes *what* the
> feature is and *why* — the plan describes how it's built. Where the plan
> leaves behavior undefined, it's listed under Open Questions rather than
> silently resolved here.

## Problem

Every Role today executes on a single hardcoded backend: the Claude Code
CLI. Concretely, that means:

- There is no way to run a Role on a different agent CLI (e.g. OpenCode),
  even as an experiment.
- Backend configuration has no home — it would have to be bolted onto Role
  as inline fields, and every future backend would fight that schema again.
- There is no way for several Roles to share one backend configuration.

## Summary

Introduce **Agent Models** as a first-class, app-wide library entity that
describes *how* an agent run is executed. A Role references exactly one
Agent Model; many Roles may share one — the same relationship shape as
Roles↔Teams today. The feature ships with two backend kinds — Claude Code
CLI and OpenCode CLI — with zero behavior change for existing Roles.

## Goals

- **G1.** A reusable, app-wide Agent Model library, managed like the other
  libraries (Projects, Teams, Repositories, Roles).
- **G2.** Every Role is assigned an Agent Model (required); assignment is
  part of role create/edit.
- **G3.** OpenCode is a real, working second backend at parity with the
  Claude path: live-streamed run events, summary/cost capture, and
  workspace-boundary enforcement.
- **G4.** Zero regression for existing Claude-backed Roles and runs.
- **G5.** Adding a future backend kind (e.g. an API-key-based one) is
  additive — a new kind value plus whatever attributes it actually needs —
  not a retrofit of backend config onto Role.

## Non-goals

- Remote/sandboxed execution, session resumption, skill injection,
  gateway/provider catalogs (all present in the reference Paperclip;
  deliberately not replicated).
- API-key-based backends — the entity shape anticipates them, but no such
  kind or its fields are built now.
- Deleting Agent Models (consistent with every other library entity).
- Changing what a Role's harness *is* — `harnessPath` stays exactly what it
  is today, orthogonal to which backend executes the Role.

## Concepts

**Agent Model** — user-visible attributes:

| Attribute   | Meaning |
|---|---|
| title       | Display name, e.g. "Claude Code (CLI)". |
| slug        | Unique app-wide; auto-derived from title on create, directly editable on update (same rules as Roles). |
| kind        | `claude_cli` or `opencode_cli`; extensible without a schema migration. |
| binary path | Optional override of the CLI binary location; falls back to a per-kind default when unset. |
| model       | Optional provider/model string (e.g. from `opencode models`); used by `opencode_cli`, ignored by `claude_cli`. |

**Defaults & upgrade:** a seeded "Claude Code (CLI)" Agent Model exists
after upgrade, and every pre-existing Role is repointed to it — so nothing
about existing Roles' behavior changes.

## Functional requirements

### Library management

- **FR-1.** Users can list, create, and edit Agent Models — via a new
  top-level UI section ("Agent Models" alongside Projects and Roles,
  following the Roles library pattern) and via the API. No delete.
- **FR-2.** Slug behaves exactly like Role slugs: auto-derived on create
  (with collision suffixing), editable on update, unique app-wide.
- **FR-3.** Kind-specific attributes (binary path, model) are presented
  contextually by selected kind in the UI.

### Role assignment

- **FR-4.** Role create/edit includes a required Agent Model picker
  populated from the library. Role reads continue to expose the scalar
  reference; the UI joins against the library client-side for display, as
  it already does elsewhere.

### Run execution

- **FR-5.** When a task run starts, the runner resolves the Role's Agent
  Model and dispatches on its kind.
- **FR-6.** `claude_cli`: behavior is identical to today. The only change
  is that the binary resolution honors the Agent Model's optional binary
  path override before falling back to the current default chain.
- **FR-7.** `opencode_cli`: the run invokes the OpenCode CLI with the
  Role's harness content composed into the prompt, streams its output into
  run events live (same wiring as the Claude path), and accumulates
  summary, cost, and failure reason across the stream.
- **FR-8.** Run result semantics are backend-agnostic: summary, cost, and
  error mean the same thing regardless of kind, even though each backend's
  raw stream shape differs.

### Enforcement

- **FR-9.** OpenCode runs enforce the same workspace boundary as Claude
  runs, using OpenCode's own native permission mechanism: writes outside
  the task's allowed roots are denied, each `otherRepos` entry gets an
  explicit allow, and ordinary in-workspace actions are auto-approved.
- **FR-10.** Backend-specific wiring stays backend-specific: Claude
  harness-skill copying and hook installation apply only to `claude_cli`;
  the workspace bookkeeping (`manifest.json`) is written either way.

## Non-functional requirements

- **NFR-1. Dual-server parity.** Everything above lands identically in
  `server/` and `server-kotlin/` (per `AGENTS.md`), against the same DB.
- **NFR-2. No regression.** Existing Claude-backed runs, the UI, and the
  e2e suite behave exactly as before.
- **NFR-3. Test economics.** API-level tests cover Agent Model CRUD and
  Role↔Agent Model assignment; no automated end-to-end OpenCode run (it
  would spend real money every CI run).

## Acceptance criteria

1. **Upgrade:** post-migration, the seeded default Agent Model exists, all
   pre-existing Roles reference it, and a known-good Claude-backed task run
   succeeds unchanged.
2. **Second backend works for real:** create an `opencode_cli` Agent Model
   (with a real model id), a Role using it, and trigger a real task run on
   **both** servers: the expected file write/commit actually happens, run
   events stream live, and summary/cost populate correctly.
3. **Enforcement is real:** an out-of-bounds write is genuinely blocked; a
   task with `otherRepos` can touch the secondary repo and nothing else.
4. **Health:** typecheck and the Kotlin build are clean; the e2e suite is
   green; API tests for CRUD and assignment pass against both stacks.

## Open questions

Behavior the plan leaves undefined; a decision is needed before or during
implementation:

1. **Transcript rendering.** Run events from OpenCode persist and stream,
   but the transcript view only understands Claude's event shapes today —
   is "OpenCode runs render an empty transcript" accepted, or is extending
   the transcript part of this feature?
2. **Backend-specific prompt wording.** The task prompt currently instructs
   the agent to use a Claude-hook-specific helper script for `otherRepos`.
   What should the prompt say for OpenCode runs?
3. **Harness skills on non-Claude backends.** Harness *skills* are silently
   inert for `opencode_cli` (only the CLAUDE.md content applies). Should
   the UI surface that, or is silent degradation acceptable?
4. **Kind-specific attribute semantics.** `binary path`/`model` are defined
   per-kind informally; when a kind arrives that has no binary at all, are
   these hidden, reused, or replaced?
