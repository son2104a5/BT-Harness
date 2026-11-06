import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { loadRubric, getStudents, getStudentById, saveGradeRecord } from '../src/data-store.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Data Store Module', () => {
  test('loadRubric returns rubric for ASM01', async () => {
    const rubric = await loadRubric('ASM01');
    assert.strictEqual(rubric.assignmentId, 'ASM01');
    assert.strictEqual(rubric.criteria.length, 4);
  });

  test('getStudents returns pending students', async () => {
    const students = await getStudents(true);
    assert.ok(students.length >= 3);
    assert.strictEqual(students[0].status, 'pending');
  });

  test('getStudentById finds existing student', async () => {
    const student = await getStudentById('HV001');
    assert.ok(student);
    assert.strictEqual(student.fullName, 'Nguyễn Văn An');
  });

  test('getStudentById returns null for non-existent student', async () => {
    const student = await getStudentById('HV999');
    assert.strictEqual(student, null);
  });

  test('saveGradeRecord persists grade and updates student status', async () => {
    const record = {
      studentId: 'HV001',
      assignmentId: 'ASM01',
      scores: { logic: 4, clean_code: 3, error_handling: 1, edge_cases: 0.5 },
      totalScore: 8.5,
      feedback: 'Bài làm tốt',
      gradedAt: new Date().toISOString(),
      approvedBy: 'Instructor'
    };

    await saveGradeRecord(record);
    const updated = await getStudentById('HV001');
    assert.strictEqual(updated?.status, 'graded');

    // Clean up test state: reset HV001 to pending
    const students = await getStudents(false);
    const student = students.find(s => s.studentId === 'HV001');
    if (student) student.status = 'pending';
    await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2));
    await fs.writeFile(path.resolve(process.cwd(), 'data/grades.json'), JSON.stringify([], null, 2));
  });
});
