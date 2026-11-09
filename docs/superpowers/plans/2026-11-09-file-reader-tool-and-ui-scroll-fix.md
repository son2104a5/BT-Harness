# File Reader Tool, Submissions Path Support & UI Scroll Overflow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm công cụ `read_file` độc lập cho Agent đọc mã nguồn từ đường dẫn, bổ sung thuộc tính `filePath` và thư mục `data/submissions/` cho bài nộp học viên, đồng thời tái cấu trúc giao diện `#hitlModal` và `#chatContainer` để khắc phục triệt để lỗi tràn màn hình không cuộn được khi chấm bài.

**Architecture:** Bổ sung `readFileTool` vào bộ công cụ của Agent (`ai` SDK 7), áp dụng kiểm tra bảo mật ngăn chặn path traversal ra ngoài workspace và giới hạn kích thước file <= 200KB; nâng cấp `getSubmissionTool` để đọc file vật lý nếu có `filePath`; tái cấu trúc `#hitlModal` thành Fixed Modal Overlay với header/footer cố định và vùng content tự sinh thanh cuộn riêng biệt (`overflow-y-auto`, `max-h-[55vh]`).

**Tech Stack:** TypeScript, Node.js (fs/promises, path), Vercel AI SDK 7 (`ai`), Zod, Tailwind CSS, Express, SSE, Node Test Runner (`node:test`).

## Global Constraints

- Không sửa đổi logic tính giá token hoặc barem đã chốt (Logic 6đ, Clean code 1đ, Ngoại lệ 2đ, Edge cases 1đ).
- Toàn bộ đường dẫn đọc file phải được kiểm tra bảo mật chặt chẽ: `resolvedPath.startsWith(process.cwd())`.
- Giới hạn kích thước file đọc tối đa là 200KB (`204,800 bytes`).
- Giữ nguyên toàn bộ 56 tests hiện hữu và viết thêm tests mới cho các tính năng mới.
- Kiểm tra kiểu tĩnh với `npm run typecheck` đạt 0 lỗi.

---

### Task 1: Thiết Lập Thư Mục `data/submissions/`, Nâng Cấp `StudentSubmission` Type & Dữ Liệu Học Viên

**Files:**
- Create: `data/submissions/HV001_calculateCart.js`
- Create: `data/submissions/HV002_calculateCart.js`
- Create: `data/submissions/HV003_calculateCart.js`
- Modify: `src/types.ts:1-25`
- Modify: `data/students.json:1-40`
- Test: `tests/data-store.test.ts`

**Interfaces:**
- Consumes: `StudentSubmission` from `src/types.ts`
- Produces: `StudentSubmission.filePath?: string`, file vật lý tại `data/submissions/*.js`

- [ ] **Step 1: Write the failing test for `filePath` in `tests/data-store.test.ts`**

Thêm test vào cuối `tests/data-store.test.ts`:
```typescript
test('getStudentById returns student with filePath if present', async () => {
  const student = await getStudentById('HV001');
  assert.ok(student);
  assert.strictEqual(student.filePath, 'data/submissions/HV001_calculateCart.js');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/data-store.test.ts`  
Expected: FAIL (student.filePath is undefined)

- [ ] **Step 3: Update `src/types.ts` to add `filePath`**

Cập nhật `src/types.ts`:
```typescript
export interface StudentSubmission {
  studentId: string;
  fullName: string;
  assignmentId: string;
  status: 'pending' | 'graded';
  submissionCode: string;
  filePath?: string;
}
```

- [ ] **Step 4: Create submission files in `data/submissions/`**

Tạo `data/submissions/HV001_calculateCart.js`:
```javascript
function calculateCart(items, voucher) {
  if (!Array.isArray(items)) throw new Error('Items must be an array');
  let subtotal = 0;
  for (let item of items) {
    subtotal += item.price * item.quantity;
  }
  let discount = 0;
  if (voucher && voucher.code === 'SALE10') {
    discount = subtotal * 0.1;
  }
  const vat = (subtotal - discount) * 0.1;
  return {
    subtotal,
    discount,
    vat,
    total: subtotal - discount + vat
  };
}
```

