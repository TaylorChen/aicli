#!/usr/bin/env node

import { FixedHybridLayout } from './ui/fixed-hybrid-layout';
import chalk from 'chalk';

// 定义布局模式
enum FixedLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

interface FixedProgramOptions {
  help?: boolean;
  mode?: FixedLayoutMode;
  verbose?: boolean;
}

function parseArguments(): FixedProgramOptions {
  const options: FixedProgramOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;

      case '--mode':
      case '-m':
        const mode = args[++i];
        if (['chat', 'dashboard', 'adaptive'].includes(mode.toLowerCase())) {
          options.mode = mode.toLowerCase() as FixedLayoutMode;
        }
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return options;
}

function displayHelp(): void {
  console.log(chalk.cyan(`
🚀 AICLI 修复版混合布局 - 真实AI交互

用法:
  aicli-fixed [选项]

选项:
  -h, --help                  显示帮助信息
  -m, --mode <mode>           布局模式 (chat, dashboard, adaptive) [默认: adaptive]
  -v, --verbose               启用详细日志

布局模式:
  chat        - 流式聊天布局
  dashboard   - 仪表盘布局
  adaptive    - 自适应布局

AI提供商支持:
  🤖 DeepSeek AI (推荐)     - 设置 DEEPSEEK_API_KEY
  🧠 OpenAI GPT            - 设置 OPENAI_API_KEY
  💬 Anthropic Claude       - 设置 CLAUDE_API_KEY

交互命令:
  /help, /h                   显示帮助
  /mode                       切换布局模式
  /status, /st                显示系统状态
  /test                       测试AI连接
  /clear, /c                  清空屏幕
  /exit, /q                   退出程序

使用示例:
  # 基本使用（自动检测AI服务）
  aicli-fixed

  # 指定布局模式
  aicli-fixed --mode chat
  aicli-fixed --mode dashboard

  # 启动前设置AI服务
  export DEEPSEEK_API_KEY=your_api_key
  aicli-fixed

特色功能:
  🤖 真实AI大模型对话交互
  🎨 三种智能布局模式
  📊 实时状态监控
  💬 流式对话体验
  🔧 完整的功能集成
  ✅ 修复了依赖问题

注意: 这是修复版混合布局，确保与大模型的正常交互。
`));
}

async function main(): Promise<void> {
  try {
    const options = parseArguments();

    if (options.help) {
      displayHelp();
      process.exit(0);
    }

    // 显示启动信息
    if (options.verbose) {
      console.log(chalk.blue('🚀 启动修复版混合布局...'));
      if (options.mode) {
        console.log(chalk.gray(`  模式: ${options.mode}`));
      }
    }

    // 检查环境变量
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    if (options.verbose) {
      if (deepseekKey) {
        console.log(chalk.green('✅ 检测到 DeepSeek API 配置'));
      }
      if (openaiKey) {
        console.log(chalk.green('✅ 检测到 OpenAI API 配置'));
      }
      if (claudeKey) {
        console.log(chalk.green('✅ 检测到 Claude API 配置'));
      }
      if (!deepseekKey && !openaiKey && !claudeKey) {
        console.log(chalk.yellow('⚠️  未检测到AI服务配置'));
      }
    }

    // 创建并启动修复版混合布局
    const layout = new FixedHybridLayout();

    if (options.mode) {
      layout.setMode(options.mode);
    }

    await layout.start();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error(chalk.red(`❌ 启动失败: ${errorMessage}`));
    if (process.env.DEBUG && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ 未捕获异常: ${error.message}`));
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`❌ Promise 拒绝: ${reason}`));
  process.exit(1);
});

// 进程信号处理
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 收到中断信号，正在退出...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 收到终止信号，正在退出...'));
  process.exit(0);
});

// 启动应用
main();