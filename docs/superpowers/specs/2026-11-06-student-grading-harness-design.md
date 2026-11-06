# Thiết Kế Chi Tiết: Student Grading Agent Harness (Trợ Lý Chấm Điểm Danh Sách Học Viên)

**Ngày tạo**: 2026-11-06  
**Dự án**: BT Harness - Buổi 2 (AI SDK & Custom Agent Harness)  
**Trạng thái**: Chờ phê duyệt (Pending Review)

---

## 1. Mục Tiêu Dự Án (Project Goal & Scope)

Xây dựng một **Agent Harness** hoàn chỉnh trong TypeScript cho bài toán **"Trợ lý chatbot chấm điểm danh sách học viên"**, dựa trên nền tảng kiến thức và repo mẫu Buổi 2 (Vercel AI SDK 7 + Anthropic Claude 3.5 Haiku).

Hệ thống cho phép giảng viên/trợ giảng:
1. Tra cứu barem tiêu chí chấm điểm và danh sách bài nộp của học viên.
2. Tự động chấm điểm mã nguồn học viên dựa trên rubric và phân tích đa bước.
3. Phê duyệt (Human-in-the-loop) trước khi ghi điểm chính thức vào hệ thống.
4. Tương tác đa lượt (ghi nhớ lịch sử), tiết kiệm chi phí qua Prompt Caching (Cache Hit từ câu hỏi 2).
5. Theo dõi trực quan nhật ký thực thi (Observability), chi tiết token và chi phí USD từng lượt.
6. Chống sập hệ thống (Error resilience), xử lý an toàn khi gặp lỗi tool, timeout hoặc chạm ngưỡng bước tối đa.

---

## 2. Tiêu Chí Đáp Ứng Yêu Cầu Đề Bài (Mandatory Requirements Mapping)

| Yêu cầu bắt buộc | Giải pháp thiết kế trong Harness |
| :--- | :--- |
| **Tool (ít nhất 2 tool)** | Triển khai 3 tools: `get_rubric`, `get_student_submission`, `save_grade`. |
| **Agent loop** | Multi-turn autonomous tool execution loop bằng Vercel AI SDK (`ToolLoopAgent` / loop step). |
| **Giới hạn số lượt** | Cấu hình `MAX_STEPS = 5`. Tại lượt cuối (`step === MAX_STEPS - 1`), `prepareStep` vô hiệu hóa toàn bộ tool (`activeTools: []`), ép model trả lời bằng dữ liệu đã có. |
| **Lịch sử hội thoại** | Mảng `messages` tích lũy duy trì ngữ cảnh toàn bộ phiên chat, câu hỏi sau kế thừa câu hỏi trước. |
| **Prompt Cache** | Kích hoạt `providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } }` cho system prompt và rubric; log minh chứng Cache Hit từ câu hỏi 2 trở đi. |
| **Observability** | Bắt hook `onStepStart`, `onStepEnd`, `onToolExecutionEnd`: log bước chạy, tên tool, arguments, kết quả, tokens và chi phí USD. |
| **Xử lý lỗi** | Bọc `try-catch` và timeout ở tất cả tools; khi lỗi hoặc quá số lượt, harness trả về payload an toàn, không dừng chương trình đột ngột. |
| **Tính năng nâng cao (Tối thiểu 1)** | **Human-in-the-loop Tool Approval (`toolApproval`)**: Bắt buộc giảng viên bấm `[y/N]` trên terminal trước khi ghi điểm vào file `grades.json`. |

---

## 3. Kiến Trúc & Cấu Trúc Thư Mục (Architecture & Project Layout)

