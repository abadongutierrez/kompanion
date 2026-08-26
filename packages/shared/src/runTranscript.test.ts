import { describe, expect, it } from "vitest";
import { applyRunEvent, createTranscriptState, type RunEventRaw } from "./runTranscript.js";

function assistant(id: string, usage: Record<string, number>): RunEventRaw {
  return { type: "assistant", message: { id, model: "claude-opus-5", usage } };
}

function reduce(events: RunEventRaw[]) {
  return events.reduce(applyRunEvent, createTranscriptState());
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
