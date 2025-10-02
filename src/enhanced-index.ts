#!/usr/bin/env node

import { EnhancedCLIInterface } from './ui/enhanced-cli-interface';
import chalk from 'chalk';

interface ProgramOptions {
  provider?: 'deepseek' | 'openai' | 'claude';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxFiles?: number;
  maxFileSize?: number;
  streaming?: boolean;
  autoClearAttachments?: boolean;
  help?: boolean;
}

function parseArguments(): ProgramOptions {
  const options: ProgramOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--provider':
      case '-p':
        options.provider = args[++i] as any;
        break;

      case '--api-key':
      case '-k':
        options.apiKey = args[++i];
        break;

      case '--model':
      case '-m':
        options.model = args[++i];
        break;

      case '--base-url':
      case '-u':
        options.baseUrl = args[++i];
        break;

      case '--max-files':
        options.maxFiles = parseInt(args[++i]);
        break;

      case '--max-file-size':
        options.maxFileSize = parseInt(args[++i]) * 1024 * 1024; // Convert MB to bytes
        break;

      case '--streaming':
      case '-s':
        options.streaming = true;
        break;

      case '--no-streaming':
        options.streaming = false;
        break;

      case '--auto-clear':
        options.autoClearAttachments = true;
        break;

      case '--no-auto-clear':
        options.autoClearAttachments = false;
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function displayHelp(): void {
  console.log(chalk.cyan(`
🚀 AICLI - 增强版 AI 命令行工具

用法:
  aicli [选项]

选项:
  -p, --provider <provider>    AI提供商 (deepseek, openai, claude) [默认: deepseek]
  -k, --api-key <key>         API密钥 [默认: 从环境变量读取]
  -m, --model <model>         模型名称
  -u, --base-url <url>        API基础URL
  --max-files <number>        最大文件数量 [默认: 20]
  --max-file-size <mb>        最大文件大小(MB) [默认: 50]
  -s, --streaming             启用流式响应 [默认: 启用]
  --no-streaming              禁用流式响应
  -h, --help                  显示帮助信息

环境变量:
  DEEPSEEK_API_KEY            DeepSeek API密钥
  OPENAI_API_KEY              OpenAI API密钥
  CLAUDE_API_KEY              Claude API密钥

功能特性:
  📁 文件拖拽                   - 拖拽文件到终端窗口自动添加
  📋 剪贴板粘贴                 - 粘贴图片、文件路径或文本
  📎 附件管理                   - 添加、删除、查看附件
  🤖 AI对话                     - 支持多模态对话(文本+图片+文档)
  📤 文件上传                   - 自动上传附件到AI模型
  ⚡ 流式响应                   - 实时显示AI回复
  🎨 美观界面                   - 现代化CLI界面设计

支持文件类型:
  📄 文档: PDF, DOC, DOCX, TXT, MD
  🖼️ 图片: PNG, JPG, JPEG, GIF, WEBP, BMP
  📝 代码: JS, TS, PY, JAVA, CPP, JSON, XML
  💾 其他: 支持所有文件类型

使用示例:
  # 基本使用
  aicli

  # 指定提供商和模型
  aicli --provider deepseek --model deepseek-chat

  # 使用自定义API密钥
  aicli --api-key "your-api-key"

  # 设置文件限制
  aicli --max-files 10 --max-file-size 20

  # 启用/禁用自动清除附件
  aicli --auto-clear              # 启用自动清除（默认）
  aicli --no-auto-clear           # 禁用自动清除

交互命令:
  /paste, /p                   粘贴剪贴板内容
  /attachments, /att           查看附件列表
  /clear, /c                  清空附件列表
  /remove <n>, /rm <n>         删除第 n 个附件
  /upload [path], /up [path]  上传文件
  /status, /st                查看系统状态
  /help, /h                   显示帮助
  /quit, /q                   退出程序

快捷键:
  Ctrl+C                      取消当前请求/退出
  Ctrl+V                      粘贴剪贴板内容

技术支持:
  GitHub: https://github.com/your-repo/aicli
  文档: https://docs.aicli.dev
  问题反馈: https://github.com/your-repo/aicli/issues
`));
}

async function main(): Promise<void> {
  try {
    const options = parseArguments();

    if (options.help) {
      displayHelp();
      process.exit(0);
    }

    // 从环境变量获取API密钥
    const deepseekKey = process.env.DEEPSEEK_API_KEY || options.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    // 确定API密钥
    let apiKey = '';
    let provider = options.provider || 'deepseek';

    if (options.provider === 'deepseek' || !options.provider) {
      apiKey = deepseekKey || '';
      provider = 'deepseek';
    } else if (options.provider === 'openai') {
      apiKey = openaiKey || '';
      provider = 'openai';
    } else if (options.provider === 'claude') {
      apiKey = claudeKey || '';
      provider = 'claude';
    }

    if (!apiKey && !options.apiKey) {
      console.log(chalk.yellow('⚠️ 未检测到API密钥'));
      console.log(chalk.gray('请设置环境变量或使用 --api-key 参数'));
      console.log(chalk.gray('例如: export DEEPSEEK_API_KEY="your-api-key"'));
      console.log('');
    }

    // 设置默认选项
    const cliOptions = {
      provider: provider as any,
      apiKey: options.apiKey || apiKey,
      model: options.model,
      baseUrl: options.baseUrl,
      maxFiles: options.maxFiles || 20,
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
      enableStreaming: options.streaming !== false
    };

    // 创建并启动CLI界面
    const cli = new EnhancedCLIInterface(cliOptions);
    await cli.start();

  } catch (error) {
    console.error(chalk.red(`❌ 启动失败: ${error instanceof Error ? error.message : '未知错误'}`));
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
  console.error(chalk.red(`❌ 应用启动失败: ${error instanceof Error ? error.message : '未知错误'}`));
  process.exit(1);
});