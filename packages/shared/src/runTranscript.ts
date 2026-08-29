// Reconstructs a readable transcript from Claude Code's
// `--output-format stream-json --include-partial-messages --verbose` event
// stream. The server never interprets this shape — it just persists/relays
// the raw lines — so this reducer is the one place either side (this
// package or the UI) can turn them into renderable blocks. Deliberately
// loosely typed: this is Anthropic's streaming Messages format, not a shape
// we own, and pinning it down with strict zod would break on any upstream
// field addition.
import { estimateMessageCostUsd } from "./runCost.js";
import type { AgentRuntime } from "./domain.js";

export type RunEventRaw = { type: string; [key: string]: unknown };

export type TranscriptBlock =
  | { kind: "thinking"; text: string; done: boolean }
  | { kind: "text"; text: string; done: boolean }
  | {
      kind: "tool_use";
      id: string;
      name: string;
      input: unknown;
      partialInputJson: string;
      result: string | null;
      resultIsError: boolean;
      done: boolean;
    }
  | { kind: "system"; subtype: string | null }
  | { kind: "result"; ok: boolean; summary: string | null; costUsd: number | null };

export type TranscriptState = {
  blocks: TranscriptBlock[];
  finished: boolean;
  // Spend so far. While the run is in flight this is priced client-side
  // from the per-message `usage` blocks (`costIsEstimate: true`); once the
  // final `result` line lands it's replaced by Claude's own
  // `total_cost_usd` (`costIsEstimate: false`). null before any usage has
  // been seen.
  costUsd: number | null;
  costIsEstimate: boolean;
  // Which list-index in `blocks` a currently-open content_block (keyed by
  // its stream `index`) landed at — cleared once that block's
  // content_block_stop arrives. Internal bookkeeping, not meant to be read
  // by consumers; only `.blocks`/`.finished` are the public surface.
  openBlocksByStreamIndex: Record<number, number>;
  // Estimated cost keyed by assistant message id. Claude Code can emit
  // several `assistant` lines for one message (one per content block),
  // each carrying that message's cumulative usage — keying by id and
  // summing the values keeps a repeat from double-counting. Internal
  // bookkeeping; read `.costUsd` instead.
  costByMessageId: Record<string, number>;
};

