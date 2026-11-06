# Design Specification: AI SDK 7 Upgrade & Gemini 3 Thought Signature Preservation

- **Date:** 2026-11-06
- **Status:** Approved
- **Topic:** AI SDK 7 Upgrade & Gemini 3 Thought Signature Support

---

## 1. Background & Problem Statement

When using newer Google Gemini 3 reasoning models (such as `gemini-3.8-flash`) for multi-step tool execution, Google API enforces a strict security and reasoning validation mechanism called **Thought Signatures** (`thought_signature` / `thoughtSignature`).

When the model decides to call a tool (e.g. `get_rubric` or `get_student_submission`), Google API attaches an encrypted reasoning signature to the function call part. On subsequent execution turns, Google API strictly requires this exact signature to be echoed back in the message history alongside the tool result. If missing or dropped, Google API returns:
```text
Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly, and missing thought_signature may lead to degraded model performance. Additional data, function call default_api:get_rubric , position 3. Please refer to https://aistudio.google.com/docs/thought-signatures for more details.
```

In the current codebase, the project relies on legacy `ai@4.1.45` and `@ai-sdk/google@1.2.22` (built on `@ai-sdk/provider@1.0.8`), which does not capture or re-send `thoughtSignature` metadata.

---

## 2. Goals & Success Criteria

1. **Resolve Thought Signature Error**: Upgrade the project to the latest Vercel AI SDK 7 ecosystem (`ai@^7.0.163`, `@ai-sdk/google@^4.0.112`, `@ai-sdk/anthropic@^4.0.97`) which natively captures and relays `thoughtSignature` across multi-step tool loops.
2. **Unified Provider Specification**: Align all providers (`google` and `anthropic`) under `@ai-sdk/provider: 4.0.x`.
3. **Preserve Existing Capabilities**:
   - Multi-step tool loop with `maxSteps = 5` and last-step tool deactivation via `prepareStep`.
   - Ephemeral Prompt Caching for Anthropic Claude and Context Caching for Google Gemini.
   - Real-time Observability: Terminal table format, Token usage and cost calculations in USD & VNĐ, and Web SSE event broadcasting.
   - Human-in-the-loop (HITL) approval requirement before saving grades in `data/grades.json`.
4. **Resilience & Testing**:
   - Zero compilation errors (`tsc --noEmit`).
   - 100% test pass rate across all unit test suites.
   - Successful E2E live verification of `get_rubric` and grading workflow with `gemini-3.8-flash`.

---

## 3. Architecture & Dependency Upgrades

### 3.1 Package Dependencies (`package.json`)
Upgrade key dependencies:
- `ai`: `^7.0.163`
- `@ai-sdk/google`: `^4.0.112`
- `@ai-sdk/anthropic`: `^4.0.97`
- `zod`: `^3.24.2` (or updated if required by peer dependencies)

### 3.2 Provider Factory (`src/harness/provider.ts`)
- Use updated factory methods from `@ai-sdk/google` and `@ai-sdk/anthropic`.
- Retain smart API key auto-detection:
  - Keys starting with `AQ` or `AIza` -> Google Gemini provider (`gemini-3.8-flash` default, `gemini-2.5-flash` available).
  - Keys starting with `sk-ant` -> Anthropic provider (`claude-3-5-haiku-20241022`).
- Seamlessly instantiate provider models satisfying AI SDK 7's unified `LanguageModel` interface.

---

## 4. Agent Loop & State Management (`src/harness/loop.ts`)

### 4.1 `thoughtSignature` Preservation
- In AI SDK 7, `@ai-sdk/google` automatically captures `thoughtSignature` on model parts and stores them in `providerMetadata.google.thoughtSignature`.
- During multi-step tool loops inside `generateText`, the engine preserves this metadata automatically across internal steps.
- At the end of each turn, the harness stores `result.response.messages` (which includes all parts and `providerMetadata`) into `this.messages`.
- In subsequent turns (multi-turn conversation), passing `[systemMessage, ...this.messages]` to `generateText` preserves the thought signature chain, preventing HTTP 400 rejection from Google API.

### 4.2 Safe Bounds & Step Enforcement
- `maxSteps` remains 5.
- On step index `maxSteps - 1` (step 4), `prepareStep` disables tools by returning `toolChoice: 'none'` and `activeTools: []`, instructing the model to synthesize the final answer.

### 4.3 Prompt Caching Integration
- Maintain `SYSTEM_INSTRUCTION` (> 2048 tokens).
- Maintain `experimental_providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } }` for Claude 3.5.
- Gemini context caching automatically activates based on token volume without interfering with tool signatures.

---

## 5. Cost Tracking & Observability (`src/harness/cost.ts`, `src/harness/logger.ts`)

- AI SDK 7 provides standard token usage in `stepEvent.usage`:
  - `inputTokens` / `promptTokens`
  - `outputTokens` / `completionTokens`
  - Cached tokens via `cachedTokens` or `promptTokensDetails.cachedTokens`.
- Update `calculateClaudeCost` and `calculateGeminiCost` to handle both the canonical properties and any SDK 7 property variations safely.
- Maintain realtime SSE events: `step_start`, `tool_call`, `tool_result`, `final_answer`, `cost_summary`.

---

## 6. Error Handling & Resilient Guard

- Wrap `generateText` in `loop.ts` with error handling that rolls back `this.messages` if a request fails, avoiding corrupted states.
- If Google API encounters an unexpected validator rejection, format and surface a clear diagnostic message to the user with a quick suggestion to test `gemini-2.5-flash`.

---

## 7. Verification Plan

1. **Dependencies Installation**: Run `npm install` and verify resolution of `@ai-sdk/provider: 4.0.x`.
2. **Typecheck**: Run `npm run typecheck` (`tsc --noEmit`) to verify zero TypeScript errors.
3. **Unit Tests**: Run `npm test` across all 8 test suites and ensure all unit tests pass cleanly.
4. **Live Verification**:
   - Start web server with `npm run web`.
   - Send prompt `📋 Xem barem & DS chưa chấm` with `gemini-3.8-flash`.
   - Confirm `get_rubric` tool executes without `missing thought_signature` error.
