import { useEffect, useRef, useState } from "react";
import {
  applyRunEvent,
  createTranscriptState,
  type RunEventRaw,
  type TranscriptState,
} from "@sdlc/shared";
import { api } from "../api.js";

// Same component serves a live run and a replay of a finished one: the SSE
// endpoint always replays persisted history first, then either streams new
// events (still running) or sends `done` immediately (already finished) —
// so there's no branching needed here for "live" vs "historical".
export function RunTranscript({
  teamId,
  taskId,
  runId,
}: {
  teamId: string;
  taskId: string;
  runId: string;
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
      setState((prev) => applyRunEvent(prev, parsed.payload as RunEventRaw));
    };
    source.addEventListener("done", () => source.close());
    source.onerror = () => {
      // EventSource retries automatically; once the server has sent "done"
      // it already called close() above so this won't fire for the normal
      // completion path.
    };

    return () => source.close();
  }, [teamId, taskId, runId]);

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
      ref={containerRef}
      onScroll={handleScroll}
      className="max-h-64 space-y-1.5 overflow-y-auto rounded bg-neutral-50 p-2 text-xs"
    >
      {renderable.length === 0 && (
        <p className="text-neutral-400">Waiting for the agent to start…</p>
      )}
      {renderable.map((block, i) => {
        if (block.kind === "thinking") {
          return (
            <details key={i} className="text-neutral-400">
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
              key={i}
              className="rounded border border-neutral-200 bg-white px-2 py-1"
              open={!block.done}
            >
              <summary className="cursor-pointer font-medium text-neutral-700">
                🔧 {block.name}
                {!block.done && (
                  <span className="ml-1 font-normal text-neutral-400">running…</span>
                )}
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-1">
                {JSON.stringify(block.input, null, 2)}
              </pre>
              {block.result !== null && (
                <pre
                  className={`mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-1 ${
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
