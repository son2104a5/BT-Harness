import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectProviderFromKey, getLanguageModel } from '../src/harness/provider.js';
import { config } from '../src/config.js';

describe('Provider Factory Suite', () => {
  test('detectProviderFromKey identifies Gemini keys', () => {
    assert.strictEqual(detectProviderFromKey('AIzaSyAbc123_testKey'), 'gemini');
    assert.strictEqual(detectProviderFromKey('AQ.sampleNewFormatGeminiKey'), 'gemini');
  });

  test('detectProviderFromKey identifies Anthropic keys', () => {
    assert.strictEqual(detectProviderFromKey('sk-ant-api03-testKey'), 'anthropic');
  });

  test('detectProviderFromKey identifies DeepSeek keys', () => {
    assert.strictEqual(detectProviderFromKey('sk-0123456789abcdefdeepseekkey'), 'deepseek');
  });

  test('detectProviderFromKey returns null for unknown keys', () => {
    assert.strictEqual(detectProviderFromKey('unknown_key_prefix'), null);
  });

  test('detectProviderFromKey returns null for empty and nullish values', () => {
    assert.strictEqual(detectProviderFromKey(''), null);
    assert.strictEqual(detectProviderFromKey('   '), null);
    assert.strictEqual(detectProviderFromKey(null as any), null);
    assert.strictEqual(detectProviderFromKey(undefined as any), null);
  });

  test('getLanguageModel returns valid model instance for deepseek, gemini and anthropic', () => {
    const deepseekModel = getLanguageModel('deepseek');
    assert.ok(deepseekModel);
    assert.strictEqual(deepseekModel.modelId, config.deepseekModel);

    const geminiModel = getLanguageModel('gemini');
    assert.ok(geminiModel);
    assert.strictEqual(geminiModel.modelId, config.geminiModel);

    const anthropicModel = getLanguageModel('anthropic');
    assert.ok(anthropicModel);
    assert.strictEqual(anthropicModel.modelId, 'claude-3-5-haiku-20241022');

    const customModel = getLanguageModel('deepseek', 'deepseek-reasoner');
    assert.strictEqual(customModel.modelId, 'deepseek-reasoner');
  });

  test('getLanguageModel returns default provider model when called without arguments', () => {
    const defaultModel = getLanguageModel();
    assert.ok(defaultModel);
    assert.ok(defaultModel.modelId);
  });
});
