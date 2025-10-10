import readline from 'readline';
import chalk from 'chalk';

// 定义本地布局模式，避免循环依赖
enum SimpleLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

/**
 * 简化版混合布局管理器
 * 专注于兼容性和基本功能
 */
export class SimpleHybridLayout {
  private rl: readline.Interface;
  private messages: string[] = [];
  private currentMode: SimpleLayoutMode = SimpleLayoutMode.ADAPTIVE;
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
    if (!input) return;

    this.messages.push(`👤 用户: ${input}`);
    this.render();

    if (input.startsWith('/')) {
      this.handleCommand(input);
      return;
    }

    this.processMessage(input);
  }

  private handleCommand(input: string): void {
    const command = input.slice(1);

    switch (command) {
      case 'help':
      case 'h':
        this.showHelp();
        break;
      case 'clear':
      case 'c':
        this.messages = [];
        this.render();
        break;
      case 'mode':
        this.switchMode();
        break;
      case 'exit':
      case 'q':
        this.handleExit();
        break;
      default:
        this.messages.push(`❓ 未知命令: ${command}`);
        this.render();
    }
  }

  private switchMode(): void {
    const modes = [SimpleLayoutMode.CHAT, SimpleLayoutMode.DASHBOARD, SimpleLayoutMode.ADAPTIVE];
    const currentIndex = modes.indexOf(this.currentMode);
    this.currentMode = modes[(currentIndex + 1) % modes.length];

    this.messages.push(`🔄 切换到${this.getModeName(this.currentMode)}`);
    this.render();
  }

  private getModeName(mode: SimpleLayoutMode): string {
    switch (mode) {
      case SimpleLayoutMode.CHAT:
        return '聊天模式';
      case SimpleLayoutMode.DASHBOARD:
        return '仪表盘模式';
      case SimpleLayoutMode.ADAPTIVE:
        return '自适应模式';
      default:
        return '未知模式';
    }
  }

  private showHelp(): void {
    const helpText = [
      '📚 可用命令:',
      '',
      '🔧 基础命令:',
      '   /help, /h     - 显示帮助',
      '   /clear, /c    - 清空屏幕',
      '   /exit, /q     - 退出程序',
      '',
      '🎨 布局控制:',
      '   /mode         - 切换布局模式',
      '',
      '⌨️  快捷键:',
      '   Ctrl+L        - 切换布局模式',
      '   Ctrl+C        - 退出程序',
      '',
      '💡 布局模式:',
      '   💬 Chat        - 流式聊天布局',
      '   📊 Dashboard   - 仪表盘布局',
      '   🤖 Adaptive    - 自适应布局'
    ];

    this.messages.push(helpText.join('\n'));
    this.render();
  }

  private async processMessage(input: string): Promise<void> {
    this.isProcessing = true;
    this.messages.push('🤔 正在思考...');
    this.render();

    // 模拟AI回复
    setTimeout(() => {
      this.messages.pop(); // 移除"正在思考"
      this.messages.push(`🤖 助手: 您刚才说: "${input}"`);
      this.messages.push('');
      this.messages.push(`📊 当前模式: ${this.getModeName(this.currentMode)}`);
      this.messages.push('💡 这是一个演示版本，完整功能需要配置AI服务');
      this.messages.push('');
      this.isProcessing = false;
      this.render();
      this.rl.prompt();
    }, 1000);
  }

  private handleResize(): void {
    this.render();
  }

  private handleExit(): void {
    console.log(chalk.yellow('\n👋 再见!'));
    this.cleanup();
    process.exit(0);
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
    }
  }

  private render(): void {
    console.clear();

    // 显示标题
    console.log(chalk.bold.blue('🚀 AICLI - 混合布局演示版'));
    console.log(chalk.gray('─'.repeat(50)));

    // 显示模式指示
    const modeIcon = this.getModeIcon(this.currentMode);
    const modeText = this.getModeName(this.currentMode);
    console.log(`${modeIcon} 当前模式: ${chalk.cyan(modeText)}`);

    if (this.isProcessing) {
      console.log(chalk.yellow('⚡ 处理中...'));
    }

    console.log(chalk.gray('─'.repeat(50)));

    // 显示消息历史
    this.messages.forEach(message => {
      console.log(message);
    });

    // 显示提示符
    this.rl.prompt();
  }

  private getModeIcon(mode: SimpleLayoutMode): string {
    switch (mode) {
      case SimpleLayoutMode.CHAT:
        return '💬';
      case SimpleLayoutMode.DASHBOARD:
        return '📊';
      case SimpleLayoutMode.ADAPTIVE:
        return '🤖';
      default:
        return '❓';
    }
  }

  public setMode(mode: SimpleLayoutMode): void {
    this.currentMode = mode;
    this.messages.push(`🔄 切换到${this.getModeName(mode)}`);
    this.render();
  }

  public getMode(): SimpleLayoutMode {
    return this.currentMode;
  }

  public async start(): Promise<void> {
    console.clear();

    // 显示欢迎信息
    const welcomeContent = [
      '',
      chalk.bold.blue('🚀 欢迎使用 AICLI - 混合布局演示版'),
      chalk.gray('现代化AI编程助手终端工具'),
      '',
      chalk.bold('✨ 功能特性:'),
      '  🤖 多模态AI对话 (文本 + 图片 + 文档)',
      '  📱 自适应布局系统 (聊天 + 仪表盘)',
      '  📎 智能附件管理 (拖拽 + 剪贴板)',
      '  🔧 强大的工具系统 (文件 + 命令 + 搜索)',
      '',
      chalk.bold('🎨 布局模式:'),
      '  💬 聊天模式 - 流式对话界面',
      '  📊 仪表盘模式 - 结构化状态显示',
      '  🤖 自适应模式 - 智能切换布局',
      '',
      chalk.bold('⌨️  快捷键:'),
      '  /mode         - 切换布局模式',
      '  /help         - 显示帮助',
      '  /clear        - 清空屏幕',
      '  /exit         - 退出程序',
      '',
      chalk.gray('开始输入消息来与AI对话...'),
      ''
    ];

    welcomeContent.forEach(line => console.log(line));

    // 显示提示符
    this.rl.prompt();
  }
}