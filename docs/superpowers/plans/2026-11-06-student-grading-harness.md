# Student Grading Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, observable TypeScript agent harness for grading student assignments using Vercel AI SDK and Claude 3.5 Haiku, featuring multi-turn autonomous tool execution, ephemeral prompt caching, MAX_STEPS bounds, human-in-the-loop approval, and strict error resilience.

**Architecture:** A modular TypeScript CLI harness built on Vercel AI SDK with Anthropic provider. Custom tools interact with JSON data stores for rubrics, student submissions, and approved grades. A human-in-the-loop terminal gate controls grade mutations, an ephemeral prompt cache accelerates multi-turn queries, and custom observability hooks track step-by-step progress and Claude 3.5 Haiku token costs.

**Tech Stack:** TypeScript, Node.js 24, Vercel AI SDK (`ai`), `@ai-sdk/anthropic`, `zod`, `dotenv`, `chalk`, `tsx`, Node.js native test runner (`node:test`).

## Global Constraints

- **Language & Runtime:** TypeScript executed via `tsx` under Node.js 24.
- **Provider & Model:** `@ai-sdk/anthropic` with model `claude-3-5-haiku-20241022`.
- **Max Steps Limit:** Exactly 5 steps (`MAX_STEPS = 5`). On step index 4 (`MAX_STEPS - 1`), all tools must be disabled (`activeTools: []`) and the system prompt must force final synthesis.
- **Cache Strategy:** Ephemeral prompt cache enabled via `providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } }` for system prompt and rubric context; must demonstrate Cache Hit in turn 2+.
- **Approval Gate:** Human-in-the-loop terminal prompt `[y/N]` required before `save_grade` writes to disk.
- **Resilience:** All tools wrapped in `try/catch` and timeout (10s); must return `{ isError: true, message: string }` instead of throwing unhandled exceptions.

---

