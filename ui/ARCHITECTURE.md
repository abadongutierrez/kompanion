# Architecture — `ui`

This is the architecture `ui` follows: **feature-sliced**, applied to a React
19 + Vite SPA that talks REST and SSE to `server-kotlin`, caches everything
server-owned in TanStack Query, and styles with Tailwind 4.

This document is the rule, not a description of the current tree. Most of
the code predates it and still lives in a flat `src/components/`. See
[Where we are today](#where-we-are-today) for what conforms and what moves
next.

---

## Why feature slices here

The UI's domains are already visible in its cache keys: projects, teams,
agents, tasks, runs, repositories, budget. Each one has its own endpoints,
its own invalidation rules, and its own screens, and they change at
different speeds — the task board is edited weekly, the project list
almost never.

Grouping by kind (`components/`, `hooks/`, `utils/`) spreads one change
across every directory and lets a 1,000-line component hide in a folder of
seventeen peers. Grouping by domain keeps a change to the board inside
`features/tasks/`.

It also mirrors the server. `features/*/api.ts` is an outbound adapter,
`hooks.ts` is the use case, and `@kompanion/shared` carries the domain
types both sides agree on.

---

## The dependency rule

There is exactly one:

> Source dependencies point **downward** through `app → pages → features →
> shared`. Nothing ever imports upward.

| Layer      | May import                | Holds                                        |
| ---------- | ------------------------- | -------------------------------------------- |
| `app/`     | pages, features, shared   | providers, routes, the chrome around a route |
| `pages/`   | features, shared          | route components that compose features       |
| `features/`| other features, shared    | one domain: its api, keys, hooks, components |
| `shared/`  | nothing in this app       | the fetch wrapper, UI primitives, formatting |

`shared/` is the bottom. If something in `shared/` needs to know what a Task
is, it does not belong in `shared/`.

### Crossing between features

A feature may import another feature, but **only through its barrel**:

```ts
import { useAgents } from "@/features/agents/index.js";   // yes
import { useAgents } from "@/features/agents/hooks.js";   // no
```

The board genuinely needs agents (the assignee dropdown) and repositories
(the linked-repo list); pretending otherwise would mean threading props
through three levels for no gain. The barrel is what keeps that honest — a
feature's internals stay free to move, and its public surface is one file
you can read.

The one exception to the barrel is `keys.ts`, which any feature may import
directly:

```ts
import { taskKeys } from "@/features/tasks/keys.js";   // yes, always
```

A mutation often invalidates caches it does not own — running a task
invalidates the run list, the task list and both spend figures — and the key
factories are the contract for that. They import nothing, so reaching them
directly cannot cycle; reaching them through a barrel would, since the barrel
pulls in components that import back.

Strict Feature-Sliced Design would forbid this and add an `entities` layer
underneath. At this size that is ceremony we would pay for and not use. The
signal to add `entities` is a genuine import **cycle** between two features,
not the first cross-feature import.

### Path aliases

Layer-crossing imports use the `@/` alias (`tsconfig.json` `paths`, mirrored
in `vite.config.ts` `resolve.alias`). Imports inside a single feature stay
relative. Both keep the `.js` extension the rest of the repo uses.

---

## Anatomy of a feature

```
features/tasks/
  api.ts          # endpoints, built on shared/api/request
  keys.ts         # the query-key factory — the only place keys are spelled
  hooks.ts        # useTasks, useCreateTask, ... — all useQuery/useMutation
  components/     # the feature's own UI
  lib/            # pure helpers, no React
  index.ts        # public API: what other layers may import
```

Not every feature needs every file. None of them may skip `index.ts`.

### Query keys live in `keys.ts`

```ts
export const taskKeys = {
  all: ["tasks"] as const,
  byTeam: (teamId: string) => ["tasks", teamId] as const,
  comments: (taskId: string) => ["taskComments", taskId] as const,
};
```

A key written inline is a silent bug waiting to happen: an invalidation
that misspells its key throws no error, it just leaves stale data on
screen. The factory makes that a type error instead.

### Components do not call `useQuery`

Data access goes through the feature's hooks. A component that renders a
task list calls `useTasks(teamId)`; it does not know the key, the endpoint,
or the retry policy. This is what makes a component testable without a
`QueryClientProvider` around it.

---

## State ownership

Four kinds of state, four homes. Most "the cache is confusing" problems are
one kind living in the wrong home.

- **Server state** — TanStack Query. Never mirrored into React state.
- **URL state** — the router. Which project, which section, which task.
- **Client state** — `useState`, lifted only as far as needed.
- **Cross-cutting client state** — currently none. If it appears, it goes in
  `app/providers.tsx`, not a new global store.

---

## Where we are today

The tree above is the tree on disk. `src/components/` is gone, and so is the
flat `src/api.ts`.

Eight features, each with `api.ts` + `keys.ts` + `hooks.ts` + `index.ts`:
projects, teams, agents, tasks, runs, repositories, budget, system. Five
route components in `pages/`. Four primitives in `shared/ui/`. No component
calls `useQuery` or `useMutation` directly any more, and no query key is
written as a literal outside a `keys.ts`.

`TaskBoard.tsx` went from 1,023 lines to 193 — columns, view state and a
sub-page frame. What was inside it is now `TaskCard`, `CreateTaskForm`,
`EditTaskForm`, `DependenciesSection`, `CommentsSection`, plus
`TaskTypeSelect` and `RepositoryCheckboxes`, which both forms had duplicated.
The largest file in the UI is now 210 lines.

Still to do: there is no linter. Until `eslint-plugin-boundaries` (or
`import/no-restricted-paths`) encodes the table above, the dependency rule is
convention only, and this is the point where conventions start to erode.

## Known problems, not introduced here

Two things the split made visible and deliberately did not change:

- **Five calls bypass `request`.** `unassignAgent`, `deleteTask`,
  `addTaskRepository`, `removeTaskRepository` and `removeTaskDependency` call
  `fetch` directly and never check `res.ok`. A failed DELETE resolves
  successfully, the mutation reports success, and the list silently
  re-renders unchanged. These want a `requestVoid` in `shared/api`.
- **`getTeamDailySpend` has no caller.** Either the sparkline it was written
  for is still coming, or it is dead.

## Where the primitives stop

`shared/ui` covers the densities that repeat. Three places deliberately use
raw elements instead: the budget row's cap field, the dependency picker's two
selects, and the comment box. All three run at a tighter density used nowhere
else, and widening the primitives to serve one caller each would make them
worse for the twenty that fit.
