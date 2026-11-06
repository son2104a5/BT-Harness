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

export function logToolCall(toolName: string, args: any, durationMs?: number): void {
  const timeInfo = durationMs !== undefined ? chalk.gray(` (thời gian: ${durationMs}ms)`) : '';
  console.log(chalk.blue(`│ 🔧 AI gọi tool: `) + chalk.cyan.bold(toolName) + timeInfo);
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
