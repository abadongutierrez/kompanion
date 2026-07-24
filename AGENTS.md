# Agent notes

## Dual-server parity

This repo has two backend implementations of the same app:

- `server/` — the original Node/Express/TypeScript server.
- `server-kotlin/` — a Kotlin/Spring Boot port of it, same DB/schema, same
  API shapes, different port (see `ui/vite.config.ts`'s `/api` proxy
  target, which points at whichever one is currently "live").

**Any feature, endpoint, or behavior change added to one must also be
added to the other — no exceptions.** They are meant to be fully
interchangeable backends for the same UI, not a primary implementation
plus a lagging fork. Before implementing a backend change, plan for both
stacks up front; if something is awkward to replicate in one of them,
flag it rather than silently only building it in the other.
