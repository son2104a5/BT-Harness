import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { config, LLMProvider } from '../config.js';

export function detectProviderFromKey(key: string): LLMProvider | null {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.startsWith('AIza') || trimmed.startsWith('AQ')) {
    return 'gemini';
  }
  if (trimmed.startsWith('sk-ant')) {
    return 'anthropic';
  }
  return null;
}

export function getLanguageModel(targetProvider?: LLMProvider) {
  let provider = targetProvider || config.provider;

  if (!targetProvider && provider === 'gemini') {
    const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!geminiKey && anthropicKey) {
      provider = 'anthropic';
    }
  }

  if (provider === 'gemini') {
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (apiKey) {
      const googleProvider = createGoogleGenerativeAI({ apiKey });
      return googleProvider(config.geminiModel);
    }
    return google(config.geminiModel);
  }

  const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const anthropicProvider = createAnthropic({ apiKey });
    return anthropicProvider(config.anthropicModel);
  }

  return anthropic(config.anthropicModel);
}
