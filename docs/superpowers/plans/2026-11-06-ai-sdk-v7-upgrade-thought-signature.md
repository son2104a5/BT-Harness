# AI SDK 7 Upgrade & Thought Signature Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade project dependencies to Vercel AI SDK 7 (`ai@^7.0.163`, `@ai-sdk/google@^4.0.112`, `@ai-sdk/anthropic@^4.0.97`) to natively preserve Google Gemini 3 `thoughtSignature` across multi-step tool loops without HTTP 400 validation errors.

**Architecture:** Unified `@ai-sdk/provider: 4.0.x` interface for both Google Gemini and Anthropic Claude providers. In `src/harness/loop.ts`, `generateText` preserves `providerMetadata.google.thoughtSignature` through multi-step executions and persists full message structures across multi-turn history.

**Tech Stack:** TypeScript, Node.js, `ai@^7.0.163`, `@ai-sdk/google@^4.0.112`, `@ai-sdk/anthropic@^4.0.97`, Express 5, Zod 3.

## Global Constraints

- Preserve all 3 custom tools (`get_rubric`, `get_student_submission`, `save_grade`) with Zod schemas.
- Preserve Human-in-the-loop (HITL) approval gate before `save_grade` executes.
- Enforce `maxSteps: 5` with tool deactivation on step index 4.
- Preserve Ephemeral Prompt Caching for Anthropic Claude and Context Caching for Google Gemini.
- Maintain real-time Observability (terminal logs, token/cost breakdowns in USD & VNĐ, and SSE events).
- All 49 unit tests must pass and `tsc --noEmit` must produce 0 errors.

---

### Task 1: Upgrade Package Dependencies to AI SDK 7

**Files:**
- Modify: `package.json:13-22`
- Test: `tests/provider.test.ts`

**Interfaces:**
- Consumes: npm registry
- Produces: Installed `@ai-sdk/provider@4.0.x`, `ai@^7.0.163`, `@ai-sdk/google@^4.0.112`, `@ai-sdk/anthropic@^4.0.97`

- [ ] **Step 1: Update package.json dependencies**

Update `dependencies` in `package.json`:
```json
  "dependencies": {
    "@ai-sdk/anthropic": "^4.0.97",
    "@ai-sdk/google": "^4.0.112",
    "ai": "^7.0.163",
    "chalk": "^5.4.1",
    "cors": "^2.8.6",
    "dotenv": "^16.4.7",
    "express": "^5.3.0",
    "zod": "^3.24.2"
  }
```

- [ ] **Step 2: Run npm install**

Run: `npm install`
Expected: Successfully installs AI SDK 7 packages without unmet peer dependency errors.

- [ ] **Step 3: Verify package versions in node_modules**

Run: `npm list ai @ai-sdk/google @ai-sdk/anthropic`
Expected: Shows `ai@7.x`, `@ai-sdk/google@4.x`, `@ai-sdk/anthropic@4.x`.

- [ ] **Step 4: Commit package upgrade**

```bash
git add package.json package-lock.json
git commit -m "build(deps): upgrade to AI SDK 7 ecosystem"
```

---

### Task 2: Align Provider Factory with AI SDK 7

**Files:**
- Modify: `src/harness/provider.ts`
- Test: `tests/provider.test.ts`

**Interfaces:**
- Consumes: `@ai-sdk/google`, `@ai-sdk/anthropic`, `src/config.ts`
- Produces: `getLanguageModel(provider?: LLMProvider, modelOverride?: string)` returning AI SDK 7 `LanguageModel`

- [ ] **Step 1: Write/Update unit test for AI SDK 7 provider models**

In `tests/provider.test.ts`, update assertions to match AI SDK 7 model interface:
```typescript
  test('getLanguageModel returns valid model instance for gemini and anthropic', () => {
    const geminiModel = getLanguageModel('gemini');
    assert.ok(geminiModel);
    assert.strictEqual(geminiModel.modelId, config.geminiModel);

    const anthropicModel = getLanguageModel('anthropic');
    assert.ok(anthropicModel);
    assert.strictEqual(anthropicModel.modelId, 'claude-3-5-haiku-20241022');
  });
```

