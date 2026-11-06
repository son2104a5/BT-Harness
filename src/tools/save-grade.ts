import { tool } from 'ai';
import { z } from 'zod';
import { saveGradeRecord, getStudentById } from '../data-store.js';
import { ToolApprovalRequest } from '../types.js';

export type ApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>;

export const saveGradeSchema = z.object({
  studentId: z.string().describe('Mã học viên (ví dụ: HV001)'),
  assignmentId: z.string().default('ASM01').describe('Mã bài tập'),
  scores: z.record(z.string(), z.number().min(0)).describe('Điểm chi tiết từng tiêu chí theo rubric'),
  totalScore: z.number().min(0).max(10).describe('Tổng điểm trên thang 10'),
  feedback: z.string().describe('Nhận xét chi tiết ưu điểm và nhược điểm của bài nộp')
});

export function createSaveGradeTool(approvalHandler: ApprovalHandler) {
  const t = tool({
    description: 'Lưu điểm và nhận xét chính thức cho học viên. Thao tác này yêu cầu Giảng viên phê duyệt trước khi ghi.',
    inputSchema: saveGradeSchema,
    execute: async ({ studentId, assignmentId, scores, totalScore, feedback }) => {
      try {
        const student = await getStudentById(studentId);
        if (!student) {
          return {
            success: false,
            isError: true,
            message: `Không tìm thấy học viên có mã '${studentId}' trong hệ thống để lưu điểm.`
          };
        }
        const studentName = student.fullName;

        // Trigger Human-in-the-loop approval
        const approved = await approvalHandler({
          toolName: 'save_grade',
          studentId,
          studentName,
          scores,
          totalScore,
          feedback
        });

        if (!approved) {
          return {
            success: false,
            message: `Giảng viên đã từ chối phê duyệt lưu điểm cho học viên ${studentName} (${studentId}). Vui lòng hỏi giảng viên cần điều chỉnh điểm hoặc tiêu chí nào.`
          };
        }

        // Persist grade if approved
        await saveGradeRecord({
          studentId,
          assignmentId: assignmentId || 'ASM01',
          scores,
          totalScore,
          feedback,
          gradedAt: new Date().toISOString(),
          approvedBy: 'Giảng viên (Approved via CLI)'
        });

        return {
          success: true,
          message: `Điểm số của học viên ${studentName} (${studentId}) đã được Giảng viên phê duyệt và lưu thành công vào cơ sở dữ liệu.`
        };
      } catch (error: any) {
        return {
          success: false,
          isError: true,
          message: `Lỗi khi lưu điểm: ${error.message}`
        };
      }
    }
  });
  (t as any).parameters = saveGradeSchema;
  return t;
}
