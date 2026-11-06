import { CostBreakdown } from '../types.js';
import { LLMProvider } from '../config.js';

// Claude 3.5 Haiku Pricing (per 1,000,000 tokens)
export const PRICE_BASE_INPUT = 0.80;
export const PRICE_CACHE_WRITE = 1.00;
export const PRICE_CACHE_READ = 0.08;
export const PRICE_OUTPUT = 4.00;

// Gemini 1.5 Flash Pricing (per 1,000,000 tokens)
export const PRICE_GEMINI_BASE_INPUT = 0.075;
export const PRICE_GEMINI_CACHE_READ = 0.01875; // 75% discount
export const PRICE_GEMINI_OUTPUT = 0.30;

export const USD_TO_VND_RATE = 25500;

export function calculateClaudeCost(usage: any, provider: LLMProvider = 'anthropic'): CostBreakdown {
  const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
  const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;

  const anthropicMeta = usage?.providerMetadata?.anthropic || {};
  const googleMeta = usage?.providerMetadata?.google || {};

  // Extract cache tokens depending on provider metadata
  const cacheWriteTokens = anthropicMeta.cacheCreationInputTokens || 0;
  const cacheReadTokens = anthropicMeta.cacheReadInputTokens || googleMeta.cachedContentTokenCount || 0;

  const nonCacheInputTokens = Math.max(0, promptTokens - cacheWriteTokens - cacheReadTokens);

  const isGemini = provider === 'gemini';
  const baseInputPrice = isGemini ? PRICE_GEMINI_BASE_INPUT : PRICE_BASE_INPUT;
  const cacheWritePrice = isGemini ? PRICE_GEMINI_BASE_INPUT : PRICE_CACHE_WRITE;
  const cacheReadPrice = isGemini ? PRICE_GEMINI_CACHE_READ : PRICE_CACHE_READ;
  const outputPrice = isGemini ? PRICE_GEMINI_OUTPUT : PRICE_OUTPUT;

  const costBaseInput = (nonCacheInputTokens * baseInputPrice) / 1_000_000;
  const costCacheWrite = (cacheWriteTokens * cacheWritePrice) / 1_000_000;
  const costCacheRead = (cacheReadTokens * cacheReadPrice) / 1_000_000;
  const costOutput = (completionTokens * outputPrice) / 1_000_000;

  const costUSD = Number((costBaseInput + costCacheWrite + costCacheRead + costOutput).toFixed(6));
  const costVND = Math.round(costUSD * USD_TO_VND_RATE);

  const normalCacheCost = (cacheReadTokens * baseInputPrice) / 1_000_000;
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

export const calculateModelCost = calculateClaudeCost;
