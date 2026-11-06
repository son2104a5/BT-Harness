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
  const promptTokens = usage?.promptTokens || usage?.inputTokens || usage?.input_tokens || 0;
  const completionTokens = usage?.completionTokens || usage?.outputTokens || usage?.output_tokens || 0;

  const anthropicMeta = usage?.providerMetadata?.anthropic || {};
  const googleMeta = usage?.providerMetadata?.google || {};

  // Extract cache write tokens (Anthropic cache creation or AI SDK 7 inputTokenDetails)
  const cacheWriteTokens =
    usage?.inputTokenDetails?.cacheWriteTokens ||
    usage?.cacheWriteTokens ||
    usage?.promptTokensDetails?.cacheWriteTokens ||
    anthropicMeta.cacheCreationInputTokens ||
    anthropicMeta.cache_creation_input_tokens ||
    anthropicMeta.usage?.cacheCreationInputTokens ||
    anthropicMeta.usage?.cache_creation_input_tokens ||
    (Array.isArray(anthropicMeta.iterations)
      ? anthropicMeta.iterations.reduce((sum: number, iter: any) => sum + (iter?.cacheCreationInputTokens || iter?.cache_creation_input_tokens || 0), 0)
      : 0) ||
    usage?.raw?.usage?.cache_creation_input_tokens ||
    usage?.raw?.cache_creation_input_tokens ||
    0;

  // Extract cache read tokens (AI SDK 7 standard cachedTokens, inputTokenDetails, promptTokensDetails, or providerMetadata)
  const cacheReadTokens =
    usage?.cachedTokens ||
    usage?.inputTokenDetails?.cacheReadTokens ||
    usage?.promptTokensDetails?.cachedTokens ||
    usage?.promptTokensDetails?.cacheReadTokens ||
    usage?.cacheReadTokens ||
    anthropicMeta.cacheReadInputTokens ||
    anthropicMeta.cache_read_input_tokens ||
    anthropicMeta.usage?.cacheReadInputTokens ||
    anthropicMeta.usage?.cache_read_input_tokens ||
    (Array.isArray(anthropicMeta.iterations)
      ? anthropicMeta.iterations.reduce((sum: number, iter: any) => sum + (iter?.cacheReadInputTokens || iter?.cache_read_input_tokens || 0), 0)
      : 0) ||
    googleMeta.cachedContentTokenCount ||
    googleMeta.cached_content_token_count ||
    googleMeta.usage?.cachedContentTokenCount ||
    googleMeta.usageMetadata?.cachedContentTokenCount ||
    usage?.raw?.usage?.cache_read_input_tokens ||
    usage?.raw?.usage?.cached_content_token_count ||
    usage?.raw?.cached_content_token_count ||
    0;

  let effectivePromptTokens = promptTokens;
  if (!effectivePromptTokens && usage?.inputTokenDetails?.noCacheTokens !== undefined) {
    effectivePromptTokens = (usage.inputTokenDetails.noCacheTokens || 0) + cacheWriteTokens + cacheReadTokens;
  }

  const nonCacheInputTokens =
    usage?.inputTokenDetails?.noCacheTokens !== undefined
      ? usage.inputTokenDetails.noCacheTokens
      : Math.max(0, effectivePromptTokens - cacheWriteTokens - cacheReadTokens);

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

  const totalTokens =
    usage?.totalTokens !== undefined && usage.totalTokens > 0
      ? usage.totalTokens
      : effectivePromptTokens + completionTokens;

  return {
    inputTokens: nonCacheInputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    outputTokens: completionTokens,
    totalTokens,
    costUSD,
    costVND,
    cacheSavingsUSD,
    cacheHitRatio
  };
}

export const calculateModelCost = calculateClaudeCost;

export function calculateGeminiCost(usage: any): CostBreakdown {
  return calculateClaudeCost(usage, 'gemini');
}
