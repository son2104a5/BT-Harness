import { getRubricTool } from './get-rubric.js';
import { getSubmissionTool } from './get-submission.js';
import { createSaveGradeTool, type ApprovalHandler } from './save-grade.js';

export { getRubricTool, getSubmissionTool, createSaveGradeTool };
export type { ApprovalHandler };

export function createGradingTools(approvalHandler: ApprovalHandler) {
  return {
    get_rubric: getRubricTool,
    get_student_submission: getSubmissionTool,
    save_grade: createSaveGradeTool(approvalHandler)
  };
}
