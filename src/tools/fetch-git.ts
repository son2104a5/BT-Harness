import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const GIT_URL_REGEX = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?(\/)?$/;

export const fetchGitSchema = z.object({
  repoUrl: z.string().describe('URL HTTPS của Git repository (ví dụ: https://github.com/student/asm01-cart)')
});

export const fetchGitRepoTool = tool({
  description: 'Tải mã nguồn từ kho chứa Git repository công khai về để phân tích và chấm điểm bài nộp.',
  inputSchema: fetchGitSchema,
  execute: async ({ repoUrl }) => {
    try {
      const trimmedUrl = (repoUrl || '').trim();
      if (!trimmedUrl || !GIT_URL_REGEX.test(trimmedUrl)) {
        return {
          isError: true,
          message: 'URL Git repository không hợp lệ. Chỉ chấp nhận URL HTTPS từ GitHub, GitLab hoặc Bitbucket.'
        };
      }

      const match = trimmedUrl.match(GIT_URL_REGEX);
      const repoName = match ? match[3].replace(/\.git$/, '') : 'repo';
      const rootDir = process.cwd();
      const baseGitDir = path.resolve(rootDir, 'data/submissions/git_repos');
      await fs.mkdir(baseGitDir, { recursive: true });

      const uniqueFolderName = `${Date.now()}_${repoName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const targetDir = path.join(baseGitDir, uniqueFolderName);

      // Execute shallow clone with 30s timeout
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', trimmedUrl, targetDir], {
          timeout: 30000,
          cwd: rootDir
        });
      } catch (err: any) {
        return {
          isError: true,
          message: `Không thể clone Git repository '${trimmedUrl}': ${err.message || 'Lỗi mạng hoặc repo riêng tư/không tồn tại.'}`
        };
      }

      // Recursively scan for candidate files
      const candidateFiles: string[] = [];
      async function scanDir(currentDir: string, relativePrefix: string = '') {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await scanDir(path.join(currentDir, entry.name), relPath);
          } else if (/\.(js|ts)$/i.test(entry.name)) {
            candidateFiles.push(relPath);
          }
        }
      }

      await scanDir(targetDir);

      // Determine recommended file
      let recommendedFile = candidateFiles.find(f => /calculateCart\.(js|ts)$/i.test(f));
      if (!recommendedFile) {
        recommendedFile = candidateFiles.find(f => /(cart|asm|index|main)\.(js|ts)$/i.test(f)) || candidateFiles[0] || '';
      }

      const relativeCloneDir = path.relative(rootDir, targetDir).replace(/\\/g, '/');
      const recommendedPath = recommendedFile ? `${relativeCloneDir}/${recommendedFile}` : '';

      return {
        isError: false,
        repoName,
        repoUrl: trimmedUrl,
        cloneDir: relativeCloneDir,
        candidateFiles,
        recommendedFile: recommendedPath,
        message: recommendedPath
          ? `Đã clone thành công repository '${repoName}'. Tìm thấy file bài làm đề xuất: '${recommendedPath}'. Hãy gọi tool 'read_file' với tham số path='${recommendedPath}' để đọc mã nguồn và bắt đầu chấm điểm.`
          : `Đã clone thành công repository '${repoName}' nhưng không tìm thấy file mã nguồn .js/.ts phù hợp.`
      };
    } catch (error: any) {
      return {
        isError: true,
        message: error.message || 'Lỗi khi tải Git repository.'
      };
    }
  }
});

(fetchGitRepoTool as any).parameters = fetchGitSchema;
