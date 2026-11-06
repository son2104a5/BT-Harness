import dotenv from 'dotenv';
dotenv.config();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  modelName: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: process.env.DEFAULT_ASSIGNMENT_ID || 'ASM01'
};
