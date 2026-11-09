import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_SIZE_BYTES = 200 * 1024; // 200 KB

export const readFileSchema = z.object({
  path: z.string().describe('Đường dẫn tương đối (từ gốc dự án) hoặc tuyệt đối tới file cần đọc (ví dụ: data/submissions/HV001_calculateCart.js)')
});

export const readFileTool = tool({
  description: 'Đọc nội dung file văn bản hoặc mã nguồn theo đường dẫn trong dự án để phân tích và kiểm tra.',
  inputSchema: readFileSchema,
  execute: async ({ path: inputPath }) => {
    try {
      if (!inputPath || typeof inputPath !== 'string' || !inputPath.trim()) {
        return {
          isError: true,
          message: 'Vui lòng cung cấp đường dẫn file hợp lệ.'
        };
      }

      const rootDir = process.cwd();
      const resolvedPath = path.isAbsolute(inputPath)
        ? path.normalize(inputPath)
        : path.resolve(rootDir, inputPath);

      // Security Check: Path traversal defense
      const relative = path.relative(rootDir, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return {
          isError: true,
          message: 'Từ chối truy cập: Đường dẫn nằm ngoài thư mục dự án cho phép.'
        };
      }

      // Stat check
      let stat;
      try {
        stat = await fs.stat(resolvedPath);
      } catch {
        return {
          isError: true,
          message: `Không tìm thấy file tại đường dẫn '${inputPath}'.`
        };
      }

      if (stat.isDirectory()) {
        return {
          isError: true,
          message: `Đường dẫn '${inputPath}' là một thư mục, không phải là file.`
        };
      }

      if (stat.size > MAX_FILE_SIZE_BYTES) {
        return {
          isError: true,
          message: `Dung lượng file (${(stat.size / 1024).toFixed(1)} KB) vượt quá giới hạn cho phép (200 KB).`
        };
      }

      const content = await fs.readFile(resolvedPath, 'utf-8');
      const lines = content.split(/\r?\n/).length;

      return {
        isError: false,
        path: path.relative(rootDir, resolvedPath).replace(/\\/g, '/'),
        fileName: path.basename(resolvedPath),
        extension: path.extname(resolvedPath),
        sizeBytes: stat.size,
        lineCount: lines,
        content
      };
    } catch (error: any) {
      return {
        isError: true,
        message: error.message || 'Lỗi khi đọc file.'
      };
    }
  }
});

(readFileTool as any).parameters = readFileSchema;
