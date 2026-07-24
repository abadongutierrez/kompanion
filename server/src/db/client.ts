import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://sdlc:sdlc@localhost:5433/sdlc";

export const sql = postgres(connectionString, {
  transform: postgres.camel,
  // The driver returns `numeric` columns (cost_usd, monthly_budget_usd) as
  // strings by default to avoid float precision loss on huge values — not a
  // concern at our scale, and callers throughout the codebase (budget math,
  // UI .toFixed() calls) expect real numbers, not strings.
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      parse: (value: string) => parseFloat(value),
      serialize: (value: number) => value.toString(),
    },
  },
});
