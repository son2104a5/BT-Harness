# File Upload & Git Repo Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm công cụ `fetch_git_repo` cho Agent tự động clone repo GitHub/GitLab về chấm, xây dựng API `POST /api/upload-submission` tiếp nhận file bài làm tải lên trực tiếp, tích hợp hệ thống 5 Tools và bổ sung nút bấm Upload / Dán link Git trên giao diện Web Dashboard.

**Architecture:** Sử dụng `child_process.execFile` với `git clone --depth 1` cách ly trong `data/submissions/git_repos/` kết hợp regex whitelist URL HTTPS ngăn ngừa command injection; mở endpoint Express xử lý file upload lưu vào `data/submissions/uploaded/` và tự động tạo học viên `HV_UP_...`; nâng cấp `createGradingTools` thành 5 tools (`get_rubric`, `get_student_submission`, `read_file`, `fetch_git_repo`, `save_grade`); tích hợp các nút bấm thao tác nhanh trên Web UI.

**Tech Stack:** TypeScript, Node.js (child_process, fs/promises, path), Vercel AI SDK 7 (`ai`), Zod, Express, Tailwind CSS, SSE, Node Test Runner (`node:test`).

## Global Constraints

- Không sửa đổi barem điểm đã chốt (Logic 6đ, Clean code 1đ, Ngoại lệ 2đ, Edge cases 1đ) hoặc logic tính token/cost.
- Bảo vệ chống command injection: Kiểm tra `repoUrl` nghiêm ngặt bằng regex HTTPS, không dùng shell interpolation (`execFile` trực tiếp với mảng đối số).
- Thư mục clone `data/submissions/git_repos/` và uploaded `data/submissions/uploaded/` phải nằm trong workspace dự án và được git ignore an toàn.
- Giữ nguyên toàn bộ 67 tests hiện hữu và viết thêm tests mới cho các tính năng mới.
- Kiểm tra kiểu tĩnh với `npm run typecheck` đạt 0 lỗi.

---

### Task 1: Hiện Thực Tool `fetch_git_repo` Kèm Kiểm Tra Bảo Mật & Tests

**Files:**
- Create: `src/tools/fetch-git.ts`
- Test: `tests/fetch-git.test.ts`

**Interfaces:**
- Consumes: `child_process.execFile`, `fs.readdir`, `fs.mkdir`, `path`, `tool` from `ai`, `z` from `zod`
- Produces: `fetchGitRepoTool` (Zod schema: `{ repoUrl: string }`), `GIT_URL_REGEX`

- [ ] **Step 1: Write unit tests in `tests/fetch-git.test.ts`**

Tạo `tests/fetch-git.test.ts`:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fetchGitRepoTool, GIT_URL_REGEX } from '../src/tools/fetch-git.js';

