import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SYSTEM_INSTRUCTION, shouldDisableToolsOnLastStep, GradingHarness } from '../src/harness/loop.js';
import { config } from '../src/config.js';

describe('Agent Loop Logic Suite', () => {
  test('SYSTEM_INSTRUCTION defines grading role clearly', () => {
    assert.ok(SYSTEM_INSTRUCTION.includes('trợ lý chấm điểm'));
    assert.ok(SYSTEM_INSTRUCTION.includes('rubric'));
    assert.ok(SYSTEM_INSTRUCTION.includes('save_grade'));
    assert.ok(SYSTEM_INSTRUCTION.includes('get_rubric'));
    assert.ok(SYSTEM_INSTRUCTION.includes('get_student_submission'));
    assert.ok(SYSTEM_INSTRUCTION.includes('fetch_git_repo'));
  });

  test('SYSTEM_INSTRUCTION describes read_file and fetch_git_repo tools and workflow', () => {
    assert.ok(SYSTEM_INSTRUCTION.includes('read_file'));
    assert.ok(SYSTEM_INSTRUCTION.includes('filePath'));
    assert.ok(SYSTEM_INSTRUCTION.includes('fetch_git_repo'));
    assert.ok(SYSTEM_INSTRUCTION.includes('github.com'));
  });

  test('shouldDisableToolsOnLastStep triggers on step 4 when maxSteps is 5', () => {
    assert.strictEqual(shouldDisableToolsOnLastStep(0, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(1, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(2, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(3, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(4, 5), true);
    assert.strictEqual(shouldDisableToolsOnLastStep(5, 5), true);
  });

  test('shouldDisableToolsOnLastStep handles edge cases with small maxSteps', () => {
    assert.strictEqual(shouldDisableToolsOnLastStep(0, 1), true);
    assert.strictEqual(shouldDisableToolsOnLastStep(0, 2), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(1, 2), true);
  });

  test('config provides default values', () => {
    assert.strictEqual(config.modelName, 'claude-3-5-haiku-20241022');
    assert.strictEqual(config.maxSteps, 5);
    assert.strictEqual(config.defaultAssignmentId, 'ASM01');
    assert.strictEqual(typeof config.anthropicApiKey, 'string');
  });

  test('GradingHarness initializes with empty history', () => {
    const mockApproval = async () => true;
    const harness = new GradingHarness(mockApproval);
    assert.deepStrictEqual(harness.getHistory(), []);
  });

  test('SYSTEM_INSTRUCTION is comprehensive and exceeds 2048 token threshold', () => {
    assert.ok(SYSTEM_INSTRUCTION.length > 8000, `SYSTEM_INSTRUCTION length is ${SYSTEM_INSTRUCTION.length}, expected > 8000`);
    assert.ok(SYSTEM_INSTRUCTION.includes('ASM01'));
    assert.ok(SYSTEM_INSTRUCTION.includes('calculateCart'));
    assert.ok(SYSTEM_INSTRUCTION.includes('Human-in-the-loop'));
    assert.ok(SYSTEM_INSTRUCTION.includes('CHECKLIST'));
  });

  test('GradingHarness rolls back history when generateText fails', async () => {
    const originalApiKey = process.env.ANTHROPIC_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.ANTHROPIC_API_KEY = 'test-mock-key';
    globalThis.fetch = (async () => {
      throw new Error('Anthropic API Network Failure');
    }) as any;

    try {
      const harness = new GradingHarness(async () => true);
      assert.strictEqual(harness.getHistory().length, 0);

      await assert.rejects(async () => {
        await harness.ask('Câu hỏi gây lỗi');
      }, /Anthropic API Network Failure/);

      // Verify user message was popped and history is empty
      assert.strictEqual(harness.getHistory().length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      }
    }
  });
});
