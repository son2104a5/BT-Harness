import readline from 'node:readline';
import chalk from 'chalk';
import { ToolApprovalRequest } from '../types.js';

export async function promptInstructorApproval(request: ToolApprovalRequest): Promise<boolean> {
  const scoresDisplay = Object.entries(request.scores)
    .map(([criterion, score]) => `   • ${criterion}: ${score}`)
    .join('\n');

  const studentDisplay = request.studentName
    ? `${request.studentName} (${request.studentId})`
    : request.studentId;

  console.log('\n' + chalk.yellow.bold('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
  console.log(chalk.yellow.bold('┃ ⚠️  YÊU CẦU PHÊ DUYỆT TỪ GIẢNG VIÊN (HUMAN-IN-THE-LOOP)           ┃'));
  console.log(chalk.yellow.bold('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫'));
  console.log(chalk.white(`┃ Học viên: `) + chalk.cyan.bold(studentDisplay));
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
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
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