Tạo `data/submissions/HV002_calculateCart.js`:
```javascript
function calculateCart(items, voucher) {
  if (!Array.isArray(items)) {
    throw new TypeError('Tham số items phải là một mảng');
  }

  const subtotal = items.reduce((acc, item) => {
    if (typeof item.price !== 'number' || item.price < 0) {
      throw new Error('Đơn giá không hợp lệ');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Số lượng không hợp lệ');
    }
    return acc + item.price * item.quantity;
  }, 0);

  let discount = 0;
  if (voucher && typeof voucher.code === 'string') {
    if (voucher.code === 'SALE10') {
      discount = subtotal * 0.1;
    } else if (voucher.code === 'VIP20') {
      discount = subtotal * 0.2;
    }
  }

  discount = Math.min(discount, subtotal);
  const vat = Math.round((subtotal - discount) * 0.1 * 100) / 100;
  const total = Math.round((subtotal - discount + vat) * 100) / 100;

  return {
    subtotal,
    discount,
    vat,
    total
  };
}
```

Tạo `data/submissions/HV003_calculateCart.js`:
```javascript
function calculateCart(items, voucher) {
  var subtotal = 0;
  for (var i = 0; i < items.length; i++) {
    subtotal += items[i].price * items[i].quantity;
  }
  var discount = 0;
  if (voucher.code == 'SALE10') {
    discount = 50000;
  }
  var vat = subtotal * 0.1;
  return {
    subtotal: subtotal,
    discount: discount,
    vat: vat,
    total: subtotal - discount + vat
  };
}
```

- [ ] **Step 5: Update `data/students.json` with `filePath` references**

Gán trường `filePath` cho cả 3 học viên trong `data/students.json`:
- HV001: `"filePath": "data/submissions/HV001_calculateCart.js"`
- HV002: `"filePath": "data/submissions/HV002_calculateCart.js"`
- HV003: `"filePath": "data/submissions/HV003_calculateCart.js"`

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --test tests/data-store.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/types.ts data/submissions/ data/students.json tests/data-store.test.ts
git commit -m "feat(store): add submissions directory and filePath property to StudentSubmission"
```

---

### Task 2: Hiện Thực Tool Độc Lập `read_file` Kèm Kiểm Tra Bảo Mật & Tests

**Files:**
- Create: `src/tools/read-file.ts`
- Test: `tests/read-file.test.ts`

**Interfaces:**
- Consumes: `fs.stat`, `fs.readFile` from `node:fs/promises`, `path` from `node:path`, `tool` from `ai`, `z` from `zod`
- Produces: `readFileTool` (Zod schema: `{ path: string }`)

- [ ] **Step 1: Write unit tests in `tests/read-file.test.ts`**

Tạo `tests/read-file.test.ts`:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/read-file.test.ts`  
Expected: FAIL (Cannot find module `../src/tools/read-file.js`)

- [ ] **Step 3: Implement `src/tools/read-file.ts`**