export function createTranscriptState(): TranscriptState {
  return {
    blocks: [],
    finished: false,
    costUsd: null,
    costIsEstimate: false,
    openBlocksByStreamIndex: {},
    costByMessageId: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Claude Code's `--output-format stream-json` shape.
function applyClaudeEvent(state: TranscriptState, raw: RunEventRaw): TranscriptState {
  const blocks = state.blocks.slice();
  const open = { ...state.openBlocksByStreamIndex };
  const costByMessageId = { ...state.costByMessageId };
  let finished = state.finished;
  let costUsd = state.costUsd;
  let costIsEstimate = state.costIsEstimate;

  function pushBlock(block: TranscriptBlock): number {
    blocks.push(block);
    return blocks.length - 1;
  }

  switch (raw.type) {
    case "system": {
      pushBlock({ kind: "system", subtype: typeof raw.subtype === "string" ? raw.subtype : null });
      break;
    }

    case "stream_event": {
      const event = asRecord(raw.event);
      switch (event.type) {
        case "content_block_start": {
          const index = Number(event.index);
          const contentBlock = asRecord(event.content_block);
          if (contentBlock.type === "thinking") {
            open[index] = pushBlock({ kind: "thinking", text: "", done: false });
          } else if (contentBlock.type === "text") {
            open[index] = pushBlock({
              kind: "text",
              text: asString(contentBlock.text),
              done: false,
            });
          } else if (contentBlock.type === "tool_use") {
            open[index] = pushBlock({
              kind: "tool_use",
              id: asString(contentBlock.id),
              name: asString(contentBlock.name),
              input: contentBlock.input ?? {},
              partialInputJson: "",
              result: null,
              resultIsError: false,
              done: false,
            });
          }
          break;
        }

        case "content_block_delta": {
          const index = Number(event.index);
          const blockIndex = open[index];
          if (blockIndex === undefined) break;
          const delta = asRecord(event.delta);
          const block = blocks[blockIndex];
          if (delta.type === "thinking_delta" && block.kind === "thinking") {
            blocks[blockIndex] = { ...block, text: block.text + asString(delta.thinking) };
          } else if (delta.type === "text_delta" && block.kind === "text") {
            blocks[blockIndex] = { ...block, text: block.text + asString(delta.text) };
          } else if (delta.type === "input_json_delta" && block.kind === "tool_use") {
            blocks[blockIndex] = {
              ...block,
              partialInputJson: block.partialInputJson + asString(delta.partial_json),
            };
          }
          break;
        }

        case "content_block_stop": {
          const index = Number(event.index);
          const blockIndex = open[index];
          if (blockIndex === undefined) break;
          const block = blocks[blockIndex];
          if (block.kind === "tool_use") {
            let input: unknown = block.input;
            if (block.partialInputJson) {
              try {
                input = JSON.parse(block.partialInputJson);
              } catch {
                // Leave the prior input as the best-effort value; a
                // truncated stream (e.g. process killed mid-delta) can land
                // here and we'd rather show something than throw.
              }
            }
            blocks[blockIndex] = { ...block, input, done: true };
          } else {
            blocks[blockIndex] = { ...block, done: true } as TranscriptBlock;
          }
          delete open[index];
          break;
        }

        default:
          break;
      }
      break;
    }

    // Non-streaming complete messages (only occur if partial-message mode
    // were ever off) — handled defensively so this reducer degrades
    // gracefully rather than dropping content. Claude Code also always
    // Confirmed against a real capture: Claude Code emits a complete
    // top-level "assistant" line for every message *in addition to* the
    // stream_event deltas that already built it out incrementally — so
    // handling "assistant" here would duplicate every block. Only "user"
    // (tool_result) is unique information: results are never streamed as
    // deltas, only ever delivered as this one complete message.
    // Handled for its `usage` only — the blocks it describes were already
    // built incrementally from the stream_event deltas (see the note
    // above), so nothing is pushed here.
    case "assistant": {
      const message = asRecord(raw.message);
      const usage = asRecord(message.usage);
      const id = asString(message.id);
      if (id && Object.keys(usage).length > 0) {
        costByMessageId[id] = estimateMessageCostUsd(asString(message.model), usage);
        costUsd = Object.values(costByMessageId).reduce((sum, c) => sum + c, 0);
        costIsEstimate = true;
      }
      break;
    }

    case "user": {
      const content = asRecord(raw.message).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          const c = asRecord(item);
          if (c.type !== "tool_result") continue;
          const toolUseId = asString(c.tool_use_id);
          const resultText =
            typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "");
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.kind === "tool_use" && b.id === toolUseId) {
              blocks[i] = { ...b, result: resultText, resultIsError: !!c.is_error };
              break;
            }
          }
        }
      }
      break;
    }

    case "result": {
      const summary = typeof raw.result === "string" ? raw.result : null;
      const reported = typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : null;
      pushBlock({ kind: "result", ok: raw.subtype === "success", summary, costUsd: reported });
      // Claude's own number is authoritative — it supersedes whatever we
      // estimated on the way here.
      if (reported !== null) {
        costUsd = reported;
        costIsEstimate = false;
      }
      finished = true;
      break;
    }

    default:
      break;
  }

  return {
    blocks,
    finished,
    costUsd,
    costIsEstimate,
    openBlocksByStreamIndex: open,
    costByMessageId,
  };
}

