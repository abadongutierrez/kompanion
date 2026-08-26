import { useEffect } from "react";
import type { TaskRun, TaskWithRepositories } from "@kompanion/shared";
import { RunTranscript } from "./RunTranscript.js";

const RUN_STATUS_ICON: Record<TaskRun["status"], string> = {
  running: "⏳",
  succeeded: "✅",
  failed: "❌",
  over_budget: "💸",
};

// Full-screen read view of one task and its latest run. The transcript is the
// same component the card renders inline — here it just gets the whole dialog
// height instead of a 16rem box, which is the entire point of "expanded".
export function TaskExpandedView({
  teamId,
  task,
  run,
  onClose,
}: {
  teamId: string;
  task: TaskWithRepositories;
  run?: TaskRun;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Expanded view of ${task.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col gap-3 rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">{task.title}</h2>
            <p className="text-xs text-neutral-500">
              {task.type} · {task.status.replace("_", " ")}
            </p>
          </div>
          <button
            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {task.description && (
          <p className="max-h-32 shrink-0 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-sm text-neutral-700">
            {task.description}
          </p>
        )}

        {run ? (
          <>
            <p className="shrink-0 text-xs text-neutral-500">
              {RUN_STATUS_ICON[run.status]} {run.status.replace("_", " ")} ·{" "}
              {new Date(run.createdAt).toLocaleString()}
              {run.durationMs != null &&
                ` · ${(run.durationMs / 1000).toFixed(1)}s`}
              {run.costUsd != null && ` · $${run.costUsd.toFixed(4)}`}
            </p>
            <RunTranscript
              teamId={teamId}
              taskId={task.id}
              runId={run.id}
              className="min-h-0 flex-1"
            />
          </>
        ) : (
          <p className="text-sm text-neutral-400">This task has not been run yet.</p>
        )}
      </div>
    </div>
  );
}
