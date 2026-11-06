import { test, describe } from 'node:test';
import assert from 'node:assert';
import { printWelcomeBanner } from '../src/index.js';

describe('CLI & Entrypoint Suite', () => {
  test('printWelcomeBanner outputs without throwing', () => {
    assert.doesNotThrow(() => {
      printWelcomeBanner();
    });
  });
});
