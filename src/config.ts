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
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  anthropicModel: 'claude-3-5-haiku-20241022',
  modelName: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: process.env.DEFAULT_ASSIGNMENT_ID || 'ASM01'
};