Tạo `src/tools/read-file.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/read-file.test.ts`  
Expected: PASS (all 5 tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/tools/read-file.ts tests/read-file.test.ts
git commit -m "feat(tools): implement read_file tool with path traversal protection"
```

---

### Task 3: Nâng Cấp `get_student_submission` & Tích Hợp Hệ Thống 4 Tools

**Files:**
- Modify: `src/tools/get-submission.ts:1-55`
- Modify: `src/tools/index.ts:1-20`
- Modify: `tests/tools.test.ts:150-180`

**Interfaces:**
- Consumes: `readFileTool` from `src/tools/read-file.ts`
- Produces: `createGradingTools` returning `{ get_rubric, get_student_submission, read_file, save_grade }`

- [ ] **Step 1: Write test for 4 tools in `tests/tools.test.ts`**

Cập nhật test `createGradingTools returns full tool suite` trong `tests/tools.test.ts`:
```typescript
test('createGradingTools returns full suite of 4 tools', () => {
  const mockApproval = async () => true;
  const tools = createGradingTools(mockApproval);
  assert.ok(tools.get_rubric);
  assert.ok(tools.get_student_submission);
  assert.ok(tools.read_file);
  assert.ok(tools.save_grade);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/tools.test.ts`  
Expected: FAIL (`tools.read_file` is undefined)

- [ ] **Step 3: Update `src/tools/get-submission.ts` to read physical file if needed**

Cập nhật `src/tools/get-submission.ts`:
```typescript
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
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

        // If submissionCode is empty but filePath exists, read from file
        let code = student.submissionCode;
        if ((!code || !code.trim()) && student.filePath) {
          try {
            code = await fs.readFile(path.resolve(process.cwd(), student.filePath), 'utf-8');
          } catch {
            // keep existing code if read fails
          }
        }

        return {
          isError: false,
          student: {
            ...student,
            submissionCode: code
          }
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
          status: s.status,
          filePath: s.filePath
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
```

- [ ] **Step 4: Update `src/tools/index.ts` to export 4 tools**

Cập nhật `src/tools/index.ts`:
```typescript
import { getRubricTool } from './get-rubric.js';
import { getSubmissionTool } from './get-submission.js';
import { readFileTool } from './read-file.js';
import { createSaveGradeTool, type ApprovalHandler } from './save-grade.js';

export { getRubricTool, getSubmissionTool, readFileTool, createSaveGradeTool };
export type { ApprovalHandler };

export function createGradingTools(approvalHandler: ApprovalHandler) {
  return {
    get_rubric: getRubricTool,
    get_student_submission: getSubmissionTool,
    read_file: readFileTool,
    save_grade: createSaveGradeTool(approvalHandler)
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test tests/tools.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/get-submission.ts src/tools/index.ts tests/tools.test.ts
git commit -m "feat(tools): export 4-tool suite with get_submission filePath support"
```

---

### Task 4: Nâng Cấp System Prompt & Harness Loop Hướng Dẫn `read_file`

**Files:**
- Modify: `src/harness/loop.ts:25-70`
- Test: `tests/loop.test.ts`

**Interfaces:**
- Consumes: 4 tools from `createGradingTools`
- Produces: Enhanced `SYSTEM_INSTRUCTION` instructing Agent when and how to call `read_file`

- [ ] **Step 1: Update `tests/loop.test.ts` to assert prompt describes `read_file`**

Thêm test vào `tests/loop.test.ts`:
```typescript
test('SYSTEM_INSTRUCTION describes read_file tool and filePath handling', () => {
  assert.ok(SYSTEM_INSTRUCTION.includes('read_file'));
  assert.ok(SYSTEM_INSTRUCTION.includes('filePath'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/loop.test.ts`  
Expected: FAIL (SYSTEM_INSTRUCTION does not include read_file)

- [ ] **Step 3: Update `SYSTEM_INSTRUCTION` in `src/harness/loop.ts`**

Trong `src/harness/loop.ts`, bổ sung mô tả tool `read_file` vào `PHẦN II: CÁC CÔNG CỤ ĐƯỢC PHÉP SỬ DỤNG`:
```text
3. read_file: Đọc nội dung file văn bản hoặc mã nguồn theo đường dẫn tương đối (hoặc tuyệt đối) trong dự án. Sử dụng khi bài nộp cung cấp filePath hoặc khi người dùng yêu cầu kiểm tra/chấm một file mã nguồn cụ thể trên đĩa.
4. save_grade: Lưu trữ kết quả chấm điểm học viên sau khi được Giảng viên phê duyệt qua quy trình Human-in-the-loop.
```
Và trong `Bước 1 & 3: Phân tích mã nguồn và đối chiếu barem`:
```text
- Nếu bài nộp của học viên có trường filePath (hoặc người dùng yêu cầu chấm theo đường dẫn file), hãy chủ động gọi công cụ read_file với tham số path để lấy toàn bộ nội dung mã nguồn mới nhất từ đĩa trước khi chấm điểm.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/loop.test.ts`  
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`  
Expected: PASS (all tests pass across all test suites)

- [ ] **Step 6: Commit**

```bash
git add src/harness/loop.ts tests/loop.test.ts
git commit -m "feat(loop): enhance system instruction for read_file tool and filePath workflow"
```

---

### Task 5: Sửa Lỗi Tràn Màn Hình `#hitlModal` & Cập Nhật Giao Diện Web

**Files:**
- Modify: `public/index.html:100-155, 520-560, 775-815`

**Interfaces:**
- Consumes: SSE `approval_required` event with `request.feedback`
- Produces: Fixed Scrollable Modal `#hitlModal` with sticky header, scrollable `#hitlContent` (`max-h-[55vh]`), and sticky footer buttons

- [ ] **Step 1: Restructure `#hitlModal` in `public/index.html`**

Đổi định vị của `#hitlModal` từ `absolute inset-x-4 bottom-24` thành Fixed Modal Overlay bao quanh toàn màn hình:
```html
      <!-- Human-in-the-loop Approval Modal Overlay (Fixed, Centered, Scrollable) -->
      <div id="hitlModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div class="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
          <!-- Sticky Header -->
          <div class="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
            <div class="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
              <span class="flex h-3 w-3 relative">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <span>⚠️ YÊU CẦU PHÊ DUYỆT TỪ GIẢNG VIÊN (HUMAN-IN-THE-LOOP)</span>
            </div>
            <span class="text-xs px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium">Tool: save_grade</span>
          </div>

          <!-- Scrollable Body with custom scrollbar -->
          <div id="hitlContent" class="flex-1 overflow-y-auto pr-2 my-4 space-y-3 text-sm">
            <!-- Injected via JS -->
          </div>

          <!-- Sticky Footer Actions -->
          <div class="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
            <span class="text-[11px] text-slate-400 italic">Cuộn lên/xuống để đọc trọn vẹn nhận xét chi tiết</span>
            <div class="flex items-center gap-3">
              <button onclick="submitApproval(false)" class="px-4 py-2 text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all flex items-center gap-1.5">
                <i class="fa-solid fa-xmark"></i> Từ chối phê duyệt
              </button>
              <button onclick="submitApproval(true)" class="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-1.5">
                <i class="fa-solid fa-check"></i> Chấp thuận & Lưu điểm chính thức
              </button>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Update `showHITLApproval` function in `public/index.html`**

Cập nhật `showHITLApproval` để render phần nhận xét có định dạng `pre-wrap` hoặc `markdown`, nền tách biệt:
```javascript
    function showHITLApproval(approvalId, req) {
      currentPendingApprovalId = approvalId;
      const modal = document.getElementById('hitlModal');
      const content = document.getElementById('hitlContent');

      const scoresHtml = Object.entries(req.scores || {})
        .map(([k, v]) => `
          <div class="flex justify-between items-center bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
            <span class="text-slate-300 font-medium">${escapeHtml(k)}</span>
            <span class="font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">${v}đ</span>
          </div>
        `)
        .join('');

      content.innerHTML = `
        <div class="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div>
            <span class="text-xs text-slate-400">Học viên:</span>
            <div class="text-white font-bold text-base">${escapeHtml(req.studentName || req.studentId)} <span class="font-mono text-slate-400 text-xs">(${escapeHtml(req.studentId)})</span></div>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-400">Tổng điểm đề xuất:</span>
            <div class="text-xl font-bold text-emerald-400 font-mono">
              ${req.totalScore}/10
            </div>
          </div>
        </div>

        <div>
          <span class="text-xs font-semibold text-slate-300 block mb-1.5">Chi tiết điểm từng tiêu chí:</span>
          <div class="grid grid-cols-2 gap-2 text-xs">
            ${scoresHtml}
          </div>
        </div>

        <div>
          <span class="text-xs font-semibold text-slate-300 block mb-1.5">Nhận xét chi tiết của AI:</span>
          <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs whitespace-pre-wrap leading-relaxed max-h-[35vh] overflow-y-auto">
${escapeHtml(req.feedback)}
          </div>
        </div>
      `;

      modal.classList.remove('hidden');
    }
```

- [ ] **Step 3: Update Student Card in `public/index.html` to show `filePath` badge**

Cập nhật `renderStudents` trong `public/index.html` để hiển thị nhãn file `filePath` và cho phép mở file:
```javascript
${s.filePath ? `<span class="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20"><i class="fa-regular fa-file-code mr-1"></i>${escapeHtml(s.filePath)}</span>` : ''}
```

- [ ] **Step 4: Update Welcome Banner to list 4 Tools**

Trong thẻ `#chatContainer` của `public/index.html`, cập nhật badge:
```html
<div class="bg-slate-800/70 p-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
  <i class="fa-solid fa-wrench text-amber-400"></i>
  <span><strong>4 Custom Tools:</strong> Rubric, Bài nộp, Đọc file & Lưu điểm</span>
</div>
```

- [ ] **Step 5: Verify in browser / compile check**

Run: `npm run typecheck`  
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "fix(ui): convert HITL modal to scrollable fixed overlay and show submission filePath"
```

---

### Task 6: Kiểm Thử Toàn Diện & Nghiệm Thu Hệ Thống (End-to-End Verification)

**Files:**
- Test all: `npm test`
- Typecheck: `npm run typecheck`

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`  
Expected: PASS all 60+ tests, 0 failures.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: `tsc --noEmit` exits with 0 errors.

- [ ] **Step 3: Start Web Server and test API endpoints**

Run: `npm run web`  
Test API `/api/data`:
Verify `students` contains `filePath: "data/submissions/HV001_calculateCart.js"`.
Verify `GET http://localhost:3000` loads properly with updated 4-tool badge.

- [ ] **Step 4: Final verification and commit**

Run: `git status`  
Expected: working tree clean.
