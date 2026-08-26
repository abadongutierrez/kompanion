import type { TaskRun } from "@kompanion/shared";
import { RunTranscript } from "./RunTranscript.js";
import { RUN_STATUS_ICON, formatRunCost } from "./runStatus.js";

// One run in the task page's list: a header summarising the run, and its
// transcript when open. Which row is open is the caller's business — the
// list keeps exactly one open at a time, and a row has no way to know what
// its siblings are doing.
export function RunRow({
  run,
  teamId,
  taskId,
  isOpen,
  onToggle,
}: {
  run: TaskRun;
  teamId: string;
  taskId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="shrink-0 overflow-hidden rounded border border-neutral-200">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={`flex w-full flex-wrap items-center gap-x-2 px-3 py-2 text-left text-xs ${
          isOpen
            ? "bg-neutral-100 text-neutral-700"
            : "text-neutral-500 hover:bg-neutral-50"
        }`}
      >
        <span className="w-3 shrink-0 text-neutral-400">{isOpen ? "▾" : "▸"}</span>
        <span className="font-medium text-neutral-700">
          {RUN_STATUS_ICON[run.status]} {run.agentTitle ?? "Unknown agent"}
        </span>
        <span>· {run.status.replace("_", " ")}</span>
        <span>· {new Date(run.createdAt).toLocaleString()}</span>
        {run.durationMs != null && <span>· {(run.durationMs / 1000).toFixed(1)}s</span>}
        <span>· {formatRunCost(run.costUsd)}</span>
      </button>

      {/* Mounted only while open: every RunTranscript opens its own
          EventSource, so keeping closed rows mounted would hold one live SSE
          connection per run on the task. */}
      {isOpen && (
        <RunTranscript
          teamId={teamId}
          taskId={taskId}
          runId={run.id}
          className="max-h-[55vh] rounded-none"
        />
      )}
    </div>
  );
}
