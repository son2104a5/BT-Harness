import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectProviderFromKey, getLanguageModel } from '../src/harness/provider.js';

describe('Provider Factory Suite', () => {
  test('detectProviderFromKey identifies Gemini keys', () => {
    assert.strictEqual(detectProviderFromKey('AIzaSyAbc123_testKey'), 'gemini');
  });

  test('detectProviderFromKey identifies Anthropic keys', () => {
    assert.strictEqual(detectProviderFromKey('sk-ant-api03-testKey'), 'anthropic');
  });

  test('detectProviderFromKey returns null for unknown keys', () => {
    assert.strictEqual(detectProviderFromKey('unknown_key_prefix'), null);
  });

  test('getLanguageModel returns valid model instance for gemini and anthropic', () => {
    const geminiModel = getLanguageModel('gemini');
    assert.ok(geminiModel);
    assert.strictEqual(geminiModel.modelId, 'gemini-1.5-flash');

    const anthropicModel = getLanguageModel('anthropic');
    assert.ok(anthropicModel);
    assert.strictEqual(anthropicModel.modelId, 'claude-3-5-haiku-20241022');
  });
});
