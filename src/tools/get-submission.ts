import { tool } from 'ai';
import { z } from 'zod';
import { getStudents, getStudentById } from '../data-store.js';

const submissionSchema = z.object({
  studentId: z.string().optional().describe('Mã học viên cần lấy bài nộp (ví dụ: HV001)'),
  listPendingOnly: z.boolean().optional().describe('Nếu true, trả về danh sách các học viên chưa chấm')
});

export const getSubmissionTool = tool({
  description: 'Lấy bài làm/mã nguồn của học viên hoặc liệt kê danh sách học viên cần chấm.',
  inputSchema: submissionSchema,
  execute: async ({ studentId, listPendingOnly }) => {
    try {
      if (studentId) {
        const student = await getStudentById(studentId);
        if (!student) {
          return {
            isError: true,
            message: `Không tìm thấy học viên có mã '${studentId}' trong hệ thống bài nộp.`
          };
        }
        return {
          isError: false,
          student
        };
      }

      const students = await getStudents(Boolean(listPendingOnly));
      return {
        isError: false,
        total: students.length,
        students: students.map(s => ({
          studentId: s.studentId,
          fullName: s.fullName,
          assignmentId: s.assignmentId,
          status: s.status
        }))
      };
    } catch (error: any) {
      return {
        isError: true,
        message: error.message || 'Lỗi khi tra cứu danh sách bài nộp.'
      };
    }
  }
});
(getSubmissionTool as any).parameters = submissionSchema;
