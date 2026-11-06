import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { GradingHarness, HarnessEvent } from './harness/loop.js';
import { loadRubric, getStudents, getStudentById, saveGradeRecord } from './data-store.js';
import { ToolApprovalRequest } from './types.js';
import { config } from './config.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Server-Sent Events clients
let sseClients: Response[] = [];

function broadcastSSE(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {
      // client disconnected
    }
  });
}

// Pending Human-in-the-loop approvals
const pendingApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
  request: ToolApprovalRequest;
}>();

// Initialize harness with web approval handler
function createWebHarness(): GradingHarness {
  const approvalHandler = (request: ToolApprovalRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const approvalId = 'appr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      pendingApprovals.set(approvalId, { resolve, request });

      // Notify connected Web UI via SSE
      broadcastSSE({
        type: 'approval_required',
        approvalId,
        request
      });
    });
  };

  return new GradingHarness(approvalHandler);
}

let harnessInstance = createWebHarness();

// 1. SSE Stream for Real-time Observability
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// 2. Status & Config
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    configured: Boolean(config.anthropicApiKey && config.anthropicApiKey.trim().length > 0),
    model: config.modelName,
    maxSteps: config.maxSteps,
    defaultAssignmentId: config.defaultAssignmentId
  });
});

app.post('/api/config', (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (apiKey && typeof apiKey === 'string') {
    config.anthropicApiKey = apiKey.trim();
    process.env.ANTHROPIC_API_KEY = apiKey.trim();
    res.json({ success: true, message: 'Đã cập nhật API Key thành công!' });
  } else {
    res.status(400).json({ success: false, message: 'API Key không hợp lệ.' });
  }
});

// 3. Data Store Endpoints
app.get('/api/data', async (req: Request, res: Response) => {
  try {
    const rubric = await loadRubric();
    const students = await getStudents(false);
    let grades = [];
    try {
      const gradesRaw = await fs.readFile(path.resolve(process.cwd(), 'data/grades.json'), 'utf-8');
      grades = JSON.parse(gradesRaw);
    } catch {
      grades = [];
    }
    res.json({ rubric, students, grades });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Reset Demo State
app.post('/api/reset', async (req: Request, res: Response) => {
  try {
    // Reset students to pending
    const students = await getStudents(false);
    students.forEach(s => s.status = 'pending');
    await fs.writeFile(path.resolve(process.cwd(), 'data/students.json'), JSON.stringify(students, null, 2), 'utf-8');

    // Reset grades to empty
    await fs.writeFile(path.resolve(process.cwd(), 'data/grades.json'), JSON.stringify([], null, 2), 'utf-8');

    // Create fresh harness
    harnessInstance = createWebHarness();
    pendingApprovals.clear();

    broadcastSSE({ type: 'data_updated' });
    res.json({ success: true, message: 'Đã thiết lập lại dữ liệu kiểm thử về trạng thái ban đầu!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Chat Endpoint with Observability & SSE
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ.' });
    return;
  }

  if (!config.anthropicApiKey) {
    res.status(400).json({
      error: 'Chưa cấu hình ANTHROPIC_API_KEY! Vui lòng nhập API Key trong phần Cấu hình.'
    });
    return;
  }

  try {
    broadcastSSE({ type: 'user_message', text: message });

    const turnResult = await harnessInstance.ask(message, (event: HarnessEvent) => {
      broadcastSSE(event);
    });

    // Notify data changes in case grades were written
    broadcastSSE({ type: 'data_updated' });

    res.json({
      success: true,
      text: turnResult.text,
      cost: turnResult.cost,
      stepsCount: turnResult.stepsCount
    });
  } catch (error: any) {
    broadcastSSE({ type: 'error', message: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Lỗi xử lý câu hỏi.'
    });
  }
});

// 6. Human-in-the-loop Approval Resolution
app.post('/api/approve', (req: Request, res: Response) => {
  const { approvalId, approved } = req.body;
  if (!approvalId || typeof approved !== 'boolean') {
    res.status(400).json({ error: 'Thiếu approvalId hoặc cờ approved.' });
    return;
  }

  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    res.status(404).json({ error: 'Yêu cầu phê duyệt không tồn tại hoặc đã hết hạn.' });
    return;
  }

  pending.resolve(approved);
  pendingApprovals.delete(approvalId);

  broadcastSSE({
    type: 'approval_resolved',
    approvalId,
    approved
  });

  res.json({
    success: true,
    message: approved ? 'Đã duyệt yêu cầu ghi điểm!' : 'Đã từ chối ghi điểm.'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Web Dashboard đang chạy tại: http://localhost:${PORT}`);
  console.log(`👉 Mở trình duyệt vào http://localhost:${PORT} để trải nghiệm và quay video demo!`);
});
