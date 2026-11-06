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
});
