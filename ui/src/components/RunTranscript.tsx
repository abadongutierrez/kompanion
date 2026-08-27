import { useEffect, useRef, useState } from "react";
import {
  type AgentRuntime,
  applyRunEvent,
  createTranscriptState,
  type RunEventRaw,
  type TranscriptState,
} from "@kompanion/shared";
import { api } from "../api.js";

// Same component serves a live run and a replay of a finished one: the SSE
// endpoint always replays persisted history first, then either streams new
// events (still running) or sends `done` immediately (already finished) —
// so there's no branching needed here for "live" vs "historical".
export function RunTranscript({
  id,
  teamId,
  taskId,
  runId,
  // Which event shape to reduce. Comes from the run, never from the Agent's
  // current setting — replaying an old run has to use the reducer that
  // matches what was stored.
  runtime,
  // Forces every thinking/tool block open (true) or shut (false); null
  // leaves each to its own default. `blocksNonce` changes on every
  // expand-all/collapse-all click and is folded into each block's key, which
  // remounts them — without that, React would keep reasserting `open` and a
  // reader could never close a single block again afterwards.
  blocksOpen = null,
  blocksNonce = 0,
  // Callers own the box: the card leaves this unset for the compact 16rem
  // default, the expanded view passes a flex-fill class instead.
  className = "max-h-64",
  onCostChange,
}: {
  // Lets a caller point an aria-controls at this box — RunRow's "Show logs"
  // button does, so the control and the region it opens are linked.
  id?: string;
  teamId: string;
  taskId: string;
  runId: string;
  runtime: AgentRuntime;
  blocksOpen?: boolean | null;
  blocksNonce?: number;
  className?: string;
  // Reported on every change so an ancestor can fold a still-running run
  // into its own spend total; null once the run has no live figure to add.
  onCostChange?: (costUsd: number | null) => void;
}) {
  const [state, setState] = useState<TranscriptState>(() => createTranscriptState());
  const lastSeqRef = useRef(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    setState(createTranscriptState());
    lastSeqRef.current = -1;

    const source = new EventSource(api.runEventsUrl(teamId, taskId, runId));

    source.onmessage = (event) => {
      let parsed: { seq: number; payload: unknown };
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      // The server can re-send events already delivered live (a narrow
      // reconciliation window around the run finishing) — seq lets us
      // silently drop the duplicate instead of double-applying a delta.
      if (parsed.seq <= lastSeqRef.current) return;
      lastSeqRef.current = parsed.seq;
      setState((prev) => applyRunEvent(prev, parsed.payload as RunEventRaw, runtime));
    };
    source.addEventListener("done", () => source.close());
    source.onerror = () => {
      // EventSource retries automatically; once the server has sent "done"
      // it already called close() above so this won't fire for the normal
      // completion path.
    };

    return () => source.close();
  }, [teamId, taskId, runId, runtime]);

  // Kept in a ref so a caller passing an inline arrow doesn't re-subscribe
  // the SSE stream on every render.
  const onCostChangeRef = useRef(onCostChange);
  onCostChangeRef.current = onCostChange;

  // Stop reporting once the run is finished: from that point the run's own
  // cost_usd is persisted and shows up in the caller's own totals, so
  // continuing to report would double-count it.
  useEffect(() => {
    onCostChangeRef.current?.(state.finished ? null : state.costUsd);
    return () => onCostChangeRef.current?.(null);
  }, [state.costUsd, state.finished]);

  useEffect(() => {
    if (stickToBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [state.blocks.length]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const renderable = state.blocks.filter((b) => b.kind !== "system");

  return (
    <div
      id={id}
      ref={containerRef}
      onScroll={handleScroll}
      // No sticky overlay here any more: a cost banner pinned to top-0 sat on
      // top of the first lines of the log and there was no way to scroll them
      // out from under it. Cost is reported upward via onCostChange and shown
      // by the card, the Runs section, and the task page's status line.
      className={`${className} space-y-1.5 overflow-y-auto rounded bg-neutral-50 p-2 text-xs`}
    >
      {renderable.length === 0 && (
        <p className="text-neutral-400">Waiting for the agent to start…</p>
      )}
      {renderable.map((block, i) => {
        if (block.kind === "thinking") {
          return (
            <details
              key={`${i}-${blocksNonce}`}
              open={blocksOpen ?? false}
              className="text-neutral-400"
            >
              <summary className="cursor-pointer italic">
                thinking{!block.done && "…"}
              </summary>
              <p className="mt-1 whitespace-pre-wrap pl-2 italic">{block.text}</p>
            </details>
          );
        }
        if (block.kind === "text") {
          return (
            <p key={i} className="whitespace-pre-wrap text-neutral-800">
              {block.text}
              {!block.done && <span className="animate-pulse">▍</span>}
            </p>
          );
        }
        if (block.kind === "tool_use") {
          return (
            <details
              key={`${i}-${blocksNonce}`}
              className="rounded border border-neutral-200 bg-white px-2 py-1"
              // A still-running tool stays open by default so you can watch
              // it; expand-all/collapse-all overrides that when set.
              open={blocksOpen ?? !block.done}
            >
              <summary className="cursor-pointer font-medium text-neutral-700">
                🔧 {block.name}
                {!block.done && (
                  <span className="ml-1 font-normal text-neutral-400">running…</span>
                )}
              </summary>
              {/* No height cap: a capped pre inside the scrolling transcript
                  meant nested scrollbars, and reading a long command or file
                  dump through an 8rem window. The transcript box itself is
                  the one place that scrolls. */}
              <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-neutral-50 p-1">
                {JSON.stringify(block.input, null, 2)}
              </pre>
              {block.result !== null && (
                <pre
                  className={`mt-1 whitespace-pre-wrap break-words rounded p-1 ${
                    block.resultIsError
                      ? "bg-red-50 text-red-700"
                      : "bg-neutral-50 text-neutral-600"
                  }`}
                >
                  {block.result}
                </pre>
              )}
            </details>
          );
        }
        if (block.kind === "result") {
          return (
            <p
              key={i}
              className={`rounded px-2 py-1 font-medium ${
                block.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {block.ok ? "✅" : "❌"} {block.summary ?? "(no summary)"}
              {block.costUsd != null && ` — $${block.costUsd.toFixed(4)}`}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
