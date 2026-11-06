import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { GradingHarness, HarnessEvent } from './harness/loop.js';
import { loadRubric, getStudents, getStudentById, saveGradeRecord } from './data-store.js';
import { ToolApprovalRequest } from './types.js';
import { config, LLMProvider } from './config.js';
import { detectProviderFromKey } from './harness/provider.js';

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
app.get('/api/test-gemini', async (req: Request, res: Response) => {
  try {
    const key = config.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    res.json({ status: response.status, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req: Request, res: Response) => {
  const activeKey = config.provider === 'deepseek'
    ? config.deepseekApiKey
    : (config.provider === 'gemini' ? config.geminiApiKey : config.anthropicApiKey);
  const activeModel = config.provider === 'deepseek'
    ? config.deepseekModel
    : (config.provider === 'gemini' ? config.geminiModel : config.anthropicModel);
  res.json({
    configured: Boolean(activeKey && activeKey.trim().length > 0),
    provider: config.provider,
    model: activeModel,
    maxSteps: config.maxSteps,
    defaultAssignmentId: config.defaultAssignmentId
  });
});

app.post('/api/config', (req: Request, res: Response) => {
  const { apiKey, provider, model } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    res.status(400).json({ success: false, message: 'API Key không hợp lệ.' });
    return;
  }

  const detected = detectProviderFromKey(apiKey);
  const targetProvider = (provider || detected || config.provider) as LLMProvider;

  config.provider = targetProvider;
  if (targetProvider === 'deepseek') {
    config.deepseekApiKey = apiKey.trim();
    process.env.DEEPSEEK_API_KEY = apiKey.trim();
    if (model && typeof model === 'string') {
      config.deepseekModel = model.trim();
    }
  } else if (targetProvider === 'gemini') {
    config.geminiApiKey = apiKey.trim();
    process.env.GEMINI_API_KEY = apiKey.trim();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey.trim();
    if (model && typeof model === 'string') {
      config.geminiModel = model.trim();
    }
  } else {
    config.anthropicApiKey = apiKey.trim();
    process.env.ANTHROPIC_API_KEY = apiKey.trim();
    if (model && typeof model === 'string') {
      config.anthropicModel = model.trim();
    }
  }

  // Hot reload harness
  harnessInstance = createWebHarness();
  broadcastSSE({ type: 'data_updated' });

  // Persist to .env for server restarts
  fs.readFile(path.resolve(process.cwd(), '.env'), 'utf-8')
    .catch(() => '')
    .then((envContent) => {
      const lines = envContent.split(/\r?\n/).filter(Boolean);
      const envMap = new Map<string, string>();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            envMap.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
          }
        }
      }
      envMap.set('LLM_PROVIDER', targetProvider);
      if (targetProvider === 'deepseek') {
        envMap.set('DEEPSEEK_API_KEY', apiKey.trim());
        if (model && typeof model === 'string') envMap.set('DEEPSEEK_MODEL', model.trim());
        envMap.set('DEEPSEEK_BASE_URL', config.deepseekBaseUrl);
      } else if (targetProvider === 'gemini') {
        envMap.set('GEMINI_API_KEY', apiKey.trim());
        if (model && typeof model === 'string') envMap.set('GEMINI_MODEL', model.trim());
      } else {
        envMap.set('ANTHROPIC_API_KEY', apiKey.trim());
      }
      const newContent = Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
      return fs.writeFile(path.resolve(process.cwd(), '.env'), newContent, 'utf-8');
    })
    .catch(() => {});

  const activeModelName = targetProvider === 'deepseek'
    ? ('DeepSeek ' + config.deepseekModel)
    : (targetProvider === 'gemini' ? ('Google ' + config.geminiModel) : 'Claude 3.5 Haiku');

  res.json({
    success: true,
    provider: targetProvider,
    model: targetProvider === 'deepseek' ? config.deepseekModel : (targetProvider === 'gemini' ? config.geminiModel : config.anthropicModel),
    message: `Đã kết nối thành công với ${activeModelName}!`
  });
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

  const activeKey = config.provider === 'deepseek'
    ? config.deepseekApiKey
    : (config.provider === 'gemini' ? config.geminiApiKey : config.anthropicApiKey);
  if (!activeKey || !activeKey.trim()) {
    const keyName = config.provider === 'deepseek'
      ? 'DEEPSEEK_API_KEY'
      : (config.provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY');
    res.status(400).json({
      error: `Chưa cấu hình ${keyName}! Vui lòng nhập API Key trong phần Cấu hình.`
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

