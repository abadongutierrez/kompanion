import { useState } from "react";
import type { TaskRun } from "@kompanion/shared";
import { useResumeEligibility, useResumeRun } from "../hooks.js";

const FINISHED = new Set<TaskRun["status"]>(["succeeded", "failed"]);

// The Resume action under the task's newest run: continue that run's CLI
// session with a short follow-up, as a new run. Whether it is offered is the
// server's call (same Agent, same instance, a runtime that can resume — see
// ResumeEligibility on the server); when it isn't, the reason is shown in its
// place so the operator knows to start a fresh run instead.
export function ResumeRun({
  run,
  teamId,
  taskId,
  taskRunning,
}: {
  run: TaskRun;
  teamId: string;
  taskId: string;
  taskRunning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const asked = FINISHED.has(run.status) && !taskRunning;
  const eligibility = useResumeEligibility(teamId, taskId, run.id, { enabled: asked });
  const resume = useResumeRun(teamId, taskId, run.id);

  if (!asked || !eligibility.data) return null;

  if (!eligibility.data.resumable) {
    return (
      <p className="border-t border-neutral-100 px-3 py-1.5 text-xs text-neutral-400">
        Can't resume: {eligibility.data.reason}
      </p>
    );
  }

  const send = () => {
    const text = message.trim();
    if (!text) return;
    resume.mutate(text, {
      onSuccess: () => {
        setMessage("");
        setOpen(false);
      },
    });
  };

  return (
    <div className="border-t border-neutral-100 px-3 py-2 text-xs">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-600 hover:bg-neutral-50"
        >
          ↻ Resume
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`resume-${run.id}`} className="text-neutral-500">
            Follow-up — continues this run's conversation
          </label>
          <textarea
            id={`resume-${run.id}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            disabled={resume.isPending}
            className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
            placeholder="e.g. Also add a test for the empty case."
          />
          {resume.isError && <p className="text-red-600">{resume.error.message}</p>}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={send}
              disabled={!message.trim() || resume.isPending}
              className="rounded bg-neutral-800 px-2 py-0.5 text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {resume.isPending ? "Resuming…" : "Send follow-up"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={resume.isPending}
              className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
