import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltinHarness, Role } from "@kompanion/shared";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// workspace/ is a single folder shared by both this server and
// server-kotlin (repo root, sibling of server/ and server-kotlin/) — no
// longer duplicated per backend. WORKSPACE_ROOT lets it be pointed
// elsewhere (resolved against cwd if relative); the default assumes this
// server runs from server/, so ".." is the repo root.
export const workspaceRoot = process.env.WORKSPACE_ROOT
  ? resolve(process.env.WORKSPACE_ROOT)
  : join(serverRoot, "..", "workspace");

// workspace/harnesses/ holds starter templates (engineer, qa,
// product_manager, project_manager) built up over the life of this
// project — no longer auto-selected by any discipline convention, just
// pre-made folders a new Role's harnessPath can point at, listed via
// listBuiltinHarnesses() below.
const harnessesRoot = join(workspaceRoot, "harnesses");

// Task workspaces are shared across roles: whichever role a Task is
// currently assigned to runs in the *same* directory, so e.g. QA can see
// Engineer's actual output instead of a role-isolated copy. harnesses/
// stays a pure, immutable template; tasks/ is the mutable runtime state.
export const workspacesRoot = join(workspaceRoot, "tasks");

// harnessPath is the sole source of a Role's harness — no fallback.
export function resolveHarnessDir(role: Role): string | null {
  return existsSync(role.harnessPath) ? role.harnessPath : null;
}

export function resolveWorkspaceDir(taskId: string): string {
  return join(workspacesRoot, taskId);
}

const KNOWN_ACRONYMS = new Set(["qa"]);

export function listBuiltinHarnesses(): BuiltinHarness[] {
  if (!existsSync(harnessesRoot)) return [];
  return readdirSync(harnessesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      title: entry.name
        .split("_")
        .map((word) =>
          KNOWN_ACRONYMS.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1),
        )
        .join(" "),
      path: join(harnessesRoot, entry.name),
    }));
}
