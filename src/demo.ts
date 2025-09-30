#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.setPrompt(chalk.cyan('aicli> '));

// 斜杠命令处理
const commands = {
  help: () => {
    console.log(chalk.cyan('\n📖 可用命令:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.green('  /help      - 显示帮助信息'));
    console.log(chalk.green('  /clear     - 清屏'));
    console.log(chalk.green('  /status    - 显示状态'));
    console.log(chalk.green('  /exit      - 退出程序'));
    console.log(chalk.green('  /project   - 项目信息'));
    console.log(chalk.green('  /tools     - 显示工具'));
    console.log('');
  },

  clear: () => {
    process.stdout.write('\x1b[2J\x1b[H');
  },

  status: () => {
    console.log(chalk.cyan('\n📊 系统状态:'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.white('  状态: 🟢 运行中'));
    console.log(chalk.white('  版本: 2.0.0 演示版'));
    console.log(chalk.white('  模式: 交互式'));
    console.log('');
  },

  project: () => {
    console.log(chalk.cyan('\n🏗️  项目信息:'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.white(`  路径: ${process.cwd()}`));
    console.log(chalk.white(`  类型: Node.js 项目`));
    console.log(chalk.white(`  Git: ✅ 是`));
    console.log('');
  },

  tools: () => {
    console.log(chalk.cyan('\n🛠️  可用工具 (演示):'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.yellow('  文件操作:'));
    console.log(chalk.white('    - file_read: 读取文件'));
    console.log(chalk.white('    - file_write: 写入文件'));
    console.log(chalk.white('    - file_edit: 编辑文件'));
    console.log(chalk.yellow('  命令执行:'));
    console.log(chalk.white('    - bash: 执行命令'));
    console.log(chalk.white('    - bash_output: 获取输出'));
    console.log(chalk.yellow('  搜索工具:'));
    console.log(chalk.white('    - glob: 文件搜索'));
    console.log(chalk.white('    - grep: 文本搜索'));
    console.log('');
  },

  exit: () => {
    console.log(chalk.yellow('\n👋 再见!'));
    process.exit(0);
  }
};

// 显示欢迎信息
function showWelcome() {
  console.log(chalk.cyan('==============================================='));
  console.log(chalk.white('欢迎使用 AICLI - AI 编程助手终端工具'));
  console.log(chalk.gray('Version: 2.0.0 (演示版)'));
  console.log(chalk.cyan('==============================================='));
  console.log('');

  console.log(chalk.yellow('⚡ 功能特性:'));
  console.log(chalk.white('  • Claude Code CLI 风格界面'));
  console.log(chalk.white('  • 多模型支持 (Claude, DeepSeek, Kimi, OpenAI 等)'));
  console.log(chalk.white('  • 工具调用系统'));
  console.log(chalk.white('  • 会话管理'));
  console.log(chalk.white('  • 流式响应'));
  console.log('');

  console.log(chalk.yellow('💡 使用提示:'));
  console.log(chalk.white('  • 输入消息开始对话'));
  console.log(chalk.white('  • 输入 /help 查看所有命令'));
  console.log(chalk.white('  • 输入 /status 查看系统状态'));
  console.log(chalk.white('  • 这是一个演示版本，完整功能需要配置 API Key'));
  console.log('');

  console.log(chalk.yellow('⌨️  快捷键:'));
  console.log(chalk.gray('  Ctrl+C  - 退出程序'));
  console.log(chalk.gray('  Tab     - 自动补全'));
  console.log(chalk.gray('  ↑/↓     - 历史记录'));
  console.log('');

  console.log(chalk.cyan('==============================================='));
  console.log('');
}

// 处理用户输入
function handleInput(input: string) {
  input = input.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  // 处理斜杠命令
  if (input.startsWith('/')) {
    const commandName = input.slice(1);
    const command = commands[commandName as keyof typeof commands];

    if (command) {
      command();
    } else {
      console.log(chalk.red(`❌ 未知命令: ${commandName}`));
      console.log(chalk.gray('输入 /help 查看可用命令'));
    }
    rl.prompt();
    return;
  }

  // 处理普通对话
  console.log(chalk.green('\n🤖 AI 响应:'));
  console.log(chalk.white(`你说了: "${input}"`));
  console.log('');

  if (input.includes('hello') || input.includes('你好')) {
    console.log(chalk.cyan('你好！我是 AICLI，一个 AI 编程助手。'));
    console.log(chalk.gray('我可以帮助你完成各种编程任务，比如代码分析、文件操作、命令执行等。'));
  } else if (input.includes('help') || input.includes('帮助')) {
    console.log(chalk.cyan('我可以帮助你:'));
    console.log(chalk.white('• 分析代码结构'));
    console.log(chalk.white('• 编写和修改代码'));
    console.log(chalk.white('• 执行命令和脚本'));
    console.log(chalk.white('• 搜索和操作文件'));
    console.log(chalk.white('• 回答编程问题'));
  } else if (input.includes('file') || input.includes('文件')) {
    console.log(chalk.cyan('文件操作示例:'));
    console.log(chalk.white('• "读取 package.json"'));
    console.log(chalk.white('• "创建一个 utils.ts 文件"'));
    console.log(chalk.white('• "搜索所有的 TypeScript 文件"'));
  } else if (input.includes('code') || input.includes('代码')) {
    console.log(chalk.cyan('代码相关功能:'));
    console.log(chalk.white('• 代码分析和优化建议'));
    console.log(chalk.white('• 生成新的代码'));
    console.log(chalk.white('• 重构现有代码'));
    console.log(chalk.white('• 调试和修复问题'));
  } else {
    console.log(chalk.cyan('我理解你说的话！'));
    console.log(chalk.gray('这是一个演示版本。完整版本需要配置 AI API Key 才能使用真实的 AI 功能。'));
    console.log(chalk.gray('你可以尝试输入:'));
    console.log(chalk.gray('• "你好"'));
    console.log(chalk.gray('• "帮助"'));
    console.log(chalk.gray('• "文件操作"'));
    console.log(chalk.gray('• "代码分析"'));
  }

  console.log('');
  rl.prompt();
}

// 设置事件监听器
rl.on('line', handleInput);

rl.on('close', () => {
  console.log(chalk.yellow('\n👋 再见!'));
  process.exit(0);
});

// 处理 Ctrl+C
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 再见!'));
  process.exit(0);
});

// 自动补全
(rl as any).completer = (line: string) => {
  const completions = Object.keys(commands).map(cmd => '/' + cmd);
  const hits = completions.filter(cmd => cmd.startsWith(line));
  return [hits, line];
};

// 启动
showWelcome();
rl.prompt();