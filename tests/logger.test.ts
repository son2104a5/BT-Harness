import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  formatToolPayload,
  formatCostSummary,
  logStepStart,
  logToolCall,
  logToolResult,
  logCostSummary
} from '../src/harness/logger.js';

describe('Logger Formatting Suite', () => {
  test('formatToolPayload truncates long strings properly', () => {
    const payload = { code: 'a'.repeat(200) };
    const formatted = formatToolPayload(payload);
    assert.ok(formatted.length < 150);
    assert.ok(formatted.includes('...'));
  });

  test('formatToolPayload handles short payloads without truncation', () => {
    const payload = { code: 'hello' };
    const formatted = formatToolPayload(payload);
    assert.strictEqual(formatted, JSON.stringify(payload));
  });

  test('formatToolPayload handles non-serializable objects gracefully', () => {
    const circular: any = {};
    circular.self = circular;
    const formatted = formatToolPayload(circular);
    assert.strictEqual(formatted, '[object Object]');
  });

  test('formatCostSummary formats table string with hit ratio (HIT state)', () => {
    const summary = formatCostSummary({
      inputTokens: 300,
      cacheWriteTokens: 0,
      cacheReadTokens: 2000,
      outputTokens: 150,
      totalTokens: 2450,
      costUSD: 0.001,
      costVND: 26,
      cacheSavingsUSD: 0.0014,
      cacheHitRatio: 0.8696
    }, 2);

    assert.ok(summary.includes('BÁO CÁO TÀI NGUYÊN & CHI PHÍ'));
    assert.ok(summary.includes('HIT'));
    assert.ok(summary.includes('87.0%') || summary.includes('86.96%') || summary.includes('87%'));
    assert.ok(summary.includes('CÂU 2'));
  });

  test('formatCostSummary formats WRITE state correctly', () => {
    const summary = formatCostSummary({
      inputTokens: 1000,
      cacheWriteTokens: 500,
      cacheReadTokens: 0,
      outputTokens: 100,
      totalTokens: 1600,
      costUSD: 0.002,
      costVND: 52,
      cacheSavingsUSD: 0,
      cacheHitRatio: 0
    }, 1);

    assert.ok(summary.includes('WRITE'));
    assert.ok(summary.includes('500 tokens'));
  });

  test('formatCostSummary formats MISS state correctly', () => {
    const summary = formatCostSummary({
      inputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 50,
      totalTokens: 550,
      costUSD: 0.0006,
      costVND: 15,
      cacheSavingsUSD: 0,
      cacheHitRatio: 0
    }, 3);

    assert.ok(summary.includes('MISS'));
  });

  test('log functions execute without throwing', () => {
    assert.doesNotThrow(() => {
      logStepStart(0, 5);
      logToolCall('testTool', { arg1: 'value' });
      logToolResult('testTool', { success: true }, 120);
      logToolResult('testTool', { isError: true, error: 'fail' });
      logCostSummary({
        inputTokens: 100,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 50,
        totalTokens: 150,
        costUSD: 0.0002,
        costVND: 5,
        cacheSavingsUSD: 0,
        cacheHitRatio: 0
      }, 1);
    });
  });
});