### Task 1: Project Setup & Environment Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Consumes: None
- Produces: Project dependencies, TypeScript configuration, environment configuration template

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
data/grades.json
*.log
```

- [ ] **Step 2: Create `package.json` with scripts and dependencies**

```json
{
  "name": "student-grading-harness",
  "version": "1.0.0",
  "description": "Agent harness for grading student assignments with AI SDK and Anthropic",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "demo": "tsx src/index.ts --demo",
    "test": "tsx --test tests/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^1.1.9",
    "ai": "^4.1.45",
    "chalk": "^5.4.1",
    "dotenv": "^16.4.7",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.1",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create `.env.example`**

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
MAX_STEPS=5
DEFAULT_ASSIGNMENT_ID=ASM01
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules` generated, exit code 0.

- [ ] **Step 6: Commit project setup**

```bash
git add package.json tsconfig.json .gitignore .env.example
git commit -m "chore: scaffold project structure and dependencies"
```

---

### Task 2: Data Models, Mock Data & Data Store Module

**Files:**
- Create: `data/rubric.json`
- Create: `data/students.json`
- Create: `data/grades.json`
- Create: `src/types.ts`
- Create: `src/data-store.ts`
- Test: `tests/data-store.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `Rubric`, `StudentSubmission`, `GradeRecord` types
  - `loadRubric(assignmentId?: string): Promise<Rubric>`
  - `getStudents(pendingOnly?: boolean): Promise<StudentSubmission[]>`
  - `getStudentById(studentId: string): Promise<StudentSubmission | null>`
  - `saveGradeRecord(record: GradeRecord): Promise<void>`

- [ ] **Step 1: Create initial data files in `data/`**

Create `data/rubric.json`:
```json
{
  "assignmentId": "ASM01",
  "assignmentTitle": "Xây dựng hàm xử lý giỏ hàng thương mại điện tử (calculateCart)",
  "totalMaxScore": 10,
  "criteria": [
    {
      "id": "logic",
      "name": "Tính đúng đắn thuật toán",
      "maxScore": 4.0,
      "description": "Tính toán đúng tổng tiền hàng, áp mã giảm giá hợp lệ, tính đúng thuế VAT 10%."
    },
    {
      "id": "clean_code",
      "name": "Cấu trúc & Clean Code",
      "maxScore": 3.0,
      "description": "Đặt tên biến/hàm rõ nghĩa, cấu trúc module gọn gàng, không lặp code, có comment giải thích."
    },
    {
      "id": "error_handling",
      "name": "Xử lý ngoại lệ",
      "maxScore": 2.0,
      "description": "Kiểm tra đầu vào không hợp lệ (mảng rỗng, giá trị âm, sản phẩm thiếu trường)."
    },
    {
      "id": "edge_cases",
      "name": "Edge cases & Test",
      "maxScore": 1.0,
      "description": "Xử lý mã giảm giá vượt quá tổng tiền, số lượng lớn, làm tròn số tiền."
    }
  ]
}
```

Create `data/students.json`:
```json
[
  {
    "studentId": "HV001",
    "fullName": "Nguyễn Văn An",
    "assignmentId": "ASM01",
    "status": "pending",
    "submissionCode": "function calculateCart(items, voucher) {\n  if (!Array.isArray(items)) throw new Error('Items must be an array');\n  let subtotal = 0;\n  for (let item of items) {\n    subtotal += item.price * item.quantity;\n  }\n  let discount = 0;\n  if (voucher && voucher.code === 'SALE10') {\n    discount = subtotal * 0.1;\n  }\n  const vat = (subtotal - discount) * 0.1;\n  return {\n    subtotal,\n    discount,\n    vat,\n    total: subtotal - discount + vat\n  };\n}"
  },
  {
    "studentId": "HV002",
    "fullName": "Trần Thị Bình",
    "assignmentId": "ASM01",
    "status": "pending",
    "submissionCode": "function calculateCart(items, voucher) {\n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    total += items[i].price;\n  }\n  return { total };\n}"
  },
  {
    "studentId": "HV003",
    "fullName": "Lê Hoàng Cường",
    "assignmentId": "ASM01",
    "status": "pending",
    "submissionCode": "function calculateCart(items, voucher) {\n  if (!Array.isArray(items) || items.length === 0) return { subtotal: 0, discount: 0, vat: 0, total: 0 };\n  let subtotal = 0;\n  for (const item of items) {\n    if (item.price < 0 || item.quantity < 0) throw new Error('Invalid item values');\n    subtotal += item.price * item.quantity;\n  }\n  let discount = 0;\n  if (voucher && voucher.code === 'VIP20') {\n    discount = Math.min(subtotal, subtotal * 0.2);\n  }\n  const vat = Math.max(0, subtotal - discount) * 0.1;\n  return {\n    subtotal: Math.round(subtotal),\n    discount: Math.round(discount),\n    vat: Math.round(vat),\n    total: Math.round(subtotal - discount + vat)\n  };\n}"
  }
]
```

Create `data/grades.json`:
```json
[]
```

- [ ] **Step 2: Create `src/types.ts`**

```ts
import { z } from 'zod';

export interface RubricCriterion {
  id: string;
  name: string;
  maxScore: number;
  description: string;
}

export interface Rubric {
  assignmentId: string;
  assignmentTitle: string;
  totalMaxScore: number;
  criteria: RubricCriterion[];
}

export interface StudentSubmission {
  studentId: string;
  fullName: string;
  assignmentId: string;
  status: 'pending' | 'graded';
  submissionCode: string;
}

export interface GradeRecord {
  studentId: string;
  assignmentId: string;
  scores: Record<string, number>;
  totalScore: number;
  feedback: string;
  gradedAt: string;
  approvedBy: string;
}

export interface ToolApprovalRequest {
  toolName: string;
  studentId: string;
  studentName?: string;
  scores: Record<string, number>;
  totalScore: number;
  feedback: string;
}

export interface CostBreakdown {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  costVND: number;
  cacheSavingsUSD: number;
  cacheHitRatio: number;
}
```

- [ ] **Step 3: Write the failing test for `data-store.ts`**

Create `tests/data-store.test.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Cannot find module `../src/data-store.js`)

- [ ] **Step 5: Implement `src/data-store.ts`**

Create `src/data-store.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Rubric, StudentSubmission, GradeRecord } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const RUBRIC_PATH = path.join(DATA_DIR, 'rubric.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'students.json');
const GRADES_PATH = path.join(DATA_DIR, 'grades.json');

export async function loadRubric(assignmentId?: string): Promise<Rubric> {
  const content = await fs.readFile(RUBRIC_PATH, 'utf-8');
  const rubric: Rubric = JSON.parse(content);
  if (assignmentId && rubric.assignmentId !== assignmentId) {
    throw new Error(`Không tìm thấy rubric cho bài tập '${assignmentId}'.`);
  }
  return rubric;
}

export async function getStudents(pendingOnly: boolean = false): Promise<StudentSubmission[]> {
  const content = await fs.readFile(STUDENTS_PATH, 'utf-8');
  const students: StudentSubmission[] = JSON.parse(content);
  if (pendingOnly) {
    return students.filter(s => s.status === 'pending');
  }
  return students;
}

export async function getStudentById(studentId: string): Promise<StudentSubmission | null> {
  const students = await getStudents(false);
  const found = students.find(s => s.studentId.toUpperCase() === studentId.trim().toUpperCase());
  return found || null;
}

export async function saveGradeRecord(record: GradeRecord): Promise<void> {
  // 1. Read and append to grades.json
  let grades: GradeRecord[] = [];
  try {
    const content = await fs.readFile(GRADES_PATH, 'utf-8');
    grades = JSON.parse(content);
  } catch {
    grades = [];
  }

  // Remove existing grade for this student if re-grading
  grades = grades.filter(g => g.studentId !== record.studentId || g.assignmentId !== record.assignmentId);
  grades.push(record);
  await fs.writeFile(GRADES_PATH, JSON.stringify(grades, null, 2), 'utf-8');

  // 2. Update student status in students.json
  const students = await getStudents(false);
  const student = students.find(s => s.studentId.toUpperCase() === record.studentId.toUpperCase());
  if (student) {
    student.status = 'graded';
    await fs.writeFile(STUDENTS_PATH, JSON.stringify(students, null, 2), 'utf-8');
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS with 5 passing tests.

- [ ] **Step 7: Commit data store module**

```bash
git add data/ src/types.ts src/data-store.ts tests/data-store.test.ts
git commit -m "feat: add data models, mock data, and JSON data store module"
```

---

### Task 3: Custom Tools Implementation (`get_rubric`, `get_student_submission`, `save_grade`)

**Files:**
- Create: `src/tools/get-rubric.ts`
- Create: `src/tools/get-submission.ts`
- Create: `src/tools/save-grade.ts`
- Create: `src/tools/index.ts`
- Test: `tests/tools.test.ts`

**Interfaces:**
- Consumes: `loadRubric`, `getStudents`, `getStudentById`, `saveGradeRecord` from `src/data-store.ts`
- Produces:
  - `getRubricTool`: tool definition for reading rubric
  - `getSubmissionTool`: tool definition for finding student submissions
  - `createSaveGradeTool(approvalHandler)`: tool factory for grade creation with HITL gate
  - `createGradingTools(approvalHandler)`: bundled tools record for AI SDK

- [ ] **Step 1: Write failing tests for tools**

Create `tests/tools.test.ts`:
```ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getRubricTool, getSubmissionTool, createSaveGradeTool } from '../src/tools/index.js';

describe('Custom Tools Suite', () => {
  test('getRubricTool executes successfully', async () => {
    const result = await (getRubricTool as any).execute({ assignmentId: 'ASM01' });
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

  test('saveGradeTool rejects when approval returns false', async () => {
    const mockApproval = async () => false;
    const saveGradeTool = createSaveGradeTool(mockApproval);

    const result = await (saveGradeTool as any).execute({
      studentId: 'HV002',
      scores: { logic: 2, clean_code: 2, error_handling: 0, edge_cases: 0 },
      totalScore: 4.0,
      feedback: 'Chưa đạt yêu cầu'
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('từ chối'));
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Cannot find module `../src/tools/index.js`)

- [ ] **Step 3: Implement `src/tools/get-rubric.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { loadRubric } from '../data-store.js';

export const getRubricTool = tool({
  description: 'Tra cứu tiêu chí và barem chấm điểm chính thức của bài tập.',
  parameters: z.object({
    assignmentId: z.string().optional().describe('Mã bài tập cần tra cứu (mặc định ASM01)')
  }),
  execute: async ({ assignmentId }) => {
    try {
      const rubric = await loadRubric(assignmentId || 'ASM01');
      return {
        isError: false,
        rubric
      };
    } catch (error: any) {
      return {
        isError: true,
        message: error.message || 'Lỗi khi tải barem chấm điểm.'
      };
    }
  }
});
```

- [ ] **Step 4: Implement `src/tools/get-submission.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { getStudents, getStudentById } from '../data-store.js';

export const getSubmissionTool = tool({
  description: 'Lấy bài làm/mã nguồn của học viên hoặc liệt kê danh sách học viên cần chấm.',
  parameters: z.object({
    studentId: z.string().optional().describe('Mã học viên cần lấy bài nộp (ví dụ: HV001)'),
    listPendingOnly: z.boolean().optional().describe('Nếu true, trả về danh sách các học viên chưa chấm')
  }),
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
        return {
          isError: false,
          student
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
          status: s.status
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
```

- [ ] **Step 5: Implement `src/tools/save-grade.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { saveGradeRecord, getStudentById } from '../data-store.js';
import { ToolApprovalRequest } from '../types.js';

export type ApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>;

export function createSaveGradeTool(approvalHandler: ApprovalHandler) {
  return tool({
    description: 'Lưu điểm và nhận xét chính thức cho học viên. Thao tác này yêu cầu Giảng viên phê duyệt trước khi ghi.',
    parameters: z.object({
      studentId: z.string().describe('Mã học viên (ví dụ: HV001)'),
      assignmentId: z.string().default('ASM01').describe('Mã bài tập'),
      scores: z.record(z.string(), z.number()).describe('Điểm chi tiết từng tiêu chí theo rubric'),
      totalScore: z.number().describe('Tổng điểm trên thang 10'),
      feedback: z.string().describe('Nhận xét chi tiết ưu điểm và nhược điểm của bài nộp')
    }),
    execute: async ({ studentId, assignmentId, scores, totalScore, feedback }) => {
      try {
        const student = await getStudentById(studentId);
        const studentName = student ? student.fullName : studentId;

        // Trigger Human-in-the-loop approval
        const approved = await approvalHandler({
          toolName: 'save_grade',
          studentId,
          studentName,
          scores,
          totalScore,
          feedback
        });

        if (!approved) {
          return {
            success: false,
            message: `Giảng viên đã TỪ CHỐI phê duyệt lưu điểm cho học viên ${studentName} (${studentId}). Vui lòng hỏi giảng viên cần điều chỉnh điểm hoặc tiêu chí nào.`
          };
        }

        // Persist grade if approved
        await saveGradeRecord({
          studentId,
          assignmentId,
          scores,
          totalScore,
          feedback,
          gradedAt: new Date().toISOString(),
          approvedBy: 'Giảng viên (Approved via CLI)'
        });

        return {
          success: true,
          message: `Điểm số của học viên ${studentName} (${studentId}) đã được Giảng viên phê duyệt và lưu thành công vào cơ sở dữ liệu.`
        };
      } catch (error: any) {
        return {
          success: false,
          isError: true,
          message: `Lỗi khi lưu điểm: ${error.message}`
        };
      }
    }
  });
}
```

- [ ] **Step 6: Implement `src/tools/index.ts`**

```ts
import { getRubricTool } from './get-rubric.js';
import { getSubmissionTool } from './get-submission.js';
import { createSaveGradeTool, ApprovalHandler } from './save-grade.js';

export { getRubricTool, getSubmissionTool, createSaveGradeTool, ApprovalHandler };

export function createGradingTools(approvalHandler: ApprovalHandler) {
  return {
    get_rubric: getRubricTool,
    get_student_submission: getSubmissionTool,
    save_grade: createSaveGradeTool(approvalHandler)
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS with all tests passing.

- [ ] **Step 8: Commit tools suite**

```bash
git add src/tools/ tests/tools.test.ts
git commit -m "feat: implement custom tools with validation and HITL gate"
```

---

### Task 4: Approval Module & Cost Calculator

**Files:**
- Create: `src/harness/approval.ts`
- Create: `src/harness/cost.ts`
- Test: `tests/cost.test.ts`

**Interfaces:**
- Consumes: `ToolApprovalRequest`, `CostBreakdown` from `src/types.ts`
- Produces:
  - `promptInstructorApproval(request: ToolApprovalRequest): Promise<boolean>`
  - `calculateClaudeCost(usage: any): CostBreakdown`

- [ ] **Step 1: Write failing test for cost calculator**

Create `tests/cost.test.ts`:
```ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateClaudeCost } from '../src/harness/cost.js';

describe('Cost Calculator Suite', () => {
  test('calculates correct cost without cache hits', () => {
    const usage = {
      promptTokens: 1000,
      completionTokens: 200
    };
    const breakdown = calculateClaudeCost(usage);
    // non-cache input: 1000 * $0.80 / 1M = $0.0008
    // output: 200 * $4.00 / 1M = $0.0008
    // total = $0.0016
    assert.strictEqual(breakdown.costUSD, 0.0016);
    assert.strictEqual(breakdown.cacheReadTokens, 0);
  });

  test('calculates correct cost with Anthropic ephemeral cache hits', () => {
    const usage = {
      promptTokens: 2300,
      completionTokens: 100,
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 2000
        }
      }
    };
    const breakdown = calculateClaudeCost(usage);
    assert.strictEqual(breakdown.cacheReadTokens, 2000);
    assert.strictEqual(breakdown.inputTokens, 300);
    // input non-cache: 300 * $0.80 / 1M = $0.00024
    // cache read: 2000 * $0.08 / 1M = $0.00016
    // output: 100 * $4.00 / 1M = $0.0004
    // total = 0.0008
    assert.strictEqual(breakdown.costUSD, 0.0008);
    assert.ok(breakdown.cacheSavingsUSD > 0);
    assert.ok(breakdown.cacheHitRatio > 0.8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Cannot find module `../src/harness/cost.js`)

- [ ] **Step 3: Implement `src/harness/cost.ts`**

```ts
import { CostBreakdown } from '../types.js';

// Claude 3.5 Haiku Pricing (per 1,000,000 tokens)
const PRICE_BASE_INPUT = 0.80;
const PRICE_CACHE_WRITE = 1.00;
const PRICE_CACHE_READ = 0.08;
const PRICE_OUTPUT = 4.00;
const USD_TO_VND_RATE = 25500;

export function calculateClaudeCost(usage: any): CostBreakdown {
  const promptTokens = usage?.promptTokens || usage?.inputTokens || 0;
  const completionTokens = usage?.completionTokens || usage?.outputTokens || 0;

  const anthropicMeta = usage?.providerMetadata?.anthropic || {};
  const cacheWriteTokens = anthropicMeta.cacheCreationInputTokens || 0;
  const cacheReadTokens = anthropicMeta.cacheReadInputTokens || 0;

  // Non-cached input tokens = total prompt tokens minus cache write and cache read
  const nonCacheInputTokens = Math.max(0, promptTokens - cacheWriteTokens - cacheReadTokens);

  const costBaseInput = (nonCacheInputTokens * PRICE_BASE_INPUT) / 1_000_000;
  const costCacheWrite = (cacheWriteTokens * PRICE_CACHE_WRITE) / 1_000_000;
  const costCacheRead = (cacheReadTokens * PRICE_CACHE_READ) / 1_000_000;
  const costOutput = (completionTokens * PRICE_OUTPUT) / 1_000_000;

  const costUSD = Number((costBaseInput + costCacheWrite + costCacheRead + costOutput).toFixed(6));
  const costVND = Math.round(costUSD * USD_TO_VND_RATE);

  // Calculate savings vs paying full non-cache price for cached read tokens
  const normalCacheCost = (cacheReadTokens * PRICE_BASE_INPUT) / 1_000_000;
  const cacheSavingsUSD = Number(Math.max(0, normalCacheCost - costCacheRead).toFixed(6));

  const totalInputTokens = nonCacheInputTokens + cacheWriteTokens + cacheReadTokens;
  const cacheHitRatio = totalInputTokens > 0 ? Number((cacheReadTokens / totalInputTokens).toFixed(4)) : 0;

  return {
    inputTokens: nonCacheInputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    outputTokens: completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUSD,
    costVND,
    cacheSavingsUSD,
    cacheHitRatio
  };
}
```

- [ ] **Step 4: Implement `src/harness/approval.ts`**

```ts
import readline from 'node:readline';
import chalk from 'chalk';
import { ToolApprovalRequest } from '../types.js';

export async function promptInstructorApproval(request: ToolApprovalRequest): Promise<boolean> {
  const scoresDisplay = Object.entries(request.scores)
    .map(([criterion, score]) => `   • ${criterion}: ${score}`)
    .join('\n');

  console.log('\n' + chalk.yellow.bold('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
  console.log(chalk.yellow.bold('┃ ⚠️  YÊU CẦU PHÊ DUYỆT TỪ GIẢNG VIÊN (HUMAN-IN-THE-LOOP)           ┃'));
  console.log(chalk.yellow.bold('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫'));
  console.log(chalk.white(`┃ Học viên: `) + chalk.cyan.bold(`${request.studentName} (${request.studentId})`));
  console.log(chalk.white(`┃ Chi tiết điểm số:`));
  console.log(chalk.gray(scoresDisplay));
  console.log(chalk.white(`┃ 🎯 Tổng điểm: `) + chalk.green.bold(`${request.totalScore}/10`));
  console.log(chalk.white(`┃ 📝 Nhận xét: `) + chalk.italic(request.feedback));
  console.log(chalk.yellow.bold('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));

  // If running in automated non-interactive demo mode, auto-approve
  if (process.env.AUTOMATED_MODE === 'true') {
    console.log(chalk.cyan('🤖 [AUTOMATED MODE] Tự động phê duyệt [Y]'));
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<boolean>((resolve) => {
    rl.question(chalk.yellow.bold('👉 Thầy/Cô có đồng ý lưu điểm số này vào hệ thống? [y/N]: '), (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      const approved = trimmed === 'y' || trimmed === 'yes';
      if (approved) {
        console.log(chalk.green('✅ Giảng viên đã CHẤP THUẬN. Tiến hành lưu kết quả...'));
      } else {
        console.log(chalk.red('❌ Giảng viên đã TỪ CHỐI lưu điểm.'));
      }
      resolve(approved);
    });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS with 7 passing tests.

- [ ] **Step 6: Commit approval & cost module**

```bash
git add src/harness/approval.ts src/harness/cost.ts tests/cost.test.ts
git commit -m "feat: implement cost calculator and CLI approval prompt"
```

---

### Task 5: Observability & Logger Module

**Files:**
- Create: `src/harness/logger.ts`
- Test: `tests/logger.test.ts`

**Interfaces:**
- Consumes: `CostBreakdown` from `src/types.ts`
- Produces:
  - `logStepStart(step: number, maxSteps: number): void`
  - `logToolCall(toolName: string, args: any, durationMs?: number): void`
  - `logToolResult(toolName: string, result: any): void`
  - `logCostSummary(cost: CostBreakdown, questionIndex: number): void`

- [ ] **Step 1: Write test for logger**

Create `tests/logger.test.ts`:
```ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatToolPayload, formatCostSummary } from '../src/harness/logger.js';

describe('Logger Formatting Suite', () => {
  test('formatToolPayload truncates long strings properly', () => {
    const payload = { code: 'a'.repeat(200) };
    const formatted = formatToolPayload(payload);
    assert.ok(formatted.length < 150);
    assert.ok(formatted.includes('...'));
  });

  test('formatCostSummary formats table string with hit ratio', () => {
    const summary = formatCostSummary({
      inputTokens: 300,
      cacheWriteTokens: 0,
      cacheReadTokens: 2000,
      outputTokens: 150,
      totalTokens: 2450,
      costUSD: 0.001,
      costVND: 26,
      cacheSavingsUSD: 0.0014,
      cacheHitRatio: 0.8696
    }, 2);

    assert.ok(summary.includes('BÁO CÁO TÀI NGUYÊN & CHI PHÍ'));
    assert.ok(summary.includes('HIT'));
    assert.ok(summary.includes('87.0%') || summary.includes('86.96%') || summary.includes('87%'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Cannot find module `../src/harness/logger.js`)

- [ ] **Step 3: Implement `src/harness/logger.ts`**

```ts
import chalk from 'chalk';
import { CostBreakdown } from '../types.js';

export function formatToolPayload(payload: any, maxLength: number = 100): string {
  try {
    const str = JSON.stringify(payload);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + '... (truncated)';
    }
    return str;
  } catch {
    return String(payload);
  }
}

export function logStepStart(step: number, maxSteps: number): void {
  console.log(chalk.blue(`\n┌── [LƯỢT ${step + 1}/${maxSteps}] `) + chalk.gray('─'.repeat(45)));
}

export function logToolCall(toolName: string, args: any): void {
  console.log(chalk.blue(`│ 🔧 AI gọi tool: `) + chalk.cyan.bold(toolName));
  console.log(chalk.blue(`│ 📥 Tham số (Args): `) + chalk.white(formatToolPayload(args)));
}

export function logToolResult(toolName: string, result: any, durationMs?: number): void {
  const timeInfo = durationMs !== undefined ? chalk.gray(` (thời gian: ${durationMs}ms)`) : '';
  if (result?.isError || result?.success === false) {
    console.log(chalk.red(`│ ⚠️  Kết quả lỗi: `) + chalk.redBright(formatToolPayload(result)) + timeInfo);
  } else {
    console.log(chalk.green(`│ 📤 Kết quả: `) + chalk.white(formatToolPayload(result)) + timeInfo);
  }
  console.log(chalk.blue(`└${'─'.repeat(55)}`));
}

export function formatCostSummary(cost: CostBreakdown, questionIndex: number): string {
  const lines: string[] = [];
  const hitRatioPercent = (cost.cacheHitRatio * 100).toFixed(1);
  const cacheStatus = cost.cacheReadTokens > 0
    ? chalk.green.bold(`HIT ⚡ (${cost.cacheReadTokens.toLocaleString()} tokens - ${hitRatioPercent}%)`)
    : cost.cacheWriteTokens > 0
      ? chalk.yellow(`WRITE 📦 (${cost.cacheWriteTokens.toLocaleString()} tokens)`)
      : chalk.gray('MISS ─ (0 tokens)');

  lines.push(chalk.cyan.bold(`┌──────────────── BÁO CÁO TÀI NGUYÊN & CHI PHÍ (CÂU ${questionIndex}) ────────────────┐`));
  lines.push(`│ • Input Tokens (Non-cache):  ${cost.inputTokens.toLocaleString().padStart(8)} tokens   ($${(cost.inputTokens * 0.8 / 1e6).toFixed(6)})  │`);
  lines.push(`│ • Cache Write Tokens:        ${cost.cacheWriteTokens.toLocaleString().padStart(8)} tokens   ($${(cost.cacheWriteTokens * 1.0 / 1e6).toFixed(6)})  │`);
  lines.push(`│ • Cache Read Tokens (HIT):   ${cost.cacheReadTokens.toLocaleString().padStart(8)} tokens   ($${(cost.cacheReadTokens * 0.08 / 1e6).toFixed(6)})  │`);
  lines.push(`│ • Output Tokens:             ${cost.outputTokens.toLocaleString().padStart(8)} tokens   ($${(cost.outputTokens * 4.0 / 1e6).toFixed(6)})  │`);
  lines.push(chalk.cyan(`├────────────────────────────────────────────────────────────────────────┤`));
  lines.push(`│ • Trạng thái Cache:          ${cacheStatus.padEnd(46)} │`);
  lines.push(`│ • Tiết kiệm nhờ Cache:       ` + chalk.green(`$${cost.cacheSavingsUSD.toFixed(6)}`.padEnd(41)) + ` │`);
  lines.push(`│ 💰 TỔNG CHI PHÍ:             ` + chalk.yellow.bold(`$${cost.costUSD.toFixed(6)} (~ ${cost.costVND} VNĐ)`.padEnd(41)) + ` │`);
  lines.push(chalk.cyan.bold(`└────────────────────────────────────────────────────────────────────────┘`));

  return lines.join('\n');
}

export function logCostSummary(cost: CostBreakdown, questionIndex: number): void {
  console.log('\n' + formatCostSummary(cost, questionIndex));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS with 9 passing tests.

- [ ] **Step 5: Commit logger module**

```bash
git add src/harness/logger.ts tests/logger.test.ts
git commit -m "feat: implement step-by-step observability and cost formatting"
```

---

### Task 6: Agent Loop Harness with Bounds & Ephemeral Caching

**Files:**
- Create: `src/config.ts`
- Create: `src/harness/loop.ts`
- Test: `tests/harness-loop.test.ts`

**Interfaces:**
- Consumes: `createGradingTools`, `calculateClaudeCost`, `logStepStart`, `logToolCall`, `logToolResult`, `logCostSummary`
- Produces:
  - `SYSTEM_INSTRUCTION`: cached system prompt
  - `GradingHarness`: class or runner managing multi-turn agent turns, `MAX_STEPS` enforcement, and conversation history

- [ ] **Step 1: Create `src/config.ts`**

```ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  modelName: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: process.env.DEFAULT_ASSIGNMENT_ID || 'ASM01'
};
```

- [ ] **Step 2: Write tests for Agent Loop Harness components**

Create `tests/harness-loop.test.ts`:
```ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SYSTEM_INSTRUCTION, shouldDisableToolsOnLastStep } from '../src/harness/loop.js';

describe('Agent Loop Logic Suite', () => {
  test('SYSTEM_INSTRUCTION defines grading role clearly', () => {
    assert.ok(SYSTEM_INSTRUCTION.includes('trợ lý chấm điểm'));
    assert.ok(SYSTEM_INSTRUCTION.includes('rubric'));
    assert.ok(SYSTEM_INSTRUCTION.includes('save_grade'));
  });

  test('shouldDisableToolsOnLastStep triggers on step 4 when maxSteps is 5', () => {
    assert.strictEqual(shouldDisableToolsOnLastStep(0, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(3, 5), false);
    assert.strictEqual(shouldDisableToolsOnLastStep(4, 5), true);
    assert.strictEqual(shouldDisableToolsOnLastStep(5, 5), true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Cannot find module `../src/harness/loop.js`)

- [ ] **Step 4: Implement `src/harness/loop.ts`**

```ts
import { generateText, CoreMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { config } from '../config.js';
import { createGradingTools } from '../tools/index.js';
import { ApprovalHandler } from '../tools/save-grade.js';
import { calculateClaudeCost } from './cost.js';
import { logStepStart, logToolCall, logToolResult, logCostSummary } from './logger.js';
import { CostBreakdown } from '../types.js';

export const SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI Chấm điểm danh sách học viên chuyên nghiệp và công tâm.
Nhiệm vụ của bạn:
1. Hỗ trợ Giảng viên tra cứu barem chấm điểm (get_rubric) và danh sách bài nộp của học viên (get_student_submission).
2. Khi được yêu cầu chấm điểm cho một học viên:
   - Bước 1: Lấy bài làm học viên bằng get_student_submission.
   - Bước 2: Lấy barem chấm điểm bằng get_rubric.
   - Bước 3: Đọc kỹ code, đối chiếu từng tiêu chí trong barem, tính toán điểm số và viết nhận xét chi tiết.
   - Bước 4: Gọi tool save_grade để gửi đề xuất điểm cho Giảng viên phê duyệt.
3. LUÔN nhớ rằng Giảng viên có quyền cao nhất. Khi Giảng viên từ chối duyệt, hãy lắng nghe ý kiến phản hồi và điều chỉnh theo yêu cầu của Giảng viên.
4. Trả lời bằng tiếng Việt rõ ràng, lịch sự và chuyên nghiệp.`;

export function shouldDisableToolsOnLastStep(currentStep: number, maxSteps: number): boolean {
  return currentStep >= maxSteps - 1;
}

export interface TurnResult {
  text: string;
  messages: CoreMessage[];
  cost: CostBreakdown;
  stepsCount: number;
}

export class GradingHarness {
  private messages: CoreMessage[] = [];
  private questionCount = 0;
  private approvalHandler: ApprovalHandler;

  constructor(approvalHandler: ApprovalHandler) {
    this.approvalHandler = approvalHandler;
  }

  public getHistory(): CoreMessage[] {
    return this.messages;
  }

  public async ask(userQuery: string): Promise<TurnResult> {
    this.questionCount++;
    const tools = createGradingTools(this.approvalHandler);
    const maxSteps = config.maxSteps;

    // Append user message
    this.messages.push({
      role: 'user',
      content: userQuery
    });

    let currentStep = 0;
    let accumulatedCost: CostBreakdown = {
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      costVND: 0,
      cacheSavingsUSD: 0,
      cacheHitRatio: 0
    };

    // Prepare system message with Anthropic Ephemeral Prompt Cache
    const systemMessage: CoreMessage = {
      role: 'system',
      content: SYSTEM_INSTRUCTION,
      providerMetadata: {
        anthropic: {
          cacheControl: { type: 'ephemeral' }
        }
      }
    };

    // Execute generateText with step loop hooks
    const result = await generateText({
      model: anthropic(config.modelName),
      system: SYSTEM_INSTRUCTION,
      messages: [systemMessage, ...this.messages],
      tools,
      maxSteps,
      prepareStep: async ({ step }) => {
        currentStep = step;
        logStepStart(step, maxSteps);

        // Limit enforcement on the final step
        if (shouldDisableToolsOnLastStep(step, maxSteps)) {
          console.log(chalk.red.bold(`⚠️  [GIỚI HẠN BƯỚC] Đã đến bước cuối (${step + 1}/${maxSteps}). Vô hiệu hóa toàn bộ tool.`));
          return {
            activeTools: [],
            messages: [
              {
                role: 'system',
                content: 'CẢNH BÁO: Đây là bước cuối cùng được phép. Bạn KHÔNG THỂ gọi thêm bất kỳ công cụ nào. Hãy tổng hợp câu trả lời đầy đủ cho người dùng bằng toàn bộ dữ liệu bạn đã thu thập được từ các bước trước.'
              }
            ]
          };
        }
        return {};
      },
      onStepFinish: async (stepEvent) => {
        // Log tool calls and results
        if (stepEvent.toolCalls && stepEvent.toolCalls.length > 0) {
          for (const tc of stepEvent.toolCalls) {
            logToolCall(tc.toolName, tc.args);
          }
        }
        if (stepEvent.toolResults && stepEvent.toolResults.length > 0) {
          for (const tr of stepEvent.toolResults) {
            logToolResult(tr.toolName, tr.result);
          }
        }

        // Accumulate step usage
        if (stepEvent.usage) {
          const stepCost = calculateClaudeCost(stepEvent.usage);
          accumulatedCost.inputTokens += stepCost.inputTokens;
          accumulatedCost.cacheWriteTokens += stepCost.cacheWriteTokens;
          accumulatedCost.cacheReadTokens += stepCost.cacheReadTokens;
          accumulatedCost.outputTokens += stepCost.outputTokens;
          accumulatedCost.totalTokens += stepCost.totalTokens;
          accumulatedCost.costUSD += stepCost.costUSD;
          accumulatedCost.costVND += stepCost.costVND;
          accumulatedCost.cacheSavingsUSD += stepCost.cacheSavingsUSD;
        }
      }
    });

    // Update conversation messages from response
    if (result.response && result.response.messages) {
      this.messages.push(...result.response.messages);
    } else {
      this.messages.push({
        role: 'assistant',
        content: result.text
      });
    }

    // Recalculate total cost ratio
    const totalInput = accumulatedCost.inputTokens + accumulatedCost.cacheWriteTokens + accumulatedCost.cacheReadTokens;
    accumulatedCost.cacheHitRatio = totalInput > 0
      ? Number((accumulatedCost.cacheReadTokens / totalInput).toFixed(4))
      : 0;

    // Log final observability summary
    logCostSummary(accumulatedCost, this.questionCount);

    return {
      text: result.text,
      messages: this.messages,
      cost: accumulatedCost,
      stepsCount: currentStep + 1
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS with 11 passing tests.

- [ ] **Step 6: Commit agent loop harness**

```bash
git add src/config.ts src/harness/loop.ts tests/harness-loop.test.ts
git commit -m "feat: implement agent loop harness with bounds and ephemeral caching"
```

---

### Task 7: Interactive CLI REPL & Automated Demo Mode

**Files:**
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `GradingHarness`, `promptInstructorApproval`
- Produces:
  - Interactive terminal CLI for real-time grading conversations
  - Automated demo runner (`npm run demo` / `node dist/index.js --demo`) demonstrating all mandatory criteria

- [ ] **Step 1: Implement `src/index.ts`**

```ts
import readline from 'node:readline';
import chalk from 'chalk';
import { GradingHarness } from './harness/loop.js';
import { promptInstructorApproval } from './harness/approval.js';
import { config } from './config.js';

function printWelcomeBanner() {
  console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║         🤖 TRỢ LÝ CHẤT LƯỢNG CAO: CHẤM ĐIỂM HỌC VIÊN             ║'));
  console.log(chalk.cyan.bold('║              (Vercel AI SDK 7 + Anthropic Claude 3.5)              ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`• Model: ${config.modelName} | Max Steps: ${config.maxSteps}`));
  console.log(chalk.gray(`• Ephemeral Prompt Caching: Kích hoạt (Kiểm chứng từ câu hỏi 2)`));
  console.log(chalk.gray(`• Human-in-the-loop: Bắt buộc duyệt khi ghi nhận điểm`));
  console.log(chalk.gray(`• Gõ 'exit' hoặc 'quit' để thoát chương trình.\n`));
}

async function runDemoMode() {
  console.log(chalk.yellow.bold('\n🚀 KHỞI ĐỘNG KỊCH BẢN TỰ ĐỘNG KIỂM THỬ TẤT CẢ YÊU CẦU (--demo)...\n'));
  process.env.AUTOMATED_MODE = 'true';

  const harness = new GradingHarness(promptInstructorApproval);

  // Câu hỏi 1: Lấy danh sách học viên và barem
  console.log(chalk.magenta.bold('\n[TEST 1] Người dùng hỏi: "Hãy kiểm tra danh sách học viên cần chấm điểm và tiêu chí barem bài ASM01"'));
  const res1 = await harness.ask('Hãy kiểm tra danh sách học viên cần chấm điểm và tiêu chí barem bài ASM01');
  console.log(chalk.green.bold('\n💬 Phản hồi AI:'));
  console.log(res1.text);

  // Câu hỏi 2: Chấm bài HV001 (Kiểm tra kế thừa ngữ cảnh + Cache Hit + Human-in-the-loop)
  console.log(chalk.magenta.bold('\n[TEST 2] Người dùng hỏi: "Chấm điểm bài làm của bạn An mã HV001 và gửi đề xuất lưu điểm"'));
  const res2 = await harness.ask('Chấm điểm bài làm của bạn An mã HV001 và gửi đề xuất lưu điểm');
  console.log(chalk.green.bold('\n💬 Phản hồi AI:'));
  console.log(res2.text);

  // Câu hỏi 3: Hỏi học viên tiếp theo (Kiểm tra Cache Hit sâu từ câu 3)
  console.log(chalk.magenta.bold('\n[TEST 3] Người dùng hỏi: "Còn những bạn nào chưa có điểm?"'));
  const res3 = await harness.ask('Còn những bạn nào chưa có điểm?');
  console.log(chalk.green.bold('\n💬 Phản hồi AI:'));
  console.log(res3.text);

  // Câu hỏi 4: Thử nghiệm mã không tồn tại để kiểm tra độ bền vững (Error Handling)
  console.log(chalk.magenta.bold('\n[TEST 4] Người dùng hỏi: "Chấm điểm cho bạn HV999" (Kiểm tra xử lý lỗi học viên không tồn tại)'));
  const res4 = await harness.ask('Chấm điểm cho bạn HV999');
  console.log(chalk.green.bold('\n💬 Phản hồi AI:'));
  console.log(res4.text);

  console.log(chalk.green.bold('\n🎉 HOÀN THÀNH TOÀN BỘ KỊCH BẢN DEMO KIỂM THỬ!\n'));
}

async function runInteractiveREPL() {
  printWelcomeBanner();

  if (!config.anthropicApiKey) {
    console.log(chalk.red.bold('⚠️  CẢNH BÁO: Chưa tìm thấy ANTHROPIC_API_KEY trong file .env!'));
    console.log(chalk.yellow('Vui lòng thêm ANTHROPIC_API_KEY vào .env để gọi được mô hình Claude 3.5 Haiku.'));
  }

  const harness = new GradingHarness(promptInstructorApproval);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question(chalk.green.bold('\n👨‍🏫 Giảng viên > '), async (input) => {
      const query = input.trim();
      if (!query) {
        promptUser();
        return;
      }
      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log(chalk.cyan('Tạm biệt thầy/cô!'));
        rl.close();
        process.exit(0);
      }

      try {
        console.log(chalk.gray('⏳ Đang xử lý câu hỏi...'));
        const response = await harness.ask(query);
        console.log(chalk.green.bold('\n💬 Trợ lý AI:'));
        console.log(response.text);
      } catch (error: any) {
        console.error(chalk.red.bold(`❌ Đã xảy ra lỗi trong quá trình xử lý: ${error.message}`));
      }

      promptUser();
    });
  };

  promptUser();
}

async function main() {
  const isDemo = process.argv.includes('--demo');
  if (isDemo) {
    await runDemoMode();
  } else {
    await runInteractiveREPL();
  }
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit CLI entrypoint**

```bash
git add src/index.ts
git commit -m "feat: implement interactive REPL and automated demo mode"
```

---

### Task 8: Verification & End-to-End Validation

**Files:**
- Test: All tests in `tests/`
- Runtime verification: `npm run demo` and `npm run test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All unit tests pass with zero failures.

- [ ] **Step 2: Verify type safety**

Run: `npm run typecheck`
Expected: TypeScript check passes cleanly.

- [ ] **Step 3: Test with simulated API mock / Live check**

Run: `npm run demo`
Verify:
1. Multi-step loop activates and logs tools.
2. Step limits prevent endless loops.
3. Cache Hit is reported with percentage and savings.
4. Tool errors for HV999 are caught safely and summarized.

- [ ] **Step 4: Commit final verification notes**

```bash
git commit --allow-empty -m "chore: verify test suite and demo execution"
```
