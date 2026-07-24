import type { Role, Task } from "@sdlc/shared";
import { sql } from "../db/client.js";
import { resolveHarnessDir } from "./claudeHarness.js";
import { runTaskWithClaude } from "./runTask.js";

type HeartbeatStatus = {
  enabled: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastRunTaskId: string | null;
  lastError: string | null;
};

const status: HeartbeatStatus = {
  enabled: false,
  intervalMs: 0,
  lastTickAt: null,
  lastRunTaskId: null,
  lastError: null,
};

let ticking = false;

async function findEligibleTask(): Promise<{ task: Task; role: Role } | null> {
  const candidates = await sql`
    select * from tasks
    where status = 'backlog' and role_id is not null
    order by created_at asc
  `;

  for (const task of candidates) {
    const [role] = await sql`select * from roles where id = ${task.roleId}`;
    if (role && resolveHarnessDir(role as unknown as Role)) {
      return { task: task as unknown as Task, role: role as unknown as Role };
    }
  }
  return null;
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  status.lastTickAt = new Date().toISOString();

  try {
    const found = await findEligibleTask();
    if (found) {
      status.lastRunTaskId = found.task.id;
      await runTaskWithClaude(found.task, found.role);
      status.lastError = null;
    }
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    console.error("heartbeat tick failed:", err);
  } finally {
    ticking = false;
  }
}

export function startHeartbeat(): void {
  const enabled = process.env.HEARTBEAT_ENABLED === "true";
  const intervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000);

  status.enabled = enabled;
  status.intervalMs = intervalMs;

  if (!enabled) {
    console.log("heartbeat disabled (set HEARTBEAT_ENABLED=true to enable)");
    return;
  }

  console.log(`heartbeat enabled, ticking every ${intervalMs}ms`);
  setInterval(() => {
    void tick();
  }, intervalMs);
}

export function getHeartbeatStatus(): HeartbeatStatus {
  return { ...status };
}
