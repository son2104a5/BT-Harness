import { tool } from 'ai';
import { z } from 'zod';
import { loadRubric } from '../data-store.js';

const rubricSchema = z.object({
  assignmentId: z.string().optional().describe('Mã bài tập cần tra cứu (mặc định ASM01)')
});

export const getRubricTool = tool({
  description: 'Tra cứu tiêu chí và barem chấm điểm chính thức của bài tập.',
  inputSchema: rubricSchema,
  execute: async ({ assignmentId }) => {
    try {
      const rubric = await loadRubric(assignmentId || 'ASM01');
      return {
        isError: false,
        rubric
      };
    } catch (error: any) {
      return {
        isError: true,
        message: error.message || 'Lỗi khi tải barem chấm điểm.'
      };
    }
  }
});
(getRubricTool as any).parameters = rubricSchema;
