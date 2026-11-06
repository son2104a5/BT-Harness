import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
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
  if (trimmed.startsWith('sk-')) {
    return 'deepseek';
  }
  return null;
}

export function getLanguageModel(providerOverride?: LLMProvider, modelOverride?: string): any {
  let activeProvider = providerOverride || config.provider;

  if (activeProvider === 'deepseek') {
    const apiKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '';
    const deepseek = createDeepSeek({ apiKey });
    const modelName = modelOverride || config.deepseekModel || 'deepseek-chat';
    return deepseek(modelName);
  }

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
