# Feature Spec: <name>

> Derived from: <link to plan / discussion / issue, or "greenfield">
>
> A spec describes **what** the feature is and **why** — a plan describes
> **how** it's built. Keep the layers separate: implementation details
> (file names, migrations, functions, routes, mechanisms) do not belong
> here, and implementation defects found in the plan get fixed *in the
> plan*, not recorded here.

## How to use this template

When deriving a spec from a plan, invert the perspective section by
section:

| Plan section | Spec section | Filter |
|---|---|---|
| Context | Problem + Summary | Keep the motivation, drop the archaeology |
| Scope | Non-goals | Transfers nearly verbatim |
| Data model | Concepts | Strip DDL; keep user-visible attributes only |
| Endpoints / UI | Functional requirements | Routes → capabilities ("list, create, edit") |
| Runner/logic changes | Functional requirements | Mechanisms → behavioral claims |
| Verification | Acceptance criteria | Steps → observable outcomes |

Rules of thumb:

- Every requirement is atomic and testable — one verifiable claim each.
- Number them (FR-x / NFR-x) so acceptance criteria can trace back.
- Undefined behavior becomes an **Open Question**, never a silently
  smuggled-in answer.
- Delete any section that genuinely doesn't apply rather than padding it.

---

## Problem

<What is impossible or painful today, stated concretely. 2–5 bullets max.
No solution language.>

## Summary

<The feature in one short paragraph: what exists after this ships.>

## Goals

- **G1.** <…>
- **G2.** <…>

## Non-goals

<Explicit exclusions — things a reader might reasonably assume are
included. Carry over the plan's scope section; add adjacent temptations.>

## Concepts

<New named things the user can see or reference, with their user-visible
attributes. A small table works well. Include defaults and upgrade/migration
behavior visible to existing users.>

## Functional requirements

Group by area (<area 1>, <area 2>, …):

- **FR-1.** <…>
- **FR-2.** <…>

## Non-functional requirements

- **NFR-1.** <Parity across backends/stacks, per `AGENTS.md`, when applicable.>
- **NFR-2.** <Regression/compatibility constraints.>
- **NFR-3.** <Performance/cost/test-economics constraints.>

## Acceptance criteria

<Observable outcomes, not test steps. Numbered; each should map back to at
least one FR/NFR.>

1. <…>
2. <…>

## Open questions

<Behavior left undefined by the source material, phrased as decisions
needed — each with the candidate resolutions if known.>
