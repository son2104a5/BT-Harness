import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRubricTool, getSubmissionTool, readFileTool, fetchGitRepoTool, createSaveGradeTool, createGradingTools } from '../src/tools/index.js';
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
    assert.ok(result.students[0].filePath);
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

  test('saveGradeTool returns error when studentId does not exist without calling approvalHandler', async () => {
    let approvalCalled = false;
    const mockApproval = async () => {
      approvalCalled = true;
      return true;
    };
    const saveGradeTool = createSaveGradeTool(mockApproval);

    const result = await (saveGradeTool as any).execute({
      studentId: 'HV999',
      scores: { logic: 2 },
      totalScore: 5.0,
      feedback: 'Không tìm thấy học viên'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.message, `Không tìm thấy học viên có mã 'HV999' trong hệ thống để lưu điểm.`);
    assert.strictEqual(approvalCalled, false);
  });

  test('saveGradeTool validates score ranges with Zod schema', () => {
    const saveGradeTool = createSaveGradeTool(async () => true);
    const schema = (saveGradeTool as any).parameters;

    // Valid
    const valid = schema.safeParse({
      studentId: 'HV001',
      assignmentId: 'ASM01',
      scores: { logic: 3.5, clean_code: 2.5 },
      totalScore: 6.0,
      feedback: 'Tốt'
    });
    assert.strictEqual(valid.success, true);

    // Invalid totalScore > 10
    const overScore = schema.safeParse({
      studentId: 'HV001',
      scores: { logic: 11 },
      totalScore: 11,
      feedback: 'Quá điểm'
    });
    assert.strictEqual(overScore.success, false);

    // Invalid totalScore < 0
    const negTotal = schema.safeParse({
      studentId: 'HV001',
      scores: { logic: 0 },
      totalScore: -1,
      feedback: 'Điểm âm'
    });
    assert.strictEqual(negTotal.success, false);

    // Invalid criteria score < 0
    const negCrit = schema.safeParse({
      studentId: 'HV001',
      scores: { logic: -0.5 },
      totalScore: 5,
      feedback: 'Tiêu chí âm'
    });
    assert.strictEqual(negCrit.success, false);
  });

  test('getSubmissionTool reads physical file when submissionCode is empty', async () => {
    const originalStudents = await fs.readFile(path.resolve(process.cwd(), 'data/students.json'), 'utf-8');
    try {
      const students = JSON.parse(originalStudents);
      students[0].submissionCode = '';
      await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2));

      const result = await (getSubmissionTool as any).execute({ studentId: 'HV001' });
      assert.strictEqual(result.isError, false);
      assert.ok(result.student.submissionCode.includes('calculateCart'));
    } finally {
      await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), originalStudents, 'utf-8');
    }
  });

  test('createGradingTools returns full suite of 5 tools', () => {
    assert.ok(fetchGitRepoTool);
    const mockApproval = async () => true;
    const tools = createGradingTools(mockApproval);
    assert.ok(tools.get_rubric);
    assert.ok(tools.get_student_submission);
    assert.ok(tools.read_file);
    assert.ok(tools.fetch_git_repo);
    assert.ok(tools.save_grade);
  });
});