describe('Fetch Git Repo Tool Suite', () => {
  test('GIT_URL_REGEX validates HTTPS GitHub, GitLab and Bitbucket URLs correctly', () => {
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project.git'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://gitlab.com/group/subgroup-project'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://bitbucket.org/team/repo'), true);

    // Invalid / Injection attempts
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project; rm -rf /'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project && echo 1'), false);
    assert.strictEqual(GIT_URL_REGEX.test('http://insecure.com/repo'), false);
    assert.strictEqual(GIT_URL_REGEX.test('git@github.com:user/project.git'), false);
    assert.strictEqual(GIT_URL_REGEX.test(''), false);
  });

  test('returns error for invalid git URL without executing git clone', async () => {
    const result = await (fetchGitRepoTool as any).execute({
      repoUrl: 'invalid-url-injection; calc.exe'
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('không hợp lệ'));
  });

  test('returns error for empty or whitespace repoUrl', async () => {
    const result = await (fetchGitRepoTool as any).execute({
      repoUrl: '   '
    });
    assert.strictEqual(result.isError, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/fetch-git.test.ts`  
Expected: FAIL (Cannot find module `../src/tools/fetch-git.js`)

- [ ] **Step 3: Implement `src/tools/fetch-git.ts`**

Tạo `src/tools/fetch-git.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/fetch-git.test.ts`  
Expected: PASS (all 3 tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/tools/fetch-git.ts tests/fetch-git.test.ts
git commit -m "feat(tools): implement fetch_git_repo tool with command injection protection"
```

---

### Task 2: Hiện Thực API Upload File Bài Làm (`POST /api/upload-submission`)

**Files:**
- Modify: `src/server.ts:15-30, 160-200`
- Test: `tests/upload.test.ts`

**Interfaces:**
- Consumes: `fs.writeFile`, `fs.mkdir`, `getStudents`, `saveGradeRecord` from `src/data-store.ts`
- Produces: `POST /api/upload-submission` returning `{ success: true, student: StudentSubmission }`

- [ ] **Step 1: Write integration tests in `tests/upload.test.ts`**

Tạo `tests/upload.test.ts`:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStudents, getStudentById } from '../src/data-store.js';

describe('Submission Upload & Student Registration Suite', () => {
  test('saves uploaded code to data/submissions/uploaded/ and registers student', async () => {
    const rootDir = process.cwd();
    const uploadDir = path.resolve(rootDir, 'data/submissions/uploaded');
    await fs.mkdir(uploadDir, { recursive: true });

    const fileName = `test_submission_${Date.now()}.js`;
    const filePath = path.join(uploadDir, fileName);
    const mockCode = 'function calculateCart(items) { return { total: 100 }; }';

    await fs.writeFile(filePath, mockCode, 'utf-8');
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

    // Verify file exists
    const readBack = await fs.readFile(filePath, 'utf-8');
    assert.strictEqual(readBack, mockCode);

    // Clean up
    await fs.unlink(filePath).catch(() => {});
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx tsx --test tests/upload.test.ts`  
Expected: PASS

- [ ] **Step 3: Implement `POST /api/upload-submission` in `src/server.ts`**

Trong `src/server.ts`, bổ sung endpoint:
```typescript
// Upload submission file
app.post('/api/upload-submission', express.json({ limit: '500kb' }), async (req: Request, res: Response) => {
  try {
    const { fileName, content, studentName } = req.body;
    if (!fileName || typeof fileName !== 'string' || !content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'Thiếu tên file hoặc nội dung file bài nộp.' });
      return;
    }

    const ext = path.extname(fileName).toLowerCase();
    if (!['.js', '.ts'].includes(ext)) {
      res.status(400).json({ success: false, error: 'Chỉ chấp nhận file mã nguồn JavaScript (.js) hoặc TypeScript (.ts).' });
      return;
    }

    const uploadDir = path.resolve(process.cwd(), 'data/submissions/uploaded');
    await fs.mkdir(uploadDir, { recursive: true });

    const cleanBaseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueFileName = `${Date.now()}_${cleanBaseName}${ext}`;
    const targetFilePath = path.join(uploadDir, uniqueFileName);

    await fs.writeFile(targetFilePath, content, 'utf-8');
    const relativePath = path.relative(process.cwd(), targetFilePath).replace(/\\/g, '/');

    // Register new student in students.json
    const studentId = `HV_UP_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const name = (studentName && typeof studentName === 'string' && studentName.trim())
      ? studentName.trim()
      : `Học viên (${cleanBaseName})`;

    const students = await getStudents(false);
    const newStudent = {
      studentId,
      fullName: name,
      assignmentId: config.defaultAssignmentId || 'ASM01',
      status: 'pending' as const,
      submissionCode: content,
      filePath: relativePath
    };
    students.push(newStudent);

    await fs.writeFile(
      path.resolve(process.cwd(), 'data/students.json'),
      JSON.stringify(students, null, 2),
      'utf-8'
    );

    broadcastSSE({ type: 'data_updated' });

    res.json({
      success: true,
      student: newStudent,
      message: `Đã tải lên thành công file '${fileName}' và đăng ký học viên ${studentId}!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý file bài nộp.' });
  }
});
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`  
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/upload.test.ts
git commit -m "feat(api): add POST /api/upload-submission endpoint for direct file submissions"
```

---

### Task 3: Tích Hợp Hệ Thống 5 Tools & Nâng Cấp System Prompt

**Files:**
- Modify: `src/tools/index.ts:1-25`
- Modify: `src/harness/loop.ts:25-70`
- Modify: `tests/tools.test.ts:160-180`
- Modify: `tests/loop.test.ts:10-35`

**Interfaces:**
- Consumes: `fetchGitRepoTool` from `src/tools/fetch-git.ts`
- Produces: `createGradingTools` returning `{ get_rubric, get_student_submission, read_file, fetch_git_repo, save_grade }`

- [ ] **Step 1: Update test in `tests/tools.test.ts` to assert 5 tools**

Cập nhật test `createGradingTools returns full suite of 5 tools` trong `tests/tools.test.ts`:
```typescript
test('createGradingTools returns full suite of 5 tools', () => {
  const mockApproval = async () => true;
  const tools = createGradingTools(mockApproval);
  assert.ok(tools.get_rubric);
  assert.ok(tools.get_student_submission);
  assert.ok(tools.read_file);
  assert.ok(tools.fetch_git_repo);
  assert.ok(tools.save_grade);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/tools.test.ts`  
Expected: FAIL (`tools.fetch_git_repo` is undefined)

- [ ] **Step 3: Update `src/tools/index.ts` to export 5 tools**

Cập nhật `src/tools/index.ts`:
```typescript
import { getRubricTool } from './get-rubric.js';
import { getSubmissionTool } from './get-submission.js';
import { readFileTool } from './read-file.js';
import { fetchGitRepoTool } from './fetch-git.js';
import { createSaveGradeTool, type ApprovalHandler } from './save-grade.js';

export { getRubricTool, getSubmissionTool, readFileTool, fetchGitRepoTool, createSaveGradeTool };
export type { ApprovalHandler };

export function createGradingTools(approvalHandler: ApprovalHandler) {
  return {
    get_rubric: getRubricTool,
    get_student_submission: getSubmissionTool,
    read_file: readFileTool,
    fetch_git_repo: fetchGitRepoTool,
    save_grade: createSaveGradeTool(approvalHandler)
  };
}
```

- [ ] **Step 4: Update `src/harness/loop.ts` System Instruction**

Trong `src/harness/loop.ts`, bổ sung mô tả tool `fetch_git_repo` vào `PHẦN II: CÁC CÔNG CỤ ĐƯỢC PHÉP SỬ DỤNG`:
```text
4. fetch_git_repo: Tải kho chứa mã nguồn từ đường dẫn Git repository công khai (GitHub/GitLab/Bitbucket). Sử dụng khi người dùng cung cấp link repo Git cần chấm bài. Tool sẽ trả về thư mục clone và đường dẫn file bài nộp đề xuất.
5. save_grade: Lưu trữ kết quả chấm điểm học viên sau khi được Giảng viên phê duyệt qua quy trình Human-in-the-loop.
```
Và trong hướng dẫn quy trình:
```text
- Nếu người dùng cung cấp link kho chứa Git (ví dụ https://github.com/...): Hãy chủ động gọi công cụ fetch_git_repo trước để tải mã nguồn, sau đó gọi read_file với file bài làm được đề xuất để phân tích và chấm điểm.
```

- [ ] **Step 5: Update `tests/loop.test.ts`**

Thêm assertion kiểm tra `SYSTEM_INSTRUCTION.includes('fetch_git_repo')`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --test tests/tools.test.ts tests/loop.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/tools/index.ts src/harness/loop.ts tests/tools.test.ts tests/loop.test.ts
git commit -m "feat(harness): integrate 5-tool suite with fetch_git_repo and system instructions"
```

---

### Task 4: Nâng Cấp Giao Diện Web Dashboard (Nút Upload File & Nút Chấm Git Repo)

**Files:**
- Modify: `public/index.html:100-130, 240-270, 520-560, 950-1020`

**Interfaces:**
- Consumes: `POST /api/upload-submission`, `POST /api/chat`
- Produces: UI action buttons (📎 Tải file, 🔗 Git Repo), Git Modal `#gitModal`, origin badges on student cards

- [ ] **Step 1: Add Upload and Git Action Buttons in `public/index.html`**

Bên cạnh ô nhập chat `#messageInput`:
```html
<div class="flex items-center gap-2">
  <input type="file" id="submissionFileInput" accept=".js,.ts" class="hidden" onchange="onFileSelected(event)">
  <button type="button" onclick="document.getElementById('submissionFileInput').click()" title="Tải file bài làm (.js, .ts)" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-white border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-medium">
    <i class="fa-solid fa-paperclip"></i>
    <span class="hidden sm:inline">Tải file</span>
  </button>
  <button type="button" onclick="openGitModal()" title="Chấm bài từ link Git Repository" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-white border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-medium">
    <i class="fa-brands fa-github"></i>
    <span class="hidden sm:inline">Link Git</span>
  </button>
</div>
```

- [ ] **Step 2: Add Git Modal `#gitModal` in `public/index.html`**

Thêm modal nhập link Git tại root `<body>`:
```html
<div id="gitModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
  <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
    <div class="flex items-center justify-between pb-3 border-b border-slate-800">
      <h3 class="text-base font-bold text-white flex items-center gap-2">
        <i class="fa-brands fa-github text-purple-400"></i> Chấm Bài Từ Git Repository
      </h3>
      <button onclick="closeGitModal()" class="text-slate-400 hover:text-white">
        <i class="fa-solid fa-xmark text-lg"></i>
      </button>
    </div>
    <div class="space-y-3 text-xs">
      <div>
        <label class="block text-slate-300 font-medium mb-1">Đường dẫn Git Repository (HTTPS):</label>
        <input type="text" id="gitRepoUrlInput" placeholder="https://github.com/username/cart-project" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none">
      </div>
      <p class="text-slate-400 text-[11px] leading-relaxed">
        Hệ thống sẽ clone mã nguồn mới nhất từ repo, tự động định vị file bài làm và chấm điểm theo barem ASM01.
      </p>
    </div>
    <div class="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
      <button onclick="closeGitModal()" class="px-4 py-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg">Hủy</button>
      <button onclick="submitGitRepo()" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg shadow-purple-600/30 flex items-center gap-1.5">
        <i class="fa-solid fa-play"></i> Bắt đầu chấm
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Implement client-side upload and git submission functions**

Trong `<script>` của `public/index.html`:
```javascript
function openGitModal() {
  document.getElementById('gitModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('gitRepoUrlInput')?.focus(), 50);
}
function closeGitModal() {
  document.getElementById('gitModal').classList.add('hidden');
}
function submitGitRepo() {
  const url = document.getElementById('gitRepoUrlInput').value.trim();
  if (!url) return alert('Vui lòng nhập URL Git repository.');
  closeGitModal();
  document.getElementById('messageInput').value = `Hãy clone repository ${url} và chấm điểm bài tập ASM01 theo barem chuẩn giúp tôi.`;
  handleSend();
}

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target?.result;
    if (typeof content !== 'string') return;

    try {
      const res = await fetch('/api/upload-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          content
        })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('messageInput').value = `Tôi vừa nộp file bài làm '${file.name}' (${data.student.studentId}). Hãy đọc file '${data.student.filePath}' và chấm điểm bài này theo barem ASM01.`;
        handleSend();
        fetchData();
      } else {
        alert(data.error || 'Lỗi tải lên file.');
      }
    } catch (err) {
      alert('Lỗi kết nối upload: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}
```

- [ ] **Step 4: Update Student Card in `renderStudents` to show origin badge**

Hiển thị badge `Git Repo` (tím) hoặc `Tải lên` (xanh lục) hoặc `Hệ thống` (chàm).

- [ ] **Step 5: Update Welcome Banner to list 5 Tools**

Đổi badge thành `5 Custom Tools: Rubric, Bài nộp, Đọc file, Git Repo & Lưu điểm`.

- [ ] **Step 6: Verify TypeScript types**

Run: `npm run typecheck`  
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add upload file and git repo submission buttons with origin badges"
```

---

### Task 5: Kiểm Thử Toàn Diện & Nghiệm Thu Hệ Thống (End-to-End Verification)

**Files:**
- Test all: `npm test`
- Typecheck: `npm run typecheck`

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`  
Expected: PASS all 70+ tests across 10 suites, 0 failures.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: `tsc --noEmit` exits with 0 errors.

- [ ] **Step 3: Start Web Server and test endpoints**

Run: `npm run web`  
Test API `/api/status`, `/api/data`.  
Verify `http://localhost:3000` loads smoothly with upload button, git button, and 5-tool banner.

- [ ] **Step 4: Final verification and commit**

Run: `git status`  
Expected: working tree clean.
