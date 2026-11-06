# Gemini Flash Dual Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Google Gemini 1.5 Flash alongside Anthropic Claude as a dual-provider architecture in the Student Grading Agent Harness, featuring smart API key auto-detection, Gemini pricing & cache tracking, and live hot-reloading on the Web UI.

**Architecture:** Install `@ai-sdk/google` and introduce a provider factory `getLanguageModel(provider)`. Extend cost tracking in `src/harness/cost.ts` with Gemini 1.5 Flash pricing. Update `src/config.ts` and `src/harness/loop.ts` to dynamically resolve language models. Enhance `src/server.ts` and `public/index.html` to auto-detect `AIza...` (Gemini) vs `sk-ant-...` (Claude) and hot-reload runtime models.

**Tech Stack:** TypeScript, `@ai-sdk/google`, `@ai-sdk/anthropic`, `ai`, `express`, `zod`, `chalk`, `node:test`.

## Global Constraints

- **Language & Runtime:** TypeScript executed via `tsx` under Node.js 24.
- **Providers:** `@ai-sdk/google` (`gemini-1.5-flash`) and `@ai-sdk/anthropic` (`claude-3-5-haiku-20241022`).
- **Auto-Detection:** Keys starting with `AIza` must automatically set `provider = 'gemini'`; keys starting with `sk-ant` must set `provider = 'anthropic'`.
- **Backward Compatibility:** All existing 40 unit and integration tests must continue to pass without regressions.
- **Max Steps Bound:** `MAX_STEPS = 5` bound must be preserved regardless of active provider.

---

### Task 1: Install `@ai-sdk/google` & Update Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`
- Modify: `.env.example`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `LLMProvider = 'gemini' | 'anthropic'`
  - `config.provider`, `config.geminiApiKey`, `config.geminiModel`

- [ ] **Step 1: Install `@ai-sdk/google`**

Run: `npm install @ai-sdk/google`
Expected: `@ai-sdk/google` added to dependencies.

- [ ] **Step 2: Update `.env.example`**

```env
# Provider: 'gemini' hoặc 'anthropic'
LLM_PROVIDER=gemini

# Google Gemini API Key (Lấy miễn phí tại aistudio.google.com)
GEMINI_API_KEY=your_gemini_api_key_here

# Anthropic API Key (nếu dùng Claude)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

MAX_STEPS=5
DEFAULT_ASSIGNMENT_ID=ASM01
```

- [ ] **Step 3: Update `src/config.ts`**

```ts
import dotenv from 'dotenv';
dotenv.config();

export type LLMProvider = 'gemini' | 'anthropic';

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

// Default to gemini if geminiKey is set, or if explicitly requested, otherwise anthropic
const defaultProvider: LLMProvider = process.env.LLM_PROVIDER === 'anthropic'
  ? 'anthropic'
  : (geminiKey.length > 0 || !anthropicKey.length ? 'gemini' : 'anthropic');

export const config = {
  provider: defaultProvider as LLMProvider,
  geminiApiKey: geminiKey,
  anthropicApiKey: anthropicKey,
  geminiModel: 'gemini-1.5-flash',
  anthropicModel: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: process.env.DEFAULT_ASSIGNMENT_ID || 'ASM01'
};
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit configuration update**

```bash
git add package.json package-lock.json src/config.ts .env.example
git commit -m "feat(config): add @ai-sdk/google and dual-provider configuration"
```

---

### Task 2: Provider Factory & Gemini Pricing Module

**Files:**
- Create: `src/harness/provider.ts`
- Modify: `src/harness/cost.ts`
- Modify: `tests/cost.test.ts`
- Create: `tests/provider.test.ts`

**Interfaces:**
- Consumes: `config` from `src/config.ts`
- Produces:
  - `getLanguageModel(provider?: LLMProvider): LanguageModel`
  - `detectProviderFromKey(key: string): LLMProvider | null`
  - `PRICE_GEMINI_BASE_INPUT`, `PRICE_GEMINI_CACHE_READ`, `PRICE_GEMINI_OUTPUT`
  - `calculateModelCost(usage: any, provider?: LLMProvider): CostBreakdown`

- [ ] **Step 1: Write test for provider factory and key detection**

Create `tests/provider.test.ts`:
```ts
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
```

- [ ] **Step 2: Implement `src/harness/provider.ts`**

```ts
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { config, LLMProvider } from '../config.js';

export function detectProviderFromKey(key: string): LLMProvider | null {
  const trimmed = key.trim();
  if (trimmed.startsWith('AIza')) {
    return 'gemini';
  }
  if (trimmed.startsWith('sk-ant')) {
    return 'anthropic';
  }
  return null;
}

export function getLanguageModel(targetProvider?: LLMProvider) {
  const provider = targetProvider || config.provider;

  if (provider === 'gemini') {
    // If geminiApiKey is configured, ensure google provider picks it up
    return google(config.geminiModel, {
      apiKey: config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    });
  }

  return anthropic(config.anthropicModel, {
    apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  });
}
```

- [ ] **Step 3: Update `src/harness/cost.ts` with Gemini 1.5 Flash rates**

```ts
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
```

- [ ] **Step 4: Add Gemini test in `tests/cost.test.ts`**

Add to `tests/cost.test.ts`:
```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass cleanly.

