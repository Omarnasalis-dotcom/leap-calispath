// Claude Sonnet 5 pricing — verified 2026-08-29 against
// https://platform.claude.com/docs/en/about-claude/pricing (the $2/$10
// input/output rate is the standard price now, not introductory pricing
// scheduled to change). Only the 5-minute cache-write tier applies here —
// this app's only cache_control block uses the default TTL, never "1h".
export const PRICE_PER_MTOK_USD = {
  input: 2.0,
  output: 10.0,
  cacheWrite5m: 2.5,
  cacheRead: 0.2,
};

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AccumulatedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export function addUsage(a: AccumulatedUsage, b: ClaudeUsage): AccumulatedUsage {
  return {
    input_tokens: a.input_tokens + (b.input_tokens ?? 0),
    output_tokens: a.output_tokens + (b.output_tokens ?? 0),
    cache_creation_input_tokens: a.cache_creation_input_tokens + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: a.cache_read_input_tokens + (b.cache_read_input_tokens ?? 0),
  };
}

export function usageCostUsd(u: AccumulatedUsage): number {
  return (
    (u.input_tokens * PRICE_PER_MTOK_USD.input +
      u.output_tokens * PRICE_PER_MTOK_USD.output +
      u.cache_creation_input_tokens * PRICE_PER_MTOK_USD.cacheWrite5m +
      u.cache_read_input_tokens * PRICE_PER_MTOK_USD.cacheRead) /
    1_000_000
  );
}