// opencode's `run --format json` shape, which is a different event stream
// entirely: newline-delimited events carrying a `part`, rather than
// Anthropic's streaming Messages format. Verified against opencode 1.18.23 —
// `step_start`, `text`, `step_finish` and `error` were observed from real
// runs; `tool_use` follows opencode's documented shape but was not reproduced
// locally (the small local models available here answered in text instead of
// calling tools), so treat that branch as the least-proven part of this file.
//
// Unknown event types are ignored rather than throwing: this is a shape we
// don't own, and a new event type upstream should render as nothing, not
// break the transcript.
function applyOpencodeEvent(state: TranscriptState, raw: RunEventRaw): TranscriptState {
  const blocks = [...state.blocks];
  let finished = state.finished;
  let costUsd = state.costUsd;
  let costIsEstimate = state.costIsEstimate;

  const part = asRecord(raw.part);

  switch (raw.type) {
    case "text": {
      const text = asString(part.text);
      if (text) blocks.push({ kind: "text", text, done: true });
      break;
    }

    case "reasoning": {
      const text = asString(part.text);
      if (text) blocks.push({ kind: "thinking", text, done: true });
      break;
    }

    case "tool_use": {
      // opencode emits a tool only once it has completed — there is no
      // pending/running state on the CLI stream — so the block is born done,
      // with its result already attached.
      const state_ = asRecord(part.state);
      blocks.push({
        kind: "tool_use",
        id: asString(part.id),
        name: asString(part.tool),
        input: state_.input ?? null,
        partialInputJson: "",
        result: typeof state_.output === "string" ? state_.output : JSON.stringify(state_.output ?? ""),
        resultIsError: asString(state_.status) === "error",
        done: true,
      });
      break;
    }

    case "step_finish": {
      // Cost accumulates across steps and is reported as opencode states it.
      // Zero is a real answer — a local model costs nothing — so it is not
      // second-guessed with a token-priced estimate that would invent a
      // charge nobody was billed for.
      const cost = part.cost;
      if (typeof cost === "number") {
        costUsd = (costUsd ?? 0) + cost;
        costIsEstimate = false;
      }
      break;
    }

    case "error": {
      const error = asRecord(raw.error);
      const data = asRecord(error.data);
      const summary =
        [asString(error.name), asString(data.message)].filter(Boolean).join(": ") || null;
      blocks.push({ kind: "result", ok: false, summary, costUsd });
      finished = true;
      break;
    }
  }

  return { ...state, blocks, finished, costUsd, costIsEstimate };
}

// pi's `-p --mode json` shape (verified against pi 0.84.3 and its docs/json.md):
// newline-delimited AgentSessionEvents. Text and thinking arrive as
// delta-only `message_update` events carrying an `assistantMessageEvent`,
// while tools arrive as their own top-level `tool_execution_*` events with
// full arguments — so tool blocks are built from those rather than from the
// `toolcall_delta` argument stream, which would only reassemble the same JSON.
//
// Unknown event types (`session`, `turn_start`, `queue_update`, compaction,
// ...) are ignored rather than throwing: this is a shape we don't own, and a
// new event type upstream should render as nothing, not break the transcript.
// A pi tool result is `{ content: [{type: "text", text}, ...], details? }`,
// confirmed against a real run — not the bare string the transcript renders.
// Anything unexpected falls back to JSON so nothing is silently dropped.
function toolResultText(result: unknown): string {
  if (typeof result === "string") return result;
  const content = asRecord(result).content;
  if (Array.isArray(content)) {
    const texts = content
      .map(asRecord)
      .filter((c) => c.type === "text")
      .map((c) => asString(c.text));
    if (texts.length > 0) return texts.join("\n");
  }
  return JSON.stringify(result ?? "");
}

