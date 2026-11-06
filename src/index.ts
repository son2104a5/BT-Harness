import readline from 'node:readline';
import chalk from 'chalk';
import { GradingHarness } from './harness/loop.js';
import { promptInstructorApproval } from './harness/approval.js';
import { config } from './config.js';

export function printWelcomeBanner() {
  console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║         🤖 TRỢ LÝ CHẤT LƯỢNG CAO: CHẤM ĐIỂM HỌC VIÊN             ║'));
  console.log(chalk.cyan.bold('║              (Vercel AI SDK + Anthropic Claude 3.5)              ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`• Model: ${config.modelName} | Max Steps: ${config.maxSteps}`));
  console.log(chalk.gray(`• Ephemeral Prompt Caching: Kích hoạt (Kiểm chứng từ câu hỏi 2)`));
  console.log(chalk.gray(`• Human-in-the-loop: Bắt buộc duyệt khi ghi nhận điểm`));
  console.log(chalk.gray(`• Gõ 'exit' hoặc 'quit' để thoát chương trình.\n`));
}

export async function runDemoMode() {
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

export async function runInteractiveREPL() {
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

  rl.on('SIGINT', () => {
    console.log(chalk.cyan('\nĐã nhận tín hiệu dừng (Ctrl+C). Tạm biệt thầy/cô!'));
    rl.close();
    process.exit(0);
  });

  const promptUser = () => {
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
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

export async function main() {
  const isDemo = process.argv.includes('--demo');
  if (isDemo) {
    await runDemoMode();
  } else {
    await runInteractiveREPL();
  }
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Only auto-run if executed as main module
const isMainModule = () => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
};

if (isMainModule()) {
  main().catch(err => {
    console.error(chalk.red('Fatal error:'), err);
    process.exit(1);
  });
}
