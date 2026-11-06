import dotenv from 'dotenv';
dotenv.config();

export type LLMProvider = 'gemini' | 'anthropic' | 'deepseek';

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
const deepseekKey = process.env.DEEPSEEK_API_KEY || '';

// Determine default provider based on available keys or explicit env variable
function resolveDefaultProvider(): LLMProvider {
  if (process.env.LLM_PROVIDER === 'deepseek' || process.env.LLM_PROVIDER === 'anthropic' || process.env.LLM_PROVIDER === 'gemini') {
    return process.env.LLM_PROVIDER as LLMProvider;
  }
  if (deepseekKey.length > 0) return 'deepseek';
  if (geminiKey.length > 0) return 'gemini';
  if (anthropicKey.length > 0) return 'anthropic';
  return 'deepseek'; // Default to deepseek when no keys set
}

export const config = {
  provider: resolveDefaultProvider(),
  geminiApiKey: geminiKey,
  anthropicApiKey: anthropicKey,
  deepseekApiKey: deepseekKey,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  anthropicModel: 'claude-3-5-haiku-20241022',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4p1-flash',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.savegate.ai/v1',
  modelName: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: process.env.DEFAULT_ASSIGNMENT_ID || 'ASM01'
};
