import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRubricTool, getSubmissionTool, createSaveGradeTool, createGradingTools } from '../src/tools/index.js';
import { getStudents } from '../src/data-store.js';

describe('Custom Tools Suite', () => {
  after(async () => {
    // Reset test data
    const students = await getStudents(false);
    for (const s of students) {
      s.status = 'pending';
    }
    await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2));
    await fs.writeFile(path.resolve(process.cwd(), 'data/grades.json'), JSON.stringify([], null, 2));
  });

  test('getRubricTool executes successfully', async () => {
    const result = await (getRubricTool as any).execute({ assignmentId: 'ASM01' });
    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.rubric.assignmentId, 'ASM01');
  });

  test('getRubricTool executes with default assignmentId', async () => {
    const result = await (getRubricTool as any).execute({});
    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.rubric.assignmentId, 'ASM01');
  });

  test('getRubricTool handles unknown assignment gracefully', async () => {
    const result = await (getRubricTool as any).execute({ assignmentId: 'UNKNOWN' });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('Không tìm thấy'));
  });

  test('getSubmissionTool retrieves student by ID', async () => {
    const result = await (getSubmissionTool as any).execute({ studentId: 'HV001' });
    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.student.studentId, 'HV001');
  });

  test('getSubmissionTool returns error payload for missing student', async () => {
    const result = await (getSubmissionTool as any).execute({ studentId: 'HV999' });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('HV999'));
  });

  test('getSubmissionTool lists pending students when studentId is omitted', async () => {
    const result = await (getSubmissionTool as any).execute({ listPendingOnly: true });
    assert.strictEqual(result.isError, false);
    assert.ok(Array.isArray(result.students));
    assert.ok(result.students.length > 0);
  });

  test('saveGradeTool rejects when approval returns false', async () => {
    let capturedRequest: any = null;
    const mockApproval = async (req: any) => {
      capturedRequest = req;
      return false;
    };
    const saveGradeTool = createSaveGradeTool(mockApproval);

    const result = await (saveGradeTool as any).execute({
      studentId: 'HV002',
      scores: { logic: 2, clean_code: 2, error_handling: 0, edge_cases: 0 },
      totalScore: 4.0,
      feedback: 'Chưa đạt yêu cầu'
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('từ chối'));
    assert.strictEqual(capturedRequest.studentId, 'HV002');
    assert.strictEqual(capturedRequest.toolName, 'save_grade');
  });

  test('saveGradeTool saves when approval returns true', async () => {
    const mockApproval = async () => true;
    const saveGradeTool = createSaveGradeTool(mockApproval);

    const result = await (saveGradeTool as any).execute({
      studentId: 'HV002',
      scores: { logic: 2, clean_code: 2, error_handling: 0, edge_cases: 0 },
      totalScore: 4.0,
      feedback: 'Chưa đạt yêu cầu'
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('thành công'));
  });

  test('saveGradeTool catches and handles unexpected execution errors', async () => {
    const mockApproval = async () => {
      throw new Error('Approval service failure');
    };
    const saveGradeTool = createSaveGradeTool(mockApproval);

    const result = await (saveGradeTool as any).execute({
      studentId: 'HV002',
      scores: { logic: 2, clean_code: 2, error_handling: 0, edge_cases: 0 },
      totalScore: 4.0,
      feedback: 'Chưa đạt yêu cầu'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('Approval service failure'));
  });

  test('createGradingTools returns full tool suite', () => {
    const mockApproval = async () => true;
    const tools = createGradingTools(mockApproval);
    assert.ok(tools.get_rubric);
    assert.ok(tools.get_student_submission);
    assert.ok(tools.save_grade);
  });
});