function applyPiEvent(state: TranscriptState, raw: RunEventRaw): TranscriptState {
  const blocks = state.blocks.slice();
  let open = { ...state.openBlocksByStreamIndex };
  let finished = state.finished;
  let costUsd = state.costUsd;
  let costIsEstimate = state.costIsEstimate;

  function markOpenDone() {
    for (const blockIndex of Object.values(open)) {
      const block = blocks[blockIndex];
      if (block && block.kind !== "system" && block.kind !== "result") {
        blocks[blockIndex] = { ...block, done: true } as TranscriptBlock;
      }
    }
  }

  // The visible answer of an assistant message: its text blocks, without
  // thinking or tool calls.
  function assistantText(message: Record<string, unknown>): string {
    const content = message.content;
    if (!Array.isArray(content)) return "";
    return content
      .map(asRecord)
      .filter((c) => c.type === "text")
      .map((c) => asString(c.text))
      .join("\n")
      .trim();
  }

  switch (raw.type) {
    case "message_start": {
      // contentIndex is numbered per message, not per run, so the map of
      // open blocks can't survive into the next one.
      open = {};
      break;
    }

    case "message_update": {
      const event = asRecord(raw.assistantMessageEvent);
      const index = Number(event.contentIndex);
      switch (event.type) {
        case "text_start": {
          open[index] = blocks.push({ kind: "text", text: "", done: false }) - 1;
          break;
        }
        case "thinking_start": {
          open[index] = blocks.push({ kind: "thinking", text: "", done: false }) - 1;
          break;
        }
        case "text_delta":
        case "thinking_delta": {
          const blockIndex = open[index];
          if (blockIndex === undefined) break;
          const block = blocks[blockIndex];
          if (block.kind === "text" || block.kind === "thinking") {
            blocks[blockIndex] = { ...block, text: block.text + asString(event.delta) };
          }
          break;
        }
        case "text_end":
        case "thinking_end": {
          const blockIndex = open[index];
          if (blockIndex === undefined) break;
          const block = blocks[blockIndex];
          if (block.kind === "text" || block.kind === "thinking") {
            // `content` is the authoritative final string; the accumulated
            // deltas should equal it, but a dropped delta shouldn't survive
            // into the rendered transcript.
            blocks[blockIndex] = { ...block, text: asString(event.content), done: true };
          }
          delete open[index];
          break;
        }
      }
      break;
    }

    case "tool_execution_start": {
      blocks.push({
        kind: "tool_use",
        id: asString(raw.toolCallId),
        name: asString(raw.toolName),
        input: raw.args ?? null,
        partialInputJson: "",
        result: null,
        resultIsError: false,
        done: false,
      });
      break;
    }

    case "tool_execution_end": {
      const toolCallId = asString(raw.toolCallId);
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block.kind === "tool_use" && block.id === toolCallId) {
          blocks[i] = {
            ...block,
            result: toolResultText(raw.result),
            resultIsError: !!raw.isError,
            done: true,
          };
          break;
        }
      }
      break;
    }

    case "message_end": {
      const message = asRecord(raw.message);
      if (message.role !== "assistant") break;
      markOpenDone();
      open = {};
      // pi reports usage per assistant message, so cost accumulates across
      // the run and is reported exactly as pi states it. Zero is a real
      // answer — a local LM Studio model costs nothing — so it is not
      // second-guessed with a token-priced estimate that would invent a
      // charge nobody was billed for.
      const total = asRecord(asRecord(message.usage).cost).total;
      if (typeof total === "number") {
        costUsd = (costUsd ?? 0) + total;
        costIsEstimate = false;
      }
      break;
    }

    case "agent_end": {
      // pi retries a failed turn by ending the agent loop and starting
      // another one; only the last agent_end closes the transcript.
      if (raw.willRetry === true) break;
      markOpenDone();
      open = {};
      const messages = Array.isArray(raw.messages) ? raw.messages.map(asRecord) : [];
      const last = messages.filter((m) => m.role === "assistant").pop();
      const stopReason = last ? asString(last.stopReason) : "";
      const ok = stopReason !== "error" && stopReason !== "aborted";
      blocks.push({
        kind: "result",
        ok,
        summary: last
          ? ok
            ? assistantText(last) || null
            : asString(last.errorMessage) || stopReason || null
          : null,
        costUsd,
      });
      finished = true;
      break;
    }
  }

  return { ...state, blocks, finished, costUsd, costIsEstimate, openBlocksByStreamIndex: open };
}

// The runtime that produced the events decides how to read them. It comes
// from task_runs.runtime, not from the Agent's current setting, so replaying
// an old run still picks the reducer that matches what is stored.
export function applyRunEvent(
  state: TranscriptState,
  raw: RunEventRaw,
  runtime: AgentRuntime = "claude_code",
): TranscriptState {
  switch (runtime) {
    case "opencode":
      return applyOpencodeEvent(state, raw);
    case "pi":
      return applyPiEvent(state, raw);
    default:
      return applyClaudeEvent(state, raw);
  }
}
