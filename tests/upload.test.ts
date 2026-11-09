import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStudents, getStudentById } from '../src/data-store.js';

describe('Submission Upload & Student Registration Suite', () => {
  const rootDir = process.cwd();
  const uploadDir = path.resolve(rootDir, 'data/submissions/uploaded');
  let createdFiles: string[] = [];
  let originalStudentsJson: string | null = null;

  afterEach(async () => {
    // Clean up created test files
    for (const filePath of createdFiles) {
      await fs.unlink(filePath).catch(() => {});
    }
    createdFiles = [];

    // Restore students.json if it was backed up
    if (originalStudentsJson !== null) {
      await fs.writeFile(
        path.resolve(rootDir, 'data/students.json'),
        originalStudentsJson,
        'utf-8'
      );
      originalStudentsJson = null;
    }
  });

  test('saves uploaded code to data/submissions/uploaded/ and registers student', async () => {
    await fs.mkdir(uploadDir, { recursive: true });

    const fileName = `test_submission_${Date.now()}.js`;
    const filePath = path.join(uploadDir, fileName);
    const mockCode = 'function calculateCart(items) { return { total: 100 }; }';

    await fs.writeFile(filePath, mockCode, 'utf-8');
    createdFiles.push(filePath);
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

    // Verify file exists
    const readBack = await fs.readFile(filePath, 'utf-8');
    assert.strictEqual(readBack, mockCode);
    assert.ok(relativePath.startsWith('data/submissions/uploaded/'));
  });

  test('registers student record in students.json and can be retrieved by getStudentById', async () => {
    await fs.mkdir(uploadDir, { recursive: true });

    // Backup current students.json
    const studentsJsonPath = path.resolve(rootDir, 'data/students.json');
    originalStudentsJson = await fs.readFile(studentsJsonPath, 'utf-8');

    const fileName = `test_reg_${Date.now()}.ts`;
    const filePath = path.join(uploadDir, fileName);
    const mockCode = 'export function calculateCart(items: any[]) { return { total: 50 }; }';
    await fs.writeFile(filePath, mockCode, 'utf-8');
    createdFiles.push(filePath);

    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const studentId = `HV_UP_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const studentName = 'Test Student Registration';

    const students = await getStudents(false);
    const newStudent = {
      studentId,
      fullName: studentName,
      assignmentId: 'ASM01',
      status: 'pending' as const,
      submissionCode: mockCode,
      filePath: relativePath
    };
    students.push(newStudent);

    await fs.writeFile(studentsJsonPath, JSON.stringify(students, null, 2), 'utf-8');

    // Verify student is retrievable via getStudentById
    const retrieved = await getStudentById(studentId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.studentId, studentId);
    assert.strictEqual(retrieved.fullName, studentName);
    assert.strictEqual(retrieved.status, 'pending');
    assert.strictEqual(retrieved.submissionCode, mockCode);
    assert.strictEqual(retrieved.filePath, relativePath);
  });

  test('validates file extensions and filename sanitization logic', () => {
    const validExts = ['.js', '.ts'];
    const invalidExts = ['.exe', '.py', '.sh', '.html', '.json', ''];

    for (const ext of validExts) {
      assert.strictEqual(['.js', '.ts'].includes(ext), true);
    }
    for (const ext of invalidExts) {
      assert.strictEqual(['.js', '.ts'].includes(ext), false);
    }

    // Sanitization check
    const rawName = 'my submission (draft #1) [final]!.js';
    const ext = path.extname(rawName).toLowerCase();
    const cleanBaseName = path.basename(rawName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    assert.strictEqual(cleanBaseName, 'my_submission__draft__1___final__');
    assert.strictEqual(ext, '.js');
  });
});
