import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { calculateClaudeCost } from '../src/harness/cost.js';
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
