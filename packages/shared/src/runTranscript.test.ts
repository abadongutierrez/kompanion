import { describe, expect, it } from "vitest";
import { applyRunEvent, createTranscriptState, type RunEventRaw } from "./runTranscript.js";

function assistant(id: string, usage: Record<string, number>): RunEventRaw {
  return { type: "assistant", message: { id, model: "claude-opus-5", usage } };
}

// Wrapped rather than passed to reduce directly: Array.reduce would feed the
// element index into applyRunEvent's runtime parameter.
function reduce(events: RunEventRaw[]) {
  return events.reduce((state, event) => applyRunEvent(state, event), createTranscriptState());
}

function reduceOpencode(events: RunEventRaw[]) {
  return events.reduce(
    (state, event) => applyRunEvent(state, event, "opencode"),
    createTranscriptState(),
  );
}

describe("live cost", () => {
  it("is null before any usage arrives", () => {
    expect(reduce([{ type: "system", subtype: "init" }]).costUsd).toBeNull();
  });

  it("accrues an estimate from assistant usage while the run is in flight", () => {
    // opus-5: $5/1M in, $25/1M out -> 1000 * 5e-6 + 200 * 25e-6 = 0.01
    const state = reduce([assistant("msg_1", { input_tokens: 1000, output_tokens: 200 })]);
    expect(state.costUsd).toBeCloseTo(0.01, 10);
    expect(state.costIsEstimate).toBe(true);
    expect(state.finished).toBe(false);
  });

  it("prices cache writes at 1.25x and cache reads at 0.1x input", () => {
    const state = reduce([
      assistant("msg_1", { cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 }),
    ]);
    expect(state.costUsd).toBeCloseTo(1000 * 5e-6 * 1.25 + 1000 * 5e-6 * 0.1, 10);
  });

  it("does not double-count repeated lines for the same message id", () => {
    const usage = { input_tokens: 1000, output_tokens: 200 };
    const state = reduce([assistant("msg_1", usage), assistant("msg_1", usage)]);
    expect(state.costUsd).toBeCloseTo(0.01, 10);
  });

  it("sums distinct messages", () => {
    const state = reduce([
      assistant("msg_1", { input_tokens: 1000 }),
      assistant("msg_2", { input_tokens: 1000 }),
    ]);
    expect(state.costUsd).toBeCloseTo(0.01, 10);
  });

  it("is superseded by the exact total from the result line", () => {
    const state = reduce([
      assistant("msg_1", { input_tokens: 1000, output_tokens: 200 }),
      { type: "result", subtype: "success", result: "done", total_cost_usd: 0.4242 },
    ]);
    expect(state.costUsd).toBe(0.4242);
    expect(state.costIsEstimate).toBe(false);
    expect(state.finished).toBe(true);
  });

  it("keeps the estimate when the result line carries no cost", () => {
    const state = reduce([
      assistant("msg_1", { input_tokens: 1000, output_tokens: 200 }),
      { type: "result", subtype: "error_during_execution" },
    ]);
    expect(state.costUsd).toBeCloseTo(0.01, 10);
    expect(state.costIsEstimate).toBe(true);
  });

  it("still builds blocks from the stream without assistant lines adding any", () => {
    const state = reduce([
      {
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "hi" } },
      },
      assistant("msg_1", { input_tokens: 10 }),
    ]);
    expect(state.blocks).toHaveLength(1);
  });
});

// Shapes below are transcribed from a real `opencode run --format json`
// against opencode 1.18.23, not from documentation.
describe("opencode transcripts", () => {
  const stepFinish = (cost: number): RunEventRaw => ({
    type: "step_finish",
    part: {
      type: "step-finish",
      reason: "stop",
      tokens: { total: 2085, input: 2050, output: 35, reasoning: 0, cache: { read: 0, write: 0 } },
      cost,
    },
  });

  it("renders text parts as text blocks", () => {
    const state = reduceOpencode([
      { type: "step_start", part: { type: "step-start" } },
      { type: "text", part: { type: "text", text: "done" } },
      stepFinish(0),
    ]);
    expect(state.blocks).toEqual([{ kind: "text", text: "done", done: true }]);
  });

  it("sums cost across steps and never calls it an estimate", () => {
    const state = reduceOpencode([stepFinish(0.25), stepFinish(0.5)]);
    expect(state.costUsd).toBeCloseTo(0.75, 10);
    expect(state.costIsEstimate).toBe(false);
  });

  it("keeps a reported zero as zero rather than inventing a price", () => {
    // A local Ollama model genuinely costs nothing. Substituting a
    // token-priced estimate here would report a charge nobody was billed.
    const state = reduceOpencode([stepFinish(0)]);
    expect(state.costUsd).toBe(0);
  });

  it("leaves cost null when the run ends before any step_finish", () => {
    const state = reduceOpencode([{ type: "text", part: { type: "text", text: "hi" } }]);
    expect(state.costUsd).toBeNull();
  });

  it("turns an error event into a failed result and finishes", () => {
    const state = reduceOpencode([
      {
        type: "error",
        error: { name: "APIError", data: { message: "model 'qwen2:latest' not found" } },
      },
    ]);
    expect(state.finished).toBe(true);
    expect(state.blocks).toEqual([
      {
        kind: "result",
        ok: false,
        summary: "APIError: model 'qwen2:latest' not found",
        costUsd: null,
      },
    ]);
  });

  it("ignores event types it does not know", () => {
    const state = reduceOpencode([{ type: "something_new_upstream", part: { x: 1 } }]);
    expect(state.blocks).toEqual([]);
  });

  it("does not read opencode events with the Claude reducer", () => {
    // The whole reason task_runs.runtime exists: the same bytes mean nothing
    // to the other reducer.
    const state = reduce([{ type: "text", part: { type: "text", text: "done" } }]);
    expect(state.blocks).toEqual([]);
  });
});
