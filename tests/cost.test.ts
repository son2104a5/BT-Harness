import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  calculateClaudeCost,
  calculateModelCost,
  calculateGeminiCost,
  calculateDeepSeekCost,
  PRICE_BASE_INPUT,
  PRICE_CACHE_WRITE,
  PRICE_CACHE_READ,
  PRICE_OUTPUT,
  PRICE_GEMINI_BASE_INPUT,
  PRICE_GEMINI_CACHE_READ,
  PRICE_GEMINI_OUTPUT,
  PRICE_DEEPSEEK_BASE_INPUT,
  PRICE_DEEPSEEK_CACHE_READ,
  PRICE_DEEPSEEK_OUTPUT,
  USD_TO_VND_RATE
} from '../src/harness/cost.js';
import { promptInstructorApproval } from '../src/harness/approval.js';

describe('Cost Calculator Suite', () => {
  test('calculates correct cost without cache hits', () => {
    const usage = {
      promptTokens: 1000,
      completionTokens: 200
    };
    const breakdown = calculateClaudeCost(usage);
    // non-cache input: 1000 * $0.80 / 1M = $0.0008
    // output: 200 * $4.00 / 1M = $0.0008
    // total = $0.0016
    assert.strictEqual(breakdown.costUSD, 0.0016);
    assert.strictEqual(breakdown.costVND, Math.round(0.0016 * 25500));
    assert.strictEqual(breakdown.cacheReadTokens, 0);
    assert.strictEqual(breakdown.cacheWriteTokens, 0);
    assert.strictEqual(breakdown.totalTokens, 1200);
  });

  test('calculates correct cost with Anthropic ephemeral cache hits', () => {
    const usage = {
      promptTokens: 2300,
      completionTokens: 100,
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 2000
        }
      }
    };
    const breakdown = calculateClaudeCost(usage);
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.inputTokens, 300);
    // input non-cache: 300 * $0.80 / 1M = $0.00024
    // cache read: 2000 * $0.08 / 1M = $0.00016
    // output: 100 * $4.00 / 1M = $0.0004
    // total = 0.0008
    assert.strictEqual(breakdown.costUSD, 0.0008);
    assert.ok(breakdown.cacheSavingsUSD > 0);
    assert.ok(breakdown.cacheHitRatio > 0.8);
  });

  test('calculates cost with cache write tokens and fallback property names', () => {
    const usage = {
      inputTokens: 1500,
      outputTokens: 500,
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: 1000,
          cacheReadInputTokens: 0
        }
      }
    };
    const breakdown = calculateClaudeCost(usage);
    // non-cache input: 500 * $0.80 / 1M = $0.0004
    // cache write: 1000 * $1.00 / 1M = $0.001
    // output: 500 * $4.00 / 1M = $0.002
    // total = $0.0034
    assert.strictEqual(breakdown.inputTokens, 500);
    assert.strictEqual(breakdown.cacheWriteTokens, 1000);
    assert.strictEqual(breakdown.cacheReadTokens, 0);
    assert.strictEqual(breakdown.outputTokens, 500);
    assert.strictEqual(breakdown.costUSD, 0.0034);
  });

  test('handles empty or undefined usage gracefully', () => {
    const breakdownEmpty = calculateClaudeCost({});
    assert.strictEqual(breakdownEmpty.totalTokens, 0);
    assert.strictEqual(breakdownEmpty.costUSD, 0);
    assert.strictEqual(breakdownEmpty.cacheHitRatio, 0);

    const breakdownNull = calculateClaudeCost(null);
    assert.strictEqual(breakdownNull.totalTokens, 0);
    assert.strictEqual(breakdownNull.costUSD, 0);
  });

  test('exports accurate Claude 3.5 Haiku pricing constants', () => {
    assert.strictEqual(PRICE_BASE_INPUT, 0.80);
    assert.strictEqual(PRICE_CACHE_WRITE, 1.00);
    assert.strictEqual(PRICE_CACHE_READ, 0.08);
    assert.strictEqual(PRICE_OUTPUT, 4.00);
    assert.strictEqual(USD_TO_VND_RATE, 25500);
  });

  test('calculates correct cost for Gemini 1.5 Flash with cached tokens', () => {
    const usage = {
      promptTokens: 2500,
      completionTokens: 200,
      providerMetadata: {
        google: {
          cachedContentTokenCount: 2000
        }
      }
    };
    const breakdown = calculateClaudeCost(usage, 'gemini');
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.inputTokens, 500);
    // input: 500 * 0.075 / 1M = 0.0000375
    // cache read: 2000 * 0.01875 / 1M = 0.0000375
    // output: 200 * 0.30 / 1M = 0.00006
    // total = 0.000135
    assert.strictEqual(breakdown.costUSD, 0.000135);
    assert.ok(breakdown.costVND > 0);
  });

  test('exports accurate Gemini 1.5 Flash pricing constants', () => {
    assert.strictEqual(PRICE_GEMINI_BASE_INPUT, 0.075);
    assert.strictEqual(PRICE_GEMINI_CACHE_READ, 0.01875);
    assert.strictEqual(PRICE_GEMINI_OUTPUT, 0.30);
  });

  test('calculateModelCost is an alias of calculateClaudeCost', () => {
    const usage = { promptTokens: 1000, completionTokens: 200 };
    const r1 = calculateClaudeCost(usage, 'gemini');
    const r2 = calculateModelCost(usage, 'gemini');
    assert.deepStrictEqual(r1, r2);
  });

  test('calculates correct cost with AI SDK 7 standard cachedTokens', () => {
    const usage = {
      inputTokens: 2500,
      outputTokens: 200,
      cachedTokens: 2000
    };
    const breakdown = calculateClaudeCost(usage, 'gemini');
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.inputTokens, 500);
    assert.strictEqual(breakdown.outputTokens, 200);
    assert.strictEqual(breakdown.costUSD, 0.000135);
  });

  test('calculates correct cost with promptTokensDetails.cachedTokens', () => {
    const usage = {
      promptTokens: 2300,
      completionTokens: 100,
      promptTokensDetails: {
        cachedTokens: 2000
      }
    };
    const breakdown = calculateClaudeCost(usage);
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.inputTokens, 300);
    assert.strictEqual(breakdown.costUSD, 0.0008);
  });

  test('calculates cost with AI SDK 7 inputTokenDetails and outputTokenDetails', () => {
    const usage = {
      inputTokens: 2300,
      outputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 300,
        cacheReadTokens: 2000,
        cacheWriteTokens: 0
      },
      outputTokenDetails: {
        textTokens: 100,
        reasoningTokens: 0
      }
    };
    const breakdown = calculateClaudeCost(usage);
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.cacheWriteTokens, 0);
    assert.strictEqual(breakdown.inputTokens, 300);
    assert.strictEqual(breakdown.outputTokens, 100);
    assert.strictEqual(breakdown.costUSD, 0.0008);
  });

  test('handles snake_case Anthropic provider metadata and iterations', () => {
    const usage = {
      input_tokens: 3000,
      output_tokens: 500,
      providerMetadata: {
        anthropic: {
          iterations: [
            { type: 'compaction', inputTokens: 1000, outputTokens: 200, cacheCreationInputTokens: 500, cacheReadInputTokens: 0 },
            { type: 'message', inputTokens: 2000, outputTokens: 300, cacheCreationInputTokens: 0, cacheReadInputTokens: 1500 }
          ]
        }
      }
    };
    const breakdown = calculateClaudeCost(usage);
    assert.strictEqual(breakdown.cacheWriteTokens, 500);
    assert.strictEqual(breakdown.cacheReadTokens, 1500);
    assert.strictEqual(breakdown.inputTokens, 1000);
    assert.strictEqual(breakdown.outputTokens, 500);
  });

  test('calculateGeminiCost helper calculates cost with Gemini rates', () => {
    const usage = { promptTokens: 1000, completionTokens: 200 };
    const r1 = calculateClaudeCost(usage, 'gemini');
    const r2 = calculateGeminiCost(usage);
    assert.deepStrictEqual(r1, r2);
  });

  test('calculateDeepSeekCost calculates cost with DeepSeek rates and cache savings', () => {
    const usage = {
      promptTokens: 2000,
      completionTokens: 500,
      providerMetadata: {
        deepseek: {
          promptCacheHitTokens: 1500
        }
      }
    };
    const breakdown = calculateDeepSeekCost(usage);
    // nonCacheInput: 500 tokens * $0.14 / 1M = $0.00007
    // cacheRead: 1500 tokens * $0.014 / 1M = $0.000021
    // output: 500 tokens * $0.28 / 1M = $0.00014
    // total = $0.000231
    assert.strictEqual(breakdown.cacheReadTokens, 1500);
    assert.strictEqual(breakdown.inputTokens, 500);
    assert.strictEqual(breakdown.costUSD, 0.000231);
    assert.ok(breakdown.cacheSavingsUSD > 0);
  });
});

describe('Approval Module Suite', () => {
  const originalEnv = process.env.AUTOMATED_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AUTOMATED_MODE;
    } else {
      process.env.AUTOMATED_MODE = originalEnv;
    }
  });

  test('auto-approves in AUTOMATED_MODE', async () => {
    process.env.AUTOMATED_MODE = 'true';
    const approved = await promptInstructorApproval({
      toolName: 'save_grade',
      studentId: 'HV001',
      studentName: 'Nguyễn Văn An',
      scores: {
        correctness: 4.0,
        codeQuality: 2.5,
        performance: 2.0
      },
      totalScore: 8.5,
      feedback: 'Bài làm rất tốt, cấu trúc rõ ràng.'
    });

    assert.strictEqual(approved, true);
  });

  test('auto-approves in AUTOMATED_MODE when studentName is not provided', async () => {
    process.env.AUTOMATED_MODE = 'true';
    const approved = await promptInstructorApproval({
      toolName: 'save_grade',
      studentId: 'HV999',
      scores: {
        all: 10
      },
      totalScore: 10,
      feedback: 'Xuất sắc'
    });

    assert.strictEqual(approved, true);
  });
});
