#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';

enum DemoLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

/**
 * 混合布局演示版本
 * 展示基于文档思路的布局设计概念
 */
class HybridLayoutDemo {
  private rl: readline.Interface;
  private currentMode: DemoLayoutMode = DemoLayoutMode.ADAPTIVE;
  private messageHistory: string[] = [];
  private isProcessing = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🤖 '
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.rl.on('line', this.handleUserInput.bind(this));
    process.on('SIGINT', this.handleExit.bind(this));
    process.stdout.on('resize', this.handleResize.bind(this));
  }

  private handleUserInput(input: string): void {
    input = input.trim();
    if (!input) {
      this.rl.prompt();
      return;
    }

    // 记录用户输入
    this.messageHistory.push(`👤 用户: ${input}`);

    if (input.startsWith('/')) {
      this.handleCommand(input);
    } else {
      this.processUserMessage(input);
    }
  }

  private handleCommand(input: string): void {
    const command = input.slice(1).toLowerCase();

    switch (command) {
      case 'help':
      case 'h':
        this.showHelp();
        break;
      case 'clear':
      case 'c':
        this.clearScreen();
        break;
      case 'mode':
        this.switchMode();
        break;
      case 'chat':
        this.setMode(DemoLayoutMode.CHAT);
        break;
      case 'dashboard':
      case 'dash':
        this.setMode(DemoLayoutMode.DASHBOARD);
        break;
      case 'adaptive':
        this.setMode(DemoLayoutMode.ADAPTIVE);
        break;
      case 'status':
      case 'st':
        this.showStatus();
        break;
      case 'demo':
        this.showDemo();
        break;
      case 'exit':
      case 'q':
        this.handleExit();
        break;
      default:
        this.addSystemMessage(`❓ 未知命令: ${command}。输入 /help 查看可用命令。`);
    }
  }

  private switchMode(): void {
    const modes = [DemoLayoutMode.CHAT, DemoLayoutMode.DASHBOARD, DemoLayoutMode.ADAPTIVE];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setMode(nextMode);
  }

  private setMode(mode: DemoLayoutMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.addSystemMessage(`🔄 布局切换: ${this.getModeName(previousMode)} → ${this.getModeName(mode)}`);
    this.renderScreen();
  }

  private getModeName(mode: DemoLayoutMode): string {
    switch (mode) {
      case DemoLayoutMode.CHAT:
        return '聊天模式';
      case DemoLayoutMode.DASHBOARD:
        return '仪表盘模式';
      case DemoLayoutMode.ADAPTIVE:
        return '自适应模式';
      default:
        return '未知模式';
    }
  }

  private getModeIcon(mode: DemoLayoutMode): string {
    switch (mode) {
      case DemoLayoutMode.CHAT:
        return '💬';
      case DemoLayoutMode.DASHBOARD:
        return '📊';
      case DemoLayoutMode.ADAPTIVE:
        return '🤖';
      default:
        return '❓';
    }
  }

  private getModeDescription(mode: DemoLayoutMode): string {
    switch (mode) {
      case DemoLayoutMode.CHAT:
        return '流式对话布局，类似 Qoder CLI';
      case DemoLayoutMode.DASHBOARD:
        return '仪表盘布局，类似 Claude Code CLI';
      case DemoLayoutMode.ADAPTIVE:
        return '自适应布局，智能切换模式';
      default:
        return '未知布局模式';
    }
  }

  private showHelp(): void {
    const helpContent = [
      '',
      chalk.bold.blue('📚 AICLI 混合布局演示 - 帮助信息'),
      chalk.gray('─'.repeat(60)),
      '',
      chalk.bold('🎯 基础命令:'),
      '  /help, /h           - 显示帮助信息',
      '  /clear, /c          - 清空屏幕',
      '  /exit, /q           - 退出程序',
      '  /status, /st        - 显示当前状态',
      '  /demo               - 运行演示',
      '',
      chalk.bold('🎨 布局控制:'),
      '  /mode               - 循环切换布局模式',
      '  /chat               - 切换到聊天模式',
      '  /dashboard          - 切换到仪表盘模式',
      '  /adaptive           - 切换到自适应模式',
      '',
      chalk.bold('⌨️  快捷键:'),
      '  Ctrl+C              - 退出程序',
      '',
      chalk.bold('💡 布局模式说明:'),
      '',
      `${chalk.green('💬 聊天模式')}:`,
      '  • 流式线性布局，类似聊天界面',
      '  • 适合长篇对话和内容展示',
      '  • 历史记录完整可回溯',
      '',
      `${chalk.cyan('📊 仪表盘模式')}:`,
      '  • 区块化分层布局，结构化显示',
      '  • 实时状态监控和进度反馈',
      '  • 适合任务执行和调试',
      '',
      `${chalk.yellow('🤖 自适应模式')}:`,
      '  • 智能切换布局模式',
      '  • 根据内容类型和系统状态自动调整',
      '  • 最佳的用户体验',
      '',
      chalk.gray('基于 Qoder CLI 和 Claude Code CLI 的技术分析设计'),
      ''
    ];

    this.addSystemMessage(helpContent.join('\n'));
  }

  private showStatus(): void {
    const statusContent = [
      '',
      chalk.bold('📊 系统状态'),
      chalk.gray('─'.repeat(40)),
      '',
      `🎨 当前布局: ${this.getModeIcon(this.currentMode)} ${chalk.cyan(this.getModeName(this.currentMode))}`,
      `📝 消息历史: ${this.messageHistory.length} 条`,
      `⚡ 处理状态: ${this.isProcessing ? chalk.yellow('进行中') : chalk.green('空闲')}`,
      '',
      `🖥️  终端尺寸: ${process.stdout.columns} × ${process.stdout.rows}`,
      `📋 剪贴板: ${process.stdin.isTTY ? '可用' : '不可用'}`,
      '',
      `💡 布局描述: ${this.getModeDescription(this.currentMode)}`,
      ''
    ];

    this.addSystemMessage(statusContent.join('\n'));
  }

  private showDemo(): void {
    const demoContent = [
      '',
      chalk.bold('🎬 混合布局演示'),
      chalk.gray('─'.repeat(50)),
      '',
      chalk.blue('🔄 正在演示布局切换功能...'),
      ''
    ];

    this.addSystemMessage(demoContent.join('\n'));

    // 自动切换布局模式演示
    setTimeout(() => {
      this.setMode(DemoLayoutMode.CHAT);
      this.addSystemMessage(chalk.green('✅ 已切换到聊天模式 - 展示流式对话界面'));
    }, 1000);

    setTimeout(() => {
      this.setMode(DemoLayoutMode.DASHBOARD);
      this.addSystemMessage(chalk.cyan('✅ 已切换到仪表盘模式 - 展示结构化界面'));
    }, 3000);

    setTimeout(() => {
      this.setMode(DemoLayoutMode.ADAPTIVE);
      this.addSystemMessage(chalk.yellow('✅ 已切换到自适应模式 - 智能布局系统'));
    }, 5000);

    setTimeout(() => {
      this.addSystemMessage(chalk.bold('🎉 演示完成！您可以继续体验各种布局模式。'));
    }, 7000);
  }

  private processUserMessage(input: string): void {
    this.isProcessing = true;
    this.renderScreen();

    // 模拟AI处理
    setTimeout(() => {
      const response = this.generateAIResponse(input);
      this.messageHistory.push(`🤖 助手: ${response}`);
      this.isProcessing = false;
      this.renderScreen();
      this.rl.prompt();
    }, 1000 + Math.random() * 2000);
  }

  private generateAIResponse(input: string): string {
    const responses = [
      `您刚才说: "${input}"。这是一个很好的问题！`,
      `我理解您说的 "${input}"。在 ${this.getModeName(this.currentMode)} 下，我可以为您提供最佳体验。`,
      `关于 "${input}"，让我为您详细解答...`,
      `收到您的消息: "${input}"。当前使用 ${this.getModeDescription(this.currentMode)}。`,
      `"${input}" - 很有趣的话题！根据当前布局模式，我为您提供结构化回复。`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  private addSystemMessage(message: string): void {
    this.messageHistory.push(`ℹ️  系统: ${message}`);
    this.renderScreen();
    setTimeout(() => this.rl.prompt(), 100);
  }

  private clearScreen(): void {
    this.messageHistory = [];
    this.renderScreen();
  }

  private handleResize(): void {
    this.renderScreen();
  }

  private handleExit(): void {
    console.log(chalk.yellow('\n👋 感谢使用 AICLI 混合布局演示！'));
    console.log(chalk.gray('期待您的反馈和建议。'));
    this.cleanup();
    process.exit(0);
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
    }
  }

  private renderScreen(): void {
    console.clear();

    // 终端宽度
    const width = process.stdout.columns || 80;

    // 渲染顶部栏
    this.renderHeader(width);

    // 渲染模式指示器
    this.renderModeIndicator(width);

    // 渲染消息区域
    this.renderMessageArea(width);

    // 渲染底部状态栏
    this.renderFooter(width);

    // 重新显示提示符
    if (!this.isProcessing) {
      this.rl.prompt();
    }
  }

  private renderHeader(width: number): void {
    const title = chalk.bold.blue('🚀 AICLI - 混合布局演示版');
    const subtitle = chalk.gray('基于 Qoder CLI 和 Claude Code CLI 技术分析');
    const padding = Math.max(0, Math.floor((width - title.length) / 2));

    console.log(' '.repeat(padding) + title);
    console.log(' '.repeat(Math.max(0, padding - 5)) + subtitle);
    console.log(chalk.gray('─'.repeat(width)));
  }

  private renderModeIndicator(width: number): void {
    const icon = this.getModeIcon(this.currentMode);
    const name = chalk.cyan(this.getModeName(this.currentMode));
    const description = chalk.gray(this.getModeDescription(this.currentMode));

    let statusText = `${icon} 当前模式: ${name}`;
    if (this.isProcessing) {
      statusText += chalk.yellow(' ⚡ 处理中...');
    }

    const padding = width - statusText.length - 20; // 留出空间给描述

    console.log(statusText + ' '.repeat(Math.max(0, padding)) + description);
    console.log(chalk.gray('·'.repeat(width)));
  }

  private renderMessageArea(width: number): void {
    const maxHeight = Math.max(5, process.stdout.rows - 8);

    if (this.messageHistory.length === 0) {
      const welcomeText = [
        chalk.bold('💬 开始您的对话体验！'),
        '',
        chalk.gray('输入消息开始对话，或输入 /help 查看帮助。'),
        chalk.gray('尝试输入 /demo 体验布局切换演示。'),
        ''
      ];

      welcomeText.forEach(line => console.log(line));
    } else {
      // 显示最近的消息
      const recentMessages = this.messageHistory.slice(-maxHeight);
      recentMessages.forEach(message => {
        // 简单的消息格式化
        if (message.startsWith('👤 用户:')) {
          console.log(chalk.blue(message));
        } else if (message.startsWith('🤖 助手:')) {
          console.log(chalk.green(message));
        } else if (message.startsWith('ℹ️  系统:')) {
          // 系统消息可能包含格式，需要特殊处理
          const systemContent = message.replace('ℹ️  系统: ', '');
          console.log(systemContent);
        } else {
          console.log(message);
        }
      });
    }
  }

  private renderFooter(width: number): void {
    const shortcuts = '/help /mode /demo /exit';
    const centerText = chalk.gray(`快捷键: ${shortcuts}`);
    const padding = Math.max(0, Math.floor((width - centerText.length) / 2));

    console.log(chalk.gray('·'.repeat(width)));
    console.log(' '.repeat(padding) + centerText);
  }

  public async start(): Promise<void> {
    console.clear();
    this.renderScreen();

    // 显示欢迎信息
    setTimeout(() => {
      this.addSystemMessage(chalk.bold('🎉 欢迎使用 AICLI 混合布局演示版！'));
      this.addSystemMessage('基于文档分析的现代化 CLI 布局设计');
      this.addSystemMessage('输入 /help 开始探索，或 /demo 观看演示');
    }, 500);
  }
}

// 主程序
async function main(): Promise<void> {
  try {
    const demo = new HybridLayoutDemo();
    await demo.start();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error(chalk.red(`❌ 启动失败: ${errorMessage}`));
    process.exit(1);
  }
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ 未捕获异常: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`❌ Promise 拒绝: ${reason}`));
  process.exit(1);
});

// 启动
main();