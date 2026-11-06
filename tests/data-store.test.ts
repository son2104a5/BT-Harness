import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { loadRubric, getStudents, getStudentById, saveGradeRecord } from '../src/data-store.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Data Store Module', () => {
  afterEach(async () => {
    // Clean up test state: reset all students to pending and clear grades
    try {
      const students = await getStudents(false);
      for (const s of students) {
        s.status = 'pending';
      }
      await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2));
      await fs.writeFile(path.resolve(process.cwd(), 'data/grades.json'), JSON.stringify([], null, 2));
    } catch {
      // Ignore cleanup error if files not found
    }
  });

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
    try {
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
    } finally {
      const students = await getStudents(false);
      const student = students.find(s => s.studentId === 'HV001');
      if (student) student.status = 'pending';
      await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2));
      await fs.writeFile(path.resolve(process.cwd(), 'data/grades.json'), JSON.stringify([], null, 2));
    }
  });

  test('saveGradeRecord handles case-insensitive studentId and assignmentId on re-grading', async () => {
    const record1 = {
      studentId: 'HV001',
      assignmentId: 'ASM01',
      scores: { logic: 2 },
      totalScore: 5.0,
      feedback: 'Lần 1',
      gradedAt: new Date().toISOString(),
      approvedBy: 'Instructor'
    };
    await saveGradeRecord(record1);

    const record2 = {
      studentId: 'hv001',
      assignmentId: 'asm01',
      scores: { logic: 4 },
      totalScore: 9.0,
      feedback: 'Lần 2 (Chấm lại)',
      gradedAt: new Date().toISOString(),
      approvedBy: 'Instructor'
    };
    await saveGradeRecord(record2);

    const gradesContent = await fs.readFile(path.resolve(process.cwd(), 'data/grades.json'), 'utf-8');
    const grades = JSON.parse(gradesContent);
    assert.strictEqual(grades.length, 1);
    assert.strictEqual(grades[0].totalScore, 9.0);
  });
});