- [ ] **Step 2: Update src/harness/provider.ts**

Ensure `createGoogleGenerativeAI` and `createAnthropic` or direct provider functions align with AI SDK 7:
```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { config, LLMProvider } from '../config.js';

export function detectProviderFromKey(key?: string | null): LLMProvider | null {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.startsWith('AQ') || trimmed.startsWith('AIza')) {
    return 'gemini';
  }
  if (trimmed.startsWith('sk-ant-')) {
    return 'anthropic';
  }
  return null;
}

export function getLanguageModel(providerOverride?: LLMProvider, modelOverride?: string): any {
  const activeProvider = providerOverride || config.provider;

  if (activeProvider === 'gemini') {
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    const google = createGoogleGenerativeAI({ apiKey });
    const modelName = modelOverride || config.geminiModel || 'gemini-3.8-flash';
    return google(modelName);
  }

  const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  const anthropic = createAnthropic({ apiKey });
  const modelName = modelOverride || config.anthropicModel || 'claude-3-5-haiku-20241022';
  return anthropic(modelName);
}
```

- [ ] **Step 3: Run provider test to verify pass**

Run: `tsx --test tests/provider.test.ts`
Expected: PASS (all 6 tests passing).

- [ ] **Step 4: Commit provider factory changes**

```bash
git add src/harness/provider.ts tests/provider.test.ts
git commit -m "feat(provider): align provider factory with AI SDK 7"
```

---

### Task 3: Update Harness Agent Loop for `thoughtSignature` & AI SDK 7

**Files:**
- Modify: `src/harness/loop.ts`
- Test: `tests/loop.test.ts`

**Interfaces:**
- Consumes: `generateText` from `ai`, `createGradingTools`, `getLanguageModel`, `config`
- Produces: `GradingHarness.ask(userQuery, onEvent)` preserving `thoughtSignature` and handling `prepareStep`

- [ ] **Step 1: Check existing loop tests**

Run: `tsx --test tests/loop.test.ts`
Verify baseline behavior.

- [ ] **Step 2: Update src/harness/loop.ts for AI SDK 7 generateText options**

Ensure `generateText` preserves `response.messages` (which holds `providerMetadata.google.thoughtSignature`):
```typescript
    // In GradingHarness.ask:
    // Support AI SDK 7 prepareStep callback
    const prepareStepHandler = async (options: { step?: number; stepNumber?: number }) => {
      const step = options.step ?? options.stepNumber ?? 0;
      currentStep = step;
      logStepStart(step, maxSteps);
      if (onEvent) onEvent({ type: 'step_start', step, maxSteps });

      if (shouldDisableToolsOnLastStep(step, maxSteps)) {
        console.log(chalk.red.bold(`⚠️  [GIỚI HẠN BƯỚC] Đã đến bước cuối (${step + 1}/${maxSteps}). Vô hiệu hóa toàn bộ tool.`));
        return {
          activeTools: [] as string[],
          toolChoice: 'none' as const,
          messages: [
            {
              role: 'system',
              content: 'CẢNH BÁO: Đây là bước cuối cùng được phép. Bạn KHÔNG THỂ gọi thêm bất kỳ công cụ nào. Hãy tổng hợp câu trả lời đầy đủ cho người dùng bằng toàn bộ dữ liệu bạn đã thu thập được từ các bước trước.'
            }
          ]
        };
      }
      return {};
    };

    let result: any;
    try {
      result = await (generateText as any)({
        model: getLanguageModel(),
        messages: [systemMessage, ...this.messages],
        tools,
        maxSteps,
        prepareStep: prepareStepHandler,
        onStepFinish: async (stepEvent: any) => {
          if (stepEvent.toolCalls && stepEvent.toolCalls.length > 0) {
            for (const tc of stepEvent.toolCalls) {
              logToolCall(tc.toolName, tc.args);
              if (onEvent) onEvent({ type: 'tool_call', toolName: tc.toolName, args: tc.args });
            }
          }
          if (stepEvent.toolResults && stepEvent.toolResults.length > 0) {
            for (const tr of stepEvent.toolResults) {
              logToolResult(tr.toolName, tr.result);
              if (onEvent) onEvent({ type: 'tool_result', toolName: tr.toolName, result: tr.result });
            }
          }

          if (stepEvent.usage) {
            const stepCost = calculateClaudeCost(stepEvent.usage, config.provider);
            accumulatedCost.inputTokens += stepCost.inputTokens;
            accumulatedCost.cacheWriteTokens += stepCost.cacheWriteTokens;
            accumulatedCost.cacheReadTokens += stepCost.cacheReadTokens;
            accumulatedCost.outputTokens += stepCost.outputTokens;
            accumulatedCost.totalTokens += stepCost.totalTokens;
            accumulatedCost.costUSD += stepCost.costUSD;
            accumulatedCost.costVND += stepCost.costVND;
            accumulatedCost.cacheSavingsUSD += stepCost.cacheSavingsUSD;
          }
        }
      });
    } catch (error) {
      this.messages.pop();
      throw error;
    }

    // Preserve full response messages including providerMetadata for thoughtSignature
    if (result.response && result.response.messages) {
      this.messages.push(...result.response.messages);
    } else {
      this.messages.push({
        role: 'assistant',
        content: result.text
      });
    }
```

