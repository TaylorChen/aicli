#!/usr/bin/env node

import { WorkingHybridLayout } from './ui/working-hybrid-layout';
import chalk from 'chalk';

// 定义本地布局模式
enum WorkingLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

interface WorkingProgramOptions {
  help?: boolean;
  mode?: WorkingLayoutMode;
  verbose?: boolean;
  provider?: 'deepseek' | 'openai' | 'claude';
  model?: string;
  apiKey?: string;
}

function parseArguments(): WorkingProgramOptions {
  const options: WorkingProgramOptions = {};
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
          options.mode = mode.toLowerCase() as WorkingLayoutMode;
        }
        break;

      case '--provider':
      case '-p':
        const provider = args[++i];
        if (['deepseek', 'openai', 'claude'].includes(provider.toLowerCase())) {
          options.provider = provider.toLowerCase() as any;
        }
        break;

      case '--model':
        options.model = args[++i];
        break;

      case '--api-key':
      case '-k':
        options.apiKey = args[++i];
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
🚀 AICLI 混合布局 - 真实AI交互版本

用法:
  aicli-working [选项]

选项:
  -h, --help                  显示帮助信息
  -m, --mode <mode>           布局模式 (chat, dashboard, adaptive) [默认: adaptive]
  -p, --provider <provider>   AI提供商 (deepseek, openai, claude)
  --model <model>             AI模型名称
  -k, --api-key <key>         API密钥
  -v, --verbose               启用详细日志

布局模式:
  chat        - 流式聊天布局
  dashboard   - 仪表盘布局
  adaptive    - 自适应布局

AI提供商:
  deepseek    - DeepSeek AI (推荐)
  openai      - OpenAI GPT
  claude      - Anthropic Claude

环境变量:
  DEEPSEEK_API_KEY            DeepSeek API密钥
  OPENAI_API_KEY              OpenAI API密钥
  CLAUDE_API_KEY              Claude API密钥

交互命令:
  /help, /h                   显示帮助
  /mode                       切换布局模式
  /status, /st                显示系统状态
  /provider                   显示AI提供商信息
  /clear, /c                  清空屏幕
  /exit, /q                   退出程序

使用示例:
  # 基本使用
  aicli-working

  # 指定布局模式
  aicli-working --mode chat
  aicli-working --mode dashboard

  # 指定AI提供商
  aicli-working --provider deepseek

  # 完整配置
  aicli-working --provider deepseek --model deepseek-chat

特色功能:
  🤖 真实AI大模型对话
  🎨 三种智能布局模式
  📊 实时状态监控
  💬 流式对话体验
  🔧 完整的功能集成

注意: 这是可工作的混合布局版本，支持与真实AI服务交互。
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
      console.log(chalk.blue('🚀 启动混合布局版本...'));
      if (options.mode) {
        console.log(chalk.gray(`  模式: ${options.mode}`));
      }
      if (options.provider) {
        console.log(chalk.gray(`  提供商: ${options.provider}`));
      }
      if (options.model) {
        console.log(chalk.gray(`  模型: ${options.model}`));
      }
    }

    // 设置环境变量（如果通过命令行提供）
    if (options.apiKey) {
      if (options.provider === 'deepseek') {
        process.env.DEEPSEEK_API_KEY = options.apiKey;
      } else if (options.provider === 'openai') {
        process.env.OPENAI_API_KEY = options.apiKey;
      } else if (options.provider === 'claude') {
        process.env.CLAUDE_API_KEY = options.apiKey;
      }
    }

    // 创建并启动工作版混合布局
    const layout = new WorkingHybridLayout();

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