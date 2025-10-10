#!/usr/bin/env node

import { SimpleHybridLayout } from './ui/hybrid-layout-simple';
import chalk from 'chalk';

// 定义本地布局模式，避免依赖有问题的文件
enum SimpleLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

interface SimpleProgramOptions {
  help?: boolean;
  mode?: SimpleLayoutMode;
  verbose?: boolean;
}

function parseArguments(): SimpleProgramOptions {
  const options: SimpleProgramOptions = {};
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
          options.mode = mode.toLowerCase() as SimpleLayoutMode;
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
🚀 AICLI - 混合布局演示版

用法:
  aicli-simple [选项]

选项:
  -h, --help                  显示帮助信息
  -m, --mode <mode>           布局模式 (chat, dashboard, adaptive) [默认: adaptive]
  -v, --verbose               启用详细日志

布局模式:
  chat        - 流式聊天布局
  dashboard   - 仪表盘布局
  adaptive    - 自适应布局

交互命令:
  /help, /h                   显示帮助
  /mode                       切换布局模式
  /clear, /c                  清空屏幕
  /exit, /q                   退出程序

快捷键:
  Ctrl+C                      退出程序

示例:
  aicli-simple                # 启动自适应模式
  aicli-simple --mode chat    # 启动聊天模式
  aicli-simple --mode dashboard # 启动仪表盘模式

注意: 这是一个演示版本，完整功能需要配置AI服务。
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
      console.log(chalk.blue('🚀 启动混合布局演示版...'));
      if (options.mode) {
        console.log(chalk.gray(`  模式: ${options.mode}`));
      }
    }

    // 创建并启动简化版混合布局
    const layout = new SimpleHybridLayout();

    if (options.mode) {
      layout.setMode(options.mode as any);
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

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ 未捕获的异常: ${error.message}`));
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red(`❌ 未处理的Promise拒绝: ${reason}`));
  process.exit(1);
});

// 处理进程信号
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 收到中断信号，正在退出...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 收到终止信号，正在退出...'));
  process.exit(0);
});

// 启动应用
main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : '未知错误';
  console.error(chalk.red(`❌ 应用启动失败: ${errorMessage}`));
  process.exit(1);
});