- [ ] **Step 6: Commit provider factory & pricing module**

```bash
git add src/harness/provider.ts src/harness/cost.ts tests/provider.test.ts tests/cost.test.ts
git commit -m "feat(harness): implement provider factory and Gemini Flash cost tracking"
```

---

### Task 3: Agent Loop Dual Provider Integration

**Files:**
- Modify: `src/harness/loop.ts`
- Modify: `src/harness/logger.ts`

**Interfaces:**
- Consumes: `getLanguageModel` from `src/harness/provider.ts`
- Produces: Dual provider support in `GradingHarness`

- [ ] **Step 1: Update `src/harness/loop.ts`**

In `GradingHarness.ask()`, use `getLanguageModel()` to obtain model:
```ts
import { getLanguageModel } from './provider.js';

...
  result = await (generateText as any)({
    model: getLanguageModel(),
    messages: [systemMessage, ...this.messages],
...
```
And pass `config.provider` to `calculateClaudeCost(stepEvent.usage, config.provider)`.

- [ ] **Step 2: Update `src/harness/logger.ts`**

Update `formatCostSummary` to display the active model name:
```ts
lines.push(chalk.cyan.bold(`┌──────────────── BÁO CÁO TÀI NGUYÊN & CHI PHÍ (${config.provider.toUpperCase()} - CÂU ${questionIndex}) ────────────────┐`));
```

- [ ] **Step 3: Run test suite**

Run: `npm test`
Expected: 42+ tests passing.

- [ ] **Step 4: Commit agent loop update**

```bash
git add src/harness/loop.ts src/harness/logger.ts
git commit -m "feat(loop): dynamically resolve active model from provider factory"
```

---

### Task 4: Web Server & Web UI Smart Key Auto-Detection

**Files:**
- Modify: `src/server.ts`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `detectProviderFromKey`, `config`
- Produces:
  - Smart key auto-detection on `/api/config`
  - Hot-reloading of `harnessInstance` with Gemini or Claude
  - Web UI indicators and key setup instructions

- [ ] **Step 1: Update `src/server.ts`**

In `src/server.ts`:
1. Update `GET /api/status`:
```ts
app.get('/api/status', (req: Request, res: Response) => {
  const activeKey = config.provider === 'gemini' ? config.geminiApiKey : config.anthropicApiKey;
  res.json({
    configured: Boolean(activeKey && activeKey.trim().length > 0),
    provider: config.provider,
    model: config.provider === 'gemini' ? config.geminiModel : config.anthropicModel,
    maxSteps: config.maxSteps,
    defaultAssignmentId: config.defaultAssignmentId
  });
});
```

2. Update `POST /api/config`:
```ts
app.post('/api/config', (req: Request, res: Response) => {
  const { apiKey, provider } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(400).json({ success: false, message: 'API Key không hợp lệ.' });
    return;
  }

  const detected = detectProviderFromKey(apiKey);
  const targetProvider = (provider || detected || config.provider) as LLMProvider;

  config.provider = targetProvider;
  if (targetProvider === 'gemini') {
    config.geminiApiKey = apiKey.trim();
    process.env.GEMINI_API_KEY = apiKey.trim();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey.trim();
  } else {
    config.anthropicApiKey = apiKey.trim();
    process.env.ANTHROPIC_API_KEY = apiKey.trim();
  }

  // Hot reload harness
  harnessInstance = createWebHarness();
  broadcastSSE({ type: 'data_updated' });

  res.json({
    success: true,
    provider: targetProvider,
    model: targetProvider === 'gemini' ? config.geminiModel : config.anthropicModel,
    message: `Đã kết nối thành công với ${targetProvider === 'gemini' ? 'Google Gemini 1.5 Flash' : 'Claude 3.5 Haiku'}!`
  });
});
```

- [ ] **Step 2: Update `public/index.html`**

1. Add provider badge in Header:
   - Green/Cyan for Google Gemini 1.5 Flash
   - Indigo for Claude 3.5 Haiku
2. Update config modal:
   - Input field with real-time detection label ("Đã nhận diện: Google Gemini API Key" or "Anthropic Claude API Key").
   - Link to Google AI Studio: `https://aistudio.google.com/` for free API keys.

- [ ] **Step 3: Test Web API endpoints**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit server and UI enhancements**

```bash
git add src/server.ts public/index.html
git commit -m "feat(web): add smart key auto-detection and live provider hot-reloading"
```

---

### Task 5: Verification & End-to-End Validation

**Files:**
- Test: All tests in `tests/`
- Runtime verification: Web API status and demo validation

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 100% tests pass.

- [ ] **Step 2: Typecheck project**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Verify Gemini key detection & status via API**

Run:
```bash
powershell -Command "Invoke-RestMethod -Uri 'http://localhost:3000/api/status' | ConvertTo-Json"
```
Verify `provider` and `model` report cleanly.

- [ ] **Step 4: Commit final verification**

```bash
git commit --allow-empty -m "chore: verify Gemini Flash dual provider integration"
```
