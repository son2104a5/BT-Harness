# Đặc Tả Thiết Kế: Tích Hợp Dual Provider (Google Gemini Flash & Claude 3.5 Haiku) Cho Agent Harness

**Ngày tạo**: 2026-11-06  
**Dự án**: BT Harness - Buổi 2 (AI SDK & Custom Agent Harness)  
**Trạng thái**: Chờ phê duyệt (Pending Review)

---

## 1. Mục Tiêu & Bối Cảnh (Context & Goals)

Nhằm tạo điều kiện thuận lợi nhất cho việc kiểm thử thực tế và quay video demo (đặc biệt khi người dùng chưa có thẻ thanh toán quốc tế để nạp API key của Anthropic Claude), dự án bổ sung kiến trúc **Dual Provider**:
1. Hỗ trợ mô hình **Google Gemini 1.5 Flash** (thông qua gói `@ai-sdk/google`) hoàn toàn miễn phí (Free Tier qua Google AI Studio) với tốc độ phản hồi cực nhanh.
2. Vẫn bảo lưu đầy đủ cấu hình **Anthropic Claude 3.5 Haiku** (qua gói `@ai-sdk/anthropic`).
3. Cơ chế **Tự động nhận diện thông minh (Smart Key Auto-Detection)**: Khi dán key trên Web UI hoặc cấu hình file `.env`, hệ thống tự phát hiện key `AIza...` là Gemini hay `sk-ant-...` là Claude để kích hoạt mô hình phù hợp.
4. Hot-reload runtime: Chuyển đổi nhà cung cấp trực tiếp trên Web UI không cần khởi động lại tiến trình Node.js.
5. Bảo toàn 100% các tính năng cốt lõi: 3 Custom Tools, Autonomous Loop, Giới hạn 5 bước (`MAX_STEPS`), Human-in-the-loop Approval Gate, và minh chứng Cache Hit từ câu thứ 2 trở đi.

---

## 2. Kiến Trúc Dual Provider (Architecture & Provider Factory)

### 2.1. Thư viện phụ thuộc
- `@ai-sdk/google`: Cung cấp provider chính thức của Google Gemini trong Vercel AI SDK.
- `@ai-sdk/anthropic`: Cung cấp provider của Anthropic Claude.

### 2.2. Cấu hình đa nhà cung cấp (`src/config.ts`)
```ts
export type LLMProvider = 'gemini' | 'anthropic';

export const config = {
  provider: (process.env.LLM_PROVIDER || 'gemini') as LLMProvider,
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiModel: 'gemini-1.5-flash',
  anthropicModel: 'claude-3-5-haiku-20241022',
  maxSteps: Number(process.env.MAX_STEPS) || 5,
  defaultAssignmentId: 'ASM01'
};
```

### 2.3. Provider Factory (`src/harness/provider.ts`)
Tạo hàm factory trả về language model instance tương thích với AI SDK:
```ts
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { config, LLMProvider } from '../config.js';

export function getLanguageModel(targetProvider?: LLMProvider) {
  const provider = targetProvider || config.provider;

  if (provider === 'gemini') {
    return google(config.geminiModel);
  }
  return anthropic(config.anthropicModel);
}
```

---

## 3. Quản Lý Token, Chi Phí & Chiến Lược Caching Cho Gemini

### 3.1. Bảng giá so sánh
| Hạng mục | Google Gemini 1.5 Flash | Anthropic Claude 3.5 Haiku |
| :--- | :--- | :--- |
| **Non-cache Input** | **$0.075** / 1M tokens | $0.80 / 1M tokens |
| **Cache Write** | **$0.075** / 1M tokens | $1.00 / 1M tokens |
| **Cache Read (HIT ⚡)** | **$0.01875** / 1M tokens *(giảm 75%)* | $0.08 / 1M tokens *(giảm 90%)* |
| **Output** | **$0.30** / 1M tokens | $4.00 / 1M tokens |

### 3.2. Bóc tách Token & Tính chi phí linh hoạt (`src/harness/cost.ts`)
Mở rộng hàm tính chi phí nhận diện provider đang hoạt động:
```ts
export function calculateCost(usage: any, provider: LLMProvider = 'gemini'): CostBreakdown
```
- Khi chạy Gemini: Sử dụng đơn giá Gemini 1.5 Flash. Bóc tách `cachedContentTokenCount` từ metadata của Google hoặc tính toán tỉ lệ cache hit dựa trên tiền tố lịch sử hội thoại lặp lại.
- Khi chạy Claude: Giữ nguyên logic tính giá Claude 3.5 Haiku.

---

## 4. Tích Hợp Giao Diện Web & Smart Auto-Detection

### 4.1. Quy tắc nhận diện tự động
- Chuỗi key bắt đầu bằng `AIza` $\rightarrow$ Tự động gán `provider = 'gemini'` và `geminiApiKey = key`.
- Chuỗi key bắt đầu bằng `sk-ant` $\rightarrow$ Tự động gán `provider = 'anthropic'` và `anthropicApiKey = key`.

### 4.2. Cập nhật Giao diện người dùng (`public/index.html`)
1. **Header Badge**:
   - Nếu chạy Gemini: Hiển thị `[⚡ Google Gemini 1.5 Flash]` với màu Google Blue/Emerald.
   - Nếu chạy Claude: Hiển thị `[Claude 3.5 Haiku]` với màu Indigo.
2. **Modal Cấu hình Key**:
   - Trường nhập liệu thông minh chấp nhận cả key Google hoặc Anthropic.
   - Hiển thị thông báo nhận diện tức thời (ví dụ: *"Đã nhận diện: Google Gemini API Key"*).
   - Có link hướng dẫn tạo key miễn phí tại Google AI Studio.
3. **Hot-reload API (`src/server.ts`)**:
   - Request `POST /api/config` cập nhật trực tiếp cấu hình và khởi tạo lại `harnessInstance` ngay lập tức, không làm gián đoạn các kết nối SSE đang mở.

---

## 5. Kế Hoạch Xác Minh (Verification Plan)

1. **Kiểm thử Unit Test**:
   - Chạy toàn bộ test suite (`npm test`), đảm bảo 40 test hiện có vẫn pass 100%.
   - Bổ sung unit test cho Provider Factory và bộ tính giá Gemini Flash.
2. **Kiểm thử Typecheck**:
   - `npm run typecheck` (`tsc --noEmit`) đạt 0 lỗi.
3. **Kiểm thử Tương tác Web**:
   - Dán key Gemini trên giao diện web, kiểm tra badge chuyển sang Gemini Flash.
   - Thực hiện câu hỏi chấm điểm, kiểm tra các lượt gọi tool, popup Human-in-the-loop duyệt điểm và huy hiệu Cache Hit.

