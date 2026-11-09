import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readFileTool } from '../src/tools/read-file.js';

describe('Read File Tool Suite', () => {
  test('reads an existing file inside workspace successfully', async () => {
    const result = await (readFileTool as any).execute({
      path: 'data/submissions/HV001_calculateCart.js'
    });
    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.fileName, 'HV001_calculateCart.js');
    assert.strictEqual(result.extension, '.js');
    assert.ok(result.content.includes('function calculateCart'));
    assert.ok(result.sizeBytes > 0);
    assert.ok(result.lineCount > 5);
  });

  test('reads file with absolute path inside workspace', async () => {
    const absPath = path.resolve(process.cwd(), 'data/submissions/HV001_calculateCart.js');
    const result = await (readFileTool as any).execute({ path: absPath });
    assert.strictEqual(result.isError, false);
    assert.strictEqual(result.fileName, 'HV001_calculateCart.js');
  });

  test('blocks path traversal attempting to escape workspace', async () => {
    const result = await (readFileTool as any).execute({
      path: '../../../../windows/system32/cmd.exe'
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('ngoài thư mục dự án') || result.message.includes('Từ chối'));
  });

  test('returns clear error when file does not exist', async () => {
    const result = await (readFileTool as any).execute({
      path: 'data/submissions/non_existent_file.js'
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('Không tìm thấy file'));
  });

  test('returns error when path points to a directory', async () => {
    const result = await (readFileTool as any).execute({
      path: 'data/submissions'
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('thư mục'));
  });

  test('returns error for empty or whitespace-only path', async () => {
    const result = await (readFileTool as any).execute({
      path: '   '
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('hợp lệ'));
  });

  test('blocks disallowed file extensions and sensitive .env files', async () => {
    // Disallowed extension (.py)
    const pyResult = await (readFileTool as any).execute({
      path: 'scripts/run.py'
    });
    assert.strictEqual(pyResult.isError, true);
    assert.ok(pyResult.message.includes('Từ chối truy cập') && pyResult.message.includes('.py'));

    // Disallowed extension (.exe)
    const exeResult = await (readFileTool as any).execute({
      path: 'malicious.exe'
    });
    assert.strictEqual(exeResult.isError, true);
    assert.ok(exeResult.message.includes('Từ chối truy cập') && exeResult.message.includes('.exe'));

    // Root .env file
    const envResult = await (readFileTool as any).execute({
      path: '.env'
    });
    assert.strictEqual(envResult.isError, true);
    assert.ok(envResult.message.includes('Từ chối truy cập'));

    // .env.local file
    const envLocalResult = await (readFileTool as any).execute({
      path: '.env.local'
    });
    assert.strictEqual(envLocalResult.isError, true);
    assert.ok(envLocalResult.message.includes('Từ chối truy cập'));
  });

  test('rejects files exceeding MAX_FILE_SIZE_BYTES (200 KB)', async () => {
    const tempLargeFilePath = path.resolve(process.cwd(), 'data/temp_oversized_test.txt');
    // 201 KB = 201 * 1024 bytes
    const largeBuffer = Buffer.alloc(201 * 1024, 'A');

    try {
      await fs.writeFile(tempLargeFilePath, largeBuffer);

      const result = await (readFileTool as any).execute({
        path: 'data/temp_oversized_test.txt'
      });

      assert.strictEqual(result.isError, true);
      assert.ok(result.message.includes('vượt quá giới hạn cho phép (200 KB)'));
    } finally {
      try {
        await fs.unlink(tempLargeFilePath);
      } catch {
        // ignore cleanup error
      }
    }
  });
});
