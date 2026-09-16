// Per-model pricing — verified 2026-09-16 against
// https://platform.claude.com/docs/en/about-claude/pricing. Keyed by the
// exact model id passed to the Anthropic API (see ANTHROPIC_MODEL in
// index.ts) so a model swap can't silently keep billing at the old model's
// rate — this bit a real incident before: switching to Haiku without
// touching this file would have cost-attributed every Haiku call at
// Sonnet's price, tripping paid-tier budget caps far earlier than intended.
// Only the 5-minute cache-write tier applies here — this app's only
// cache_control block uses the default TTL, never "1h".
interface ModelPricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0, cacheWrite5m: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0, cacheWrite5m: 1.25, cacheRead: 0.1 },
};

// Sonnet 5's rate is the safe fallback for an unrecognized model id — it's
// the highest of the two, so a lookup miss over-attributes cost (tripping
// budget caps early) rather than under-attributes it (letting real spend
// through uncapped).
const FALLBACK_PRICING = PRICING_BY_MODEL["claude-sonnet-5"];

export function pricingForModel(model: string): ModelPricing {
  const pricing = PRICING_BY_MODEL[model];
  if (!pricing) {
    console.error(`[ai-coach] No pricing entry for model "${model}" — falling back to Sonnet 5 rates. Add this model to PRICING_BY_MODEL in pricing.ts.`);
    return FALLBACK_PRICING;
  }
  return pricing;
}

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

export function usageCostUsd(u: AccumulatedUsage, model: string): number {
  const pricing = pricingForModel(model);
  return (
    (u.input_tokens * pricing.input +
      u.output_tokens * pricing.output +
      u.cache_creation_input_tokens * pricing.cacheWrite5m +
      u.cache_read_input_tokens * pricing.cacheRead) /
    1_000_000
  );
}
