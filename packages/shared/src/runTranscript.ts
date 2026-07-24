// Reconstructs a readable transcript from Claude Code's
// `--output-format stream-json --include-partial-messages --verbose` event
// stream. The server never interprets this shape — it just persists/relays
// the raw lines — so this reducer is the one place either side (this
// package or the UI) can turn them into renderable blocks. Deliberately
// loosely typed: this is Anthropic's streaming Messages format, not a shape
// we own, and pinning it down with strict zod would break on any upstream
// field addition.
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
  // Which list-index in `blocks` a currently-open content_block (keyed by
  // its stream `index`) landed at — cleared once that block's
  // content_block_stop arrives. Internal bookkeeping, not meant to be read
  // by consumers; only `.blocks`/`.finished` are the public surface.
  openBlocksByStreamIndex: Record<number, number>;
};

export function createTranscriptState(): TranscriptState {
  return { blocks: [], finished: false, openBlocksByStreamIndex: {} };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function applyRunEvent(state: TranscriptState, raw: RunEventRaw): TranscriptState {
  const blocks = state.blocks.slice();
  const open = { ...state.openBlocksByStreamIndex };
  let finished = state.finished;

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
      const costUsd = typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : null;
      pushBlock({ kind: "result", ok: raw.subtype === "success", summary, costUsd });
      finished = true;
      break;
    }

    default:
      break;
  }

  return { blocks, finished, openBlocksByStreamIndex: open };
}
