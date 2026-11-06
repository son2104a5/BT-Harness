import { generateText, CoreMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import chalk from 'chalk';
import { config } from '../config.js';
import { createGradingTools } from '../tools/index.js';
import { ApprovalHandler } from '../tools/save-grade.js';
import { calculateClaudeCost } from './cost.js';
import { logStepStart, logToolCall, logToolResult, logCostSummary } from './logger.js';
import { CostBreakdown } from '../types.js';

export const SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI Chấm điểm danh sách học viên chuyên nghiệp và công tâm (trợ lý chấm điểm).
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
    const accumulatedCost: CostBreakdown = {
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
      experimental_providerMetadata: {
        anthropic: {
          cacheControl: { type: 'ephemeral' }
        }
      }
    };
    // Support providerMetadata property for SDK compatibility
    (systemMessage as any).providerMetadata = {
      anthropic: {
        cacheControl: { type: 'ephemeral' }
      }
    };

    const prepareStepHandler = async (options: { step?: number; stepNumber?: number }) => {
      const step = options.step ?? options.stepNumber ?? 0;
      currentStep = step;
      logStepStart(step, maxSteps);

      // Limit enforcement on the final step
      if (shouldDisableToolsOnLastStep(step, maxSteps)) {
        console.log(chalk.red.bold(`⚠️  [GIỚI HẠN BƯỚC] Đã đến bước cuối (${step + 1}/${maxSteps}). Vô hiệu hóa toàn bộ tool.`));
        return {
          activeTools: [] as string[],
          experimental_activeTools: [] as string[],
          toolChoice: 'none' as const,
          messages: [
            {
              role: 'system',
              content: 'CẢNH BÁO: Đây là bước cuối cùng được phép. Bạn KHÔNG THỂ gọi thêm bất kỳ công cụ nào. Hãy tổng hợp câu trả lời đầy đủ cho người dùng bằng toàn bộ dữ liệu bạn đã thu thập được từ các bước trước.'
            }
          ]
        };
      }
      return {};
    };

    // Execute generateText with step loop hooks
    const result = await (generateText as any)({
      model: anthropic(config.modelName),
      system: SYSTEM_INSTRUCTION,
      messages: [systemMessage, ...this.messages],
      tools,
      maxSteps,
      prepareStep: prepareStepHandler,
      experimental_prepareStep: prepareStepHandler,
      onStepFinish: async (stepEvent: any) => {
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
