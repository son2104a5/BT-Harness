import { CostBreakdown } from '../types.js';

// Claude 3.5 Haiku Pricing (per 1,000,000 tokens)
const PRICE_BASE_INPUT = 0.80;
const PRICE_CACHE_WRITE = 1.00;
const PRICE_CACHE_READ = 0.08;
const PRICE_OUTPUT = 4.00;
const USD_TO_VND_RATE = 25500;

export function calculateClaudeCost(usage: any): CostBreakdown {
  const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
  const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;

  const anthropicMeta = usage?.providerMetadata?.anthropic || {};
  const cacheWriteTokens = anthropicMeta.cacheCreationInputTokens || 0;
  const cacheReadTokens = anthropicMeta.cacheReadInputTokens || 0;

  // Non-cached input tokens = total prompt tokens minus cache write and cache read
  const nonCacheInputTokens = Math.max(0, promptTokens - cacheWriteTokens - cacheReadTokens);

  const costBaseInput = (nonCacheInputTokens * PRICE_BASE_INPUT) / 1_000_000;
  const costCacheWrite = (cacheWriteTokens * PRICE_CACHE_WRITE) / 1_000_000;
  const costCacheRead = (cacheReadTokens * PRICE_CACHE_READ) / 1_000_000;
  const costOutput = (completionTokens * PRICE_OUTPUT) / 1_000_000;

  const costUSD = Number((costBaseInput + costCacheWrite + costCacheRead + costOutput).toFixed(6));
  const costVND = Math.round(costUSD * USD_TO_VND_RATE);

  // Calculate savings vs paying full non-cache price for cached read tokens
  const normalCacheCost = (cacheReadTokens * PRICE_BASE_INPUT) / 1_000_000;
  const cacheSavingsUSD = Number(Math.max(0, normalCacheCost - costCacheRead).toFixed(6));

  const totalInputTokens = nonCacheInputTokens + cacheWriteTokens + cacheReadTokens;
  const cacheHitRatio = totalInputTokens > 0 ? Number((cacheReadTokens / totalInputTokens).toFixed(4)) : 0;

  return {
    inputTokens: nonCacheInputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    outputTokens: completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUSD,
    costVND,
    cacheSavingsUSD,
    cacheHitRatio
  };
}