- [ ] **Step 3: Run loop tests**

Run: `tsx --test tests/loop.test.ts`
Expected: PASS (all 7 tests passing).

- [ ] **Step 4: Commit loop updates**

```bash
git add src/harness/loop.ts tests/loop.test.ts
git commit -m "feat(loop): preserve thoughtSignature and update generateText for AI SDK 7"
```

---

### Task 4: Update Cost Calculator for AI SDK 7 Usage Formats

**Files:**
- Modify: `src/harness/cost.ts`
- Test: `tests/cost.test.ts`

**Interfaces:**
- Consumes: `usage` object from AI SDK 7 `stepEvent`
- Produces: `CostBreakdown`

- [ ] **Step 1: Check tests/cost.test.ts**

Run: `tsx --test tests/cost.test.ts`
Verify all 8 tests pass.

- [ ] **Step 2: Update src/harness/cost.ts to handle canonical and nested usage tokens**

Support:
- `usage.promptTokens` or `usage.inputTokens`
- `usage.completionTokens` or `usage.outputTokens`
- `usage.cachedTokens` or `usage.promptTokensDetails?.cachedTokens`
- Anthropic cache write / read metadata variations

- [ ] **Step 3: Run cost test suite**

Run: `tsx --test tests/cost.test.ts`
Expected: PASS (8/8 passing).

- [ ] **Step 4: Commit cost calculator adjustments**

```bash
git add src/harness/cost.ts tests/cost.test.ts
git commit -m "feat(cost): support AI SDK 7 usage payload format"
```

---

### Task 5: Full Regression Testing & Live E2E Verification

**Files:**
- Modify: `src/server.ts` (if needed for import alignment)
- Test: All 8 test suites in `tests/**/*.test.ts`

**Interfaces:**
- Consumes: Web Dashboard, Gemini API key
- Produces: 49/49 passing tests, 0 type errors, verified live tool call

- [ ] **Step 1: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2: Run all 8 unit test suites**

Run: `npm test`
Expected: 49/49 tests pass across all 8 suites.

- [ ] **Step 3: Restart Web Server with AI SDK 7**

Run: Restart web server on background task, verify `http://localhost:3000/api/status`.

- [ ] **Step 4: Test live get_rubric call with gemini-3.8-flash**

Send test request to `/api/chat` or via Web UI with `gemini-3.8-flash`.
Expected: `get_rubric` tool executes and completes without `missing a thought_signature` error.

- [ ] **Step 5: Commit final verification**

```bash
git commit --allow-empty -m "chore: verify AI SDK 7 upgrade and thought signature resolution"
```
