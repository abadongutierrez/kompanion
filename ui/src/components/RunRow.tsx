import { useState } from "react";
import { AGENT_RUNTIME_LABEL, type TaskRun } from "@kompanion/shared";
import { RunTranscript } from "./RunTranscript.js";
import {
  RUN_STATUS_ICON,
  formatRunCost,
  formatTokens,
  totalInputTokens,
} from "./runStatus.js";

// One run in the task page's list: a header summarising the run, and its
// logs when open. Which row is open is the caller's business — the list
// keeps at most one open at a time, and a row has no way to know what its
// siblings are doing.
//
// The header itself is not a button. Toggling lives on an explicit "Show
// logs" control instead, so the run's own details — agent, timestamp, cost —
// stay selectable text you can copy out of, and the affordance is stated
// rather than implied by a whole clickable strip.
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
  const logsId = `run-logs-${run.id}`;
  const tokensIn = totalInputTokens(run);

  // null = each thinking/tool block keeps its own default. The nonce bumps on
  // every click so the transcript can remount its blocks; without it, one
  // "Expand all" would pin them open and individual toggling would stop
  // working.
  const [blocksOpen, setBlocksOpen] = useState<boolean | null>(null);
  const [blocksNonce, setBlocksNonce] = useState(0);

  function toggleAllBlocks() {
    setBlocksOpen((prev) => !prev);
    setBlocksNonce((n) => n + 1);
  }

  return (
    <div className="shrink-0 overflow-hidden rounded border border-neutral-200">
      <div
        className={`flex w-full flex-wrap items-center gap-x-2 px-3 py-2 text-xs ${
          isOpen ? "bg-neutral-100 text-neutral-700" : "text-neutral-500"
        }`}
      >
        <span className="font-medium text-neutral-700">
          {RUN_STATUS_ICON[run.status]} {run.agentTitle ?? "Unknown agent"}
        </span>
        <span>· {run.status.replace("_", " ")}</span>
        <span>· {new Date(run.createdAt).toLocaleString()}</span>
        {run.durationMs != null && <span>· {(run.durationMs / 1000).toFixed(1)}s</span>}
        <span>· {formatRunCost(run.costUsd)}</span>
        {tokensIn != null && (
          // The breakdown lives in the tooltip: the headline number is what
          // the model read in total, but almost all of it is usually cache,
          // which bills at a tenth of fresh input.
          <span
            title={[
              `${run.inputTokens ?? 0} fresh input`,
              `${run.cacheReadTokens ?? 0} read from cache`,
              `${run.cacheWriteTokens ?? 0} written to cache`,
            ].join("\n")}
          >
            · {formatTokens(tokensIn)} in
          </span>
        )}
        {run.outputTokens != null && (
          <span>· {formatTokens(run.outputTokens)} out</span>
        )}
        <span>· {AGENT_RUNTIME_LABEL[run.runtime]}</span>
        {run.model && (
          <span>
            · <code>{run.model}</code>
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* Only meaningful once the logs are showing — there is nothing to
              expand inside a collapsed transcript. */}
          {isOpen && (
            <button
              type="button"
              onClick={toggleAllBlocks}
              className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-600 hover:bg-neutral-50"
            >
              {blocksOpen ? "⊟ Collapse all" : "⊞ Expand all"}
            </button>
          )}
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={logsId}
            onClick={onToggle}
            className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-600 hover:bg-neutral-50"
          >
            {isOpen ? "▾ Hide logs" : "▸ Show logs"}
          </button>
        </span>
      </div>

      {/* Mounted only while open: every RunTranscript opens its own
          EventSource, so keeping closed rows mounted would hold one live SSE
          connection per run on the task. */}
      {isOpen && (
        <RunTranscript
          id={logsId}
          teamId={teamId}
          taskId={taskId}
          runId={run.id}
          runtime={run.runtime}
          blocksOpen={blocksOpen}
          blocksNonce={blocksNonce}
          className="max-h-[55vh] rounded-none"
        />
      )}
    </div>
  );
}