```text
BT Harness/
├── data/
│   ├── rubric.json            # Barem tiêu chí chấm điểm bài tập
│   ├── students.json          # Danh sách học viên và mã nguồn bài nộp
│   └── grades.json            # Cơ sở dữ liệu lưu điểm và nhận xét đã duyệt
├── src/
│   ├── config.ts              # Cấu hình môi trường, MAX_STEPS, bảng giá token
│   ├── types.ts               # Định nghĩa TypeScript interfaces & Zod schemas
│   ├── data-store.ts          # Module truy xuất và cập nhật file dữ liệu JSON
│   ├── tools/
│   │   ├── get-rubric.ts      # Tool tra cứu barem
│   │   ├── get-submission.ts  # Tool tra cứu bài nộp học viên
│   │   └── save-grade.ts      # Tool ghi điểm (HITL gated)
│   ├── harness/
│   │   ├── loop.ts            # Agent loop chính: prepareStep, stopWhen, cacheControl
│   │   ├── approval.ts        # Module hỏi phê duyệt [y/N] qua terminal readline
│   │   ├── cost.ts            # Tính toán chi phí USD theo bảng giá Claude 3.5 Haiku
│   │   └── logger.ts          # Format log hiển thị hộp bảng đẹp mắt
│   └── index.ts               # CLI REPL tương tác & flag --demo
├── docs/
│   └── superpowers/specs/     # Tài liệu thiết kế & kế hoạch
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 4. Đặc Tả Dữ Liệu (Data Schemas)

### 4.1. Barem chấm điểm (`data/rubric.json`)
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

### 4.2. Danh sách học viên & Bài nộp (`data/students.json`)
Chứa tối thiểu 3 học viên với bài làm có mức độ hoàn thiện khác nhau:
1. `HV001` (Nguyễn Văn An): Làm tốt logic, code sạch, thiếu kiểm tra rỗng $\rightarrow$ Kỳ vọng ~8.5 điểm.
2. `HV002` (Trần Thị Bình): Code lỗi tính giảm giá, không xử lý lỗi $\rightarrow$ Kỳ vọng ~5.0 điểm.
3. `HV003` (Lê Hoàng Cường): Bài làm xuất sắc, có test case, xử lý lỗi đầy đủ $\rightarrow$ Kỳ vọng ~9.5 điểm.

```json
[
  {
    "studentId": "HV001",
    "fullName": "Nguyễn Văn An",
    "assignmentId": "ASM01",
    "status": "pending",
    "submissionCode": "function calculateCart(items, voucher) {\n  let subtotal = 0;\n  for (let item of items) {\n    subtotal += item.price * item.quantity;\n  }\n  let discount = 0;\n  if (voucher && voucher.code === 'SALE10') {\n    discount = subtotal * 0.1;\n  }\n  const vat = (subtotal - discount) * 0.1;\n  return {\n    subtotal,\n    discount,\n    vat,\n    total: subtotal - discount + vat\n  };\n}"
  }
]
```

### 4.3. Bảng điểm đã duyệt (`data/grades.json`)
```json
[
  {
    "studentId": "HV001",
    "assignmentId": "ASM01",
    "scores": {
      "logic": 4.0,
      "clean_code": 3.0,
      "error_handling": 1.0,
      "edge_cases": 0.5
    },
    "totalScore": 8.5,
    "feedback": "Thuật toán chuẩn xác, tính toán tiền đúng. Cần bổ sung kiểm tra khi items rỗng hoặc giá trị âm.",
    "gradedAt": "2026-11-06T09:15:00.000Z",
    "approvedBy": "Giảng viên"
  }
]
```

---

## 5. Đặc Tả Chi Tiết Các Tool

### 5.1. Tool 1: `get_rubric`
- **Mục đích**: Trả về barem tiêu chí và hướng dẫn chấm.
- **Parameters (Zod)**:
  ```ts
  z.object({
    assignmentId: z.string().default("ASM01").describe("Mã bài tập cần lấy barem")
  })
  ```
- **Hành vi**: Đọc `data/rubric.json`, trả về dữ liệu barem. Nếu không tìm thấy, trả về thông báo lỗi có kiểm soát `{ isError: true, message: "Barem không tồn tại" }`.
- **Cấp quyền**: Tự động thực thi (Safe read-only).

### 5.2. Tool 2: `get_student_submission`
- **Mục đích**: Tra cứu danh sách học viên đang chờ chấm hoặc lấy mã nguồn bài nộp của học viên.
- **Parameters (Zod)**:
  ```ts
  z.object({
    studentId: z.string().optional().describe("Mã học viên cần lấy bài nộp (ví dụ: HV001)"),
    listPendingOnly: z.boolean().optional().describe("Nếu true, trả về danh sách tóm tắt học viên chưa có điểm")
  })
  ```
- **Hành vi**:
  - Khi `listPendingOnly: true`: Lọc `students.json` lấy các bản ghi có `status: "pending"`.
  - Khi có `studentId`: Tìm kiếm theo ID. Nếu không tìm thấy, trả về thông báo lỗi có kiểm soát: `{ isError: true, message: "Không tìm thấy học viên HV..." }`.
- **Cấp quyền**: Tự động thực thi (Safe read-only).

### 5.3. Tool 3: `save_grade` (Ghi điểm - Human-in-the-loop)
- **Mục đích**: Lưu điểm số và nhận xét bài nộp sau khi được Giảng viên phê duyệt.
- **Parameters (Zod)**:
  ```ts
  z.object({
    studentId: z.string().describe("Mã học viên được chấm điểm"),
    scores: z.record(z.string(), z.number()).describe("Điểm chi tiết từng tiêu chí trong rubric"),
    totalScore: z.number().describe("Tổng điểm trên thang 10"),
    feedback: z.string().describe("Nhận xét chi tiết điểm mạnh và điểm cần cải thiện cho học viên")
  })
  ```
- **Cơ chế Phê duyệt (HITL Execution Flow)**:
  1. Khi Agent gọi `save_grade`, hàm execute gọi `promptInstructorApproval(details)`.
  2. Màn hình console tạm dừng và hiển thị hộp thông tin phê duyệt.
  3. Người dùng nhập `y` hoặc `n` qua terminal:
     - **Nếu đồng ý (`y`)**: Ghi dữ liệu vào `data/grades.json`, cập nhật `status: "graded"` trong `data/students.json`. Trả về `{ success: true, message: "Điểm đã được Giảng viên duyệt và lưu thành công." }`.
     - **Nếu từ chối (`n`)**: Không ghi dữ liệu. Trả về `{ success: false, message: "Giảng viên đã từ chối lưu điểm số này. Hãy trao đổi lại với giảng viên về điểm số hoặc nhận xét." }`.

---

## 6. Thiết Kế Agent Loop, Giới Hạn & Prompt Caching

### 6.1. Multi-turn Agent Loop & Cấu hình Giới hạn
- Mô hình: `@ai-sdk/anthropic` (`claude-3-5-haiku-20241022`).
- Giới hạn: `MAX_STEPS = 5`.
- **Hook `prepareStep`**:
  ```ts
  prepareStep: async ({ step, messages }) => {
    // Nếu chạm lượt cuối cùng của vòng lặp
    if (step >= MAX_STEPS - 1) {
      return {
        activeTools: [], // Vô hiệu hóa tool calling
        messages: [
          ...messages,
          {
            role: "system",
            content: "CẢNH BÁO: Đã đạt số lượt gọi công cụ tối đa. Bạn không được gọi thêm công cụ nào. Hãy tổng hợp câu trả lời cho người dùng bằng toàn bộ dữ liệu đã thu thập được."
          }
        ]
      };
    }
    return {};
  }
  ```

### 6.2. Chiến lược Prompt Caching (Ephemeral Cache)
- Đặt `providerMetadata` cho system prompt và thông tin rubric cố định:
  ```ts
  messages: [
    {
      role: "system",
      content: SYSTEM_INSTRUCTION_TEXT,
      providerMetadata: {
        anthropic: {
          cacheControl: { type: "ephemeral" }
        }
      }
    },
    ...conversationHistory
  ]
  ```
- **Cơ chế hoạt động**:
  - Lượt hỏi 1: System prompt được gửi lên Anthropic API $\rightarrow$ Cache Write (`cacheCreationInputTokens` > 0).
  - Lượt hỏi 2 trở đi: Tiền tố tin nhắn giữ nguyên $\rightarrow$ Anthropic trả về Cache Read (`cacheReadInputTokens` > 0, giảm 90% chi phí input).

---

## 7. Thiết Kế Observability & Tính Chi Phí

### 7.1. Bảng giá Claude 3.5 Haiku
| Loại Token | Đơn giá / 1 triệu tokens | Đơn giá / 1 token |
| :--- | :--- | :--- |
| **Input thường (Non-cached)** | $0.80 | $0.0000008 |
| **Cache Write** | $1.00 | $0.0000010 |
| **Cache Read (HIT ⚡)** | $0.08 | $0.00000008 |
| **Output** | $4.00 | $0.0000040 |

### 7.2. Công thức tính chi phí
$$\text{Cost} = (T_{\text{input}} \times 0.8 + T_{\text{cache\_write}} \times 1.0 + T_{\text{cache\_read}} \times 0.08 + T_{\text{output}} \times 4.0) / 10^6$$

### 7.3. Định dạng Log Observability
1. **Log từng lượt (Step Log)**: In số thứ tự bước, tên tool, arguments, thời gian thực thi, kết quả trả về.
2. **Log phê duyệt (HITL Log)**: In trạng thái phê duyệt của Giảng viên.
3. **Log tổng kết câu hỏi (Usage & Cost Summary)**: In bảng tổng hợp token input, cache write, cache read, output, tổng tiền USD và tiền VNĐ tương ứng (tỷ giá 25.500 VND/USD).

---

## 8. Xử Lý Ngoại Lệ & Độ Bền Vững (Resilience & Error Handling)

1. **Tool Exception Resilience**:
   Mọi thao tác đọc/ghi file hay xử lý logic trong tool đều nằm trong block `try { ... } catch (error) { ... }`. Khi có lỗi, tool trả về object `{ isError: true, message: string }`, không bao giờ throw unhandled error.
2. **Tool Timeout Safety**:
   Mỗi lệnh gọi tool bọc trong `Promise.race` với timeout 10 giây. Nếu vượt quá, trả về `{ isError: true, message: "Hết thời gian chờ phản hồi từ công cụ (Timeout 10s)" }`.
3. **Step Exhaustion Handling**:
   Nhờ hook `prepareStep`, khi tới bước 5 (bước cuối), model không gọi thêm tool mà tự động viết câu trả lời kết luận, kèm giải thích rõ các thông tin chưa kịp thu thập nếu có.
4. **HITL Rejection Handling**:
   Nếu giảng viên gõ `n`, tool trả về lý do từ chối, model tiếp tục hội thoại hỏi giảng viên cần sửa gì, hoàn toàn không làm gián đoạn vòng lặp REPL.

---

## 9. Kế Hoạch Kiểm Thử & Xác Minh (Verification Plan)

| Kịch bản kiểm thử | Hành động kiểm thử | Kết quả mong đợi |
| :--- | :--- | :--- |
| **Test 1: Tra cứu & Chấm điểm (Multi-turn Tool Loop)** | Hỏi: "Chấm điểm bài bạn An (HV001)" | AI gọi liên tiếp `get_student_submission`, `get_rubric`, phân tích code và gọi `save_grade`. |
| **Test 2: Human-in-the-loop Duyệt [Y]** | Khi console hỏi duyệt `[y/N]`, gõ `y` | Điểm được lưu vào `grades.json`, cập nhật status trong `students.json`. |
| **Test 3: Human-in-the-loop Từ chối [N]** | Khi console hỏi duyệt `[y/N]`, gõ `n` | Không ghi file, AI hỏi giảng viên cần điều chỉnh điểm số thế nào. |
| **Test 4: Kế thừa lịch sử & Cache Hit** | Hỏi tiếp câu 2: "Bạn tiếp theo cần chấm là ai?" | AI nhớ ngữ cảnh danh sách học viên, log hiển thị `Cache Read > 0` (Cache Hit ⚡). |
| **Test 5: Xử lý lỗi mã không tồn tại** | Hỏi: "Chấm điểm cho bạn HV999" | AI báo lỗi thân thiện: "Không tìm thấy học viên HV999 trong hệ thống", không bị crash. |
| **Test 6: Giới hạn MAX_STEPS** | Đặt câu hỏi phức tạp kích hoạt nhiều bước | Lượt 5 tự động tắt tool, model tổng hợp bằng dữ liệu hiện có. |

