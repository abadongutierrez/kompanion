// Live cost estimation for a run that is still in flight.
//
// Claude Code only reports authoritative spend once, in the final `result`
// line (`total_cost_usd`). Until that arrives we price the per-message
// `usage` blocks ourselves so the UI can show spend as it accrues. The
// numbers here are an estimate — they are replaced by the exact figure the
// moment the run finishes.

// USD per million tokens. Cache writes bill at 1.25x input, cache reads at
// 0.1x input, so both are derived from `input` rather than listed.
type ModelPrice = { input: number; output: number };

const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Unknown/newer model ids shouldn't make the live number vanish — fall back
// to Opus-tier pricing, which is the family the harness runs by default.
const FALLBACK_PRICE: ModelPrice = { input: 5, output: 25 };

function priceFor(model: string): ModelPrice {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  // Model ids sometimes carry a date suffix (`claude-opus-5-20260101`);
  // match on the longest known id that prefixes it.
  for (const id of Object.keys(MODEL_PRICES)) {
    if (model.startsWith(id)) return MODEL_PRICES[id];
  }
  return FALLBACK_PRICE;
}

export type MessageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function estimateMessageCostUsd(model: string, usage: MessageUsage): number {
  const price = priceFor(model);
  const perInputToken = price.input / 1_000_000;
  return (
    num(usage.input_tokens) * perInputToken +
    num(usage.cache_creation_input_tokens) * perInputToken * 1.25 +
    num(usage.cache_read_input_tokens) * perInputToken * 0.1 +
    num(usage.output_tokens) * (price.output / 1_000_000)
  );
}
