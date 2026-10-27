import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { runtimeLabel, type ActiveRun } from "@kompanion/shared";
import { Muted, SectionHeading } from "@/shared/ui/index.js";
import { useActiveRuns } from "../hooks.js";
import { RUN_STATUS_ICON } from "../lib/runStatus.js";

// The project's Runs tab: what is running right now, across every team.
// Basic facts only — the transcript, tokens and cost live on the task page,
// which each row links to.
export function ActiveRunsPanel({ projectId }: { projectId: string }) {
  const runs = useActiveRuns(projectId);
  const now = useNow();

  if (!runs.data) return null;

  return (
    <div className="space-y-2">
      <SectionHeading>Active runs</SectionHeading>
      {runs.data.length === 0 ? (
        <Muted size="xs">Nothing is running right now.</Muted>
      ) : (
        <ul className="space-y-1">
          {runs.data.map((run) => (
            <ActiveRunRow key={run.runId} run={run} projectId={projectId} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActiveRunRow({
  run,
  projectId,
  now,
}: {
  run: ActiveRun;
  projectId: string;
  now: number;
}) {
  const startedAt = new Date(run.startedAt);
  return (
    <li className="flex flex-wrap items-center gap-x-2 rounded border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
      <Link
        to={`/projects/${projectId}/tasks/${run.taskId}`}
        className="text-sm font-medium text-neutral-800 underline-offset-2 hover:underline"
      >
        {RUN_STATUS_ICON.running} {run.taskTitle}
      </Link>
      <span>· {run.agentTitle ?? "Unknown agent"}</span>
      <span>· {run.teamName}</span>
      <span>· {runtimeLabel(run.runtime)}</span>
      {run.model && (
        <span>
          · <code>{run.model}</code>
        </span>
      )}
      <span className="ml-auto tabular-nums" title={startedAt.toLocaleString()}>
        running for {formatElapsed(now - startedAt.getTime())}
      </span>
    </li>
  );
}

// Ticks once a second so the elapsed times move between polls.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// 45s, 3m 05s, 1h 02m. Clamped at zero: the server's clock may be a little
// ahead of the browser's.
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
