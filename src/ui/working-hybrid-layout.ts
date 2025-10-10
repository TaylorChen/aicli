import readline from 'readline';
import chalk from 'chalk';
import { config } from '../config';
import { EnhancedAIService } from '../core/enhanced-ai-service';

// 定义本地布局模式，避免复杂依赖
enum WorkingLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

interface WorkingMessageBlock {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
}

interface AIProvider {
  name: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * 可工作的混合布局管理器
 * 专注于与大模型的实际交互
 */
export class WorkingHybridLayout {
  private rl: readline.Interface;
  private messages: WorkingMessageBlock[] = [];
  private currentMode: WorkingLayoutMode = WorkingLayoutMode.ADAPTIVE;
  private isProcessing = false;
  private aiService: EnhancedAIService;
  private currentProvider: AIProvider | null = null;

  constructor() {
    // 初始化AI服务
    this.aiService = new EnhancedAIService();
    this.initializeAIProvider();

    // 配置readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getModePrompt()
    });

    this.setupEventListeners();
    this.updateTerminalSettings();
  }

  private initializeAIProvider(): void {
    // 尝试从环境变量获取API配置
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    if (deepseekKey) {
      this.currentProvider = {
        name: 'deepseek',
        model: 'deepseek-chat',
        apiKey: deepseekKey
      };
    } else if (openaiKey) {
      this.currentProvider = {
        name: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: openaiKey
      };
    } else if (claudeKey) {
      this.currentProvider = {
        name: 'claude',
        model: 'claude-3-sonnet-20240229',
        apiKey: claudeKey
      };
    }
  }

  private setupEventListeners(): void {
    this.rl.on('line', this.handleUserInput.bind(this));
    process.on('SIGINT', this.handleInterrupt.bind(this));
    process.stdout.on('resize', this.handleResize.bind(this));
    process.on('exit', () => this.cleanup());
  }

  private updateTerminalSettings(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b]0;AICLI - Working Hybrid Layout\x07');
    }
  }

  private getModePrompt(): string {
    switch (this.currentMode) {
      case WorkingLayoutMode.CHAT:
        return '💬 ';
      case WorkingLayoutMode.DASHBOARD:
        return '📊 ';
      case WorkingLayoutMode.ADAPTIVE:
      default:
        return '🤖 ';
    }
  }

  private handleUserInput(input: string): void {
    input = input.trim();
    if (!input) {
      this.rl.prompt();
      return;
    }

    if (this.isProcessing) {
      this.addSystemMessage('⏳ 正在处理上一个请求，请稍候...');
      return;
    }

    // 添加用户消息
    this.addMessage({
      type: 'user',
      content: input,
      timestamp: new Date()
    });

    // 处理命令
    if (input.startsWith('/')) {
      this.handleCommand(input);
      return;
    }

    // 处理AI对话
    this.processAIMessage(input);
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
        this.messages = [];
        this.render();
        break;
      case 'mode':
        this.switchMode();
        break;
      case 'chat':
        this.setMode(WorkingLayoutMode.CHAT);
        break;
      case 'dashboard':
      case 'dash':
        this.setMode(WorkingLayoutMode.DASHBOARD);
        break;
      case 'adaptive':
        this.setMode(WorkingLayoutMode.ADAPTIVE);
        break;
      case 'status':
      case 'st':
        this.showStatus();
        break;
      case 'provider':
        this.showProviderInfo();
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
    const modes = [WorkingLayoutMode.CHAT, WorkingLayoutMode.DASHBOARD, WorkingLayoutMode.ADAPTIVE];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setMode(nextMode);
  }

  
  private getModeName(mode: WorkingLayoutMode): string {
    switch (mode) {
      case WorkingLayoutMode.CHAT:
        return '聊天模式';
      case WorkingLayoutMode.DASHBOARD:
        return '仪表盘模式';
      case WorkingLayoutMode.ADAPTIVE:
        return '自适应模式';
      default:
        return '未知模式';
    }
  }

  private showHelp(): void {
    const helpContent = [
      '',
      chalk.bold.blue('📚 AICLI 混合布局 - 帮助信息'),
      chalk.gray('─'.repeat(60)),
      '',
      chalk.bold('🎯 基础命令:'),
      '  /help, /h           - 显示帮助信息',
      '  /clear, /c          - 清空屏幕',
      '  /exit, /q           - 退出程序',
      '  /status, /st        - 显示当前状态',
      '  /provider           - 显示AI提供商信息',
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
      `${chalk.green('💬 聊天模式')}: 流式对话，适合长篇交流`,
      `${chalk.cyan('📊 仪表盘模式')}: 结构化显示，适合任务监控`,
      `${chalk.yellow('🤖 自适应模式')}: 智能切换，最佳用户体验`,
      '',
      chalk.gray('💬 直接输入消息开始与AI对话'),
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
      `📝 消息历史: ${this.messages.length} 条`,
      `⚡ 处理状态: ${this.isProcessing ? chalk.yellow('进行中') : chalk.green('空闲')}`,
      '',
      `🖥️  终端尺寸: ${process.stdout.columns} × ${process.stdout.rows}`,
      '',
      `🤖 AI状态: ${this.currentProvider ? chalk.green('已连接') : chalk.red('未配置')}`,
      ''
    ];

    if (this.currentProvider) {
      statusContent.push(`📡 提供商: ${this.currentProvider.name}`);
      statusContent.push(`🧠 模型: ${this.currentProvider.model}`);
      statusContent.push(`🔑 API密钥: ${this.currentProvider.apiKey ? '已配置' : '未配置'}`);
    } else {
      statusContent.push(chalk.red('❌ 未找到AI服务配置'));
      statusContent.push('');
      statusContent.push('💡 请设置环境变量:');
      statusContent.push('   export DEEPSEEK_API_KEY=your_key');
      statusContent.push('   export OPENAI_API_KEY=your_key');
      statusContent.push('   export CLAUDE_API_KEY=your_key');
    }

    this.addSystemMessage(statusContent.join('\n'));
  }

  private showProviderInfo(): void {
    if (!this.currentProvider) {
      this.addSystemMessage(chalk.red('❌ 未配置AI提供商'));
      this.addSystemMessage('请设置以下环境变量之一：');
      this.addSystemMessage('- DEEPSEEK_API_KEY');
      this.addSystemMessage('- OPENAI_API_KEY');
      this.addSystemMessage('- CLAUDE_API_KEY');
      return;
    }

    const providerInfo = [
      '',
      chalk.bold('🤖 AI提供商信息'),
      chalk.gray('─'.repeat(40)),
      '',
      `📡 提供商: ${chalk.cyan(this.currentProvider.name)}`,
      `🧠 模型: ${chalk.blue(this.currentProvider.model)}`,
      `🔑 API密钥: ${chalk.green('已配置')}`,
      `📊 状态: ${chalk.green('连接正常')}`,
      ''
    ];

    this.addSystemMessage(providerInfo.join('\n'));
  }

  private async processAIMessage(input: string): Promise<void> {
    if (!this.currentProvider) {
      this.addSystemMessage(chalk.red('❌ 未配置AI服务，请先设置API密钥'));
      this.addSystemMessage('使用 /provider 查看配置信息');
      this.rl.prompt();
      return;
    }

    this.isProcessing = true;
    this.render();

    try {
      // 配置AI服务
      await this.aiService.configure({
        provider: this.currentProvider.name as any,
        apiKey: this.currentProvider.apiKey,
        model: this.currentProvider.model,
        baseUrl: this.currentProvider.baseUrl
      });

      // 显示正在思考的状态
      this.addSystemMessage('🤔 正在思考...');

      // 调用AI服务
      const response = await this.aiService.sendMessage(input, {
        messages: this.getConversationHistory(),
        stream: false
      });

      // 移除"正在思考"消息
      if (this.messages.length > 0 && this.messages[this.messages.length - 1].type === 'system') {
        this.messages.pop();
      }

      // 添加AI回复
      this.addMessage({
        type: 'assistant',
        content: response.content || '抱歉，我无法生成回复。',
        timestamp: new Date()
      });

    } catch (error) {
      // 移除"正在思考"消息
      if (this.messages.length > 0 && this.messages[this.messages.length - 1].type === 'system') {
        this.messages.pop();
      }

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.addMessage({
        type: 'error',
        content: `❌ AI服务错误: ${errorMessage}`,
        timestamp: new Date()
      });
    } finally {
      this.isProcessing = false;
      this.render();
      this.rl.prompt();
    }
  }

  private getConversationHistory(): Array<{ role: string; content: string }> {
    return this.messages
      .filter(msg => msg.type === 'user' || msg.type === 'assistant')
      .map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
  }

  private addMessage(message: Omit<WorkingMessageBlock, 'id'>): void {
    const messageBlock: WorkingMessageBlock = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.messages.push(messageBlock);

    // 限制消息历史长度
    if (this.messages.length > 50) {
      this.messages = this.messages.slice(-30);
    }

    this.render();
  }

  private addSystemMessage(content: string): void {
    this.addMessage({
      type: 'system',
      content,
      timestamp: new Date()
    });
  }

  private getModeIcon(mode: WorkingLayoutMode): string {
    switch (mode) {
      case WorkingLayoutMode.CHAT:
        return '💬';
      case WorkingLayoutMode.DASHBOARD:
        return '📊';
      case WorkingLayoutMode.ADAPTIVE:
        return '🤖';
      default:
        return '❓';
    }
  }

  private render(): void {
    console.clear();

    // 渲染顶部标题
    this.renderHeader();

    // 渲染模式指示器
    this.renderModeIndicator();

    // 渲染消息区域
    this.renderMessageArea();

    // 渲染底部状态栏
    this.renderFooter();
  }

  private renderHeader(): void {
    const width = process.stdout.columns || 80;
    const title = chalk.bold.blue('🚀 AICLI - 混合布局版本');
    const subtitle = chalk.gray('智能AI编程助手 - 支持真实大模型交互');
    const padding = Math.max(0, Math.floor((width - title.length) / 2));

    console.log(' '.repeat(padding) + title);
    console.log(' '.repeat(Math.max(0, padding - 5)) + subtitle);
    console.log(chalk.gray('─'.repeat(width)));
  }

  private renderModeIndicator(): void {
    const width = process.stdout.columns || 80;
    const icon = this.getModeIcon(this.currentMode);
    const name = chalk.cyan(this.getModeName(this.currentMode));
    const status = this.currentProvider ?
      chalk.green(`🤖 ${this.currentProvider.name}/${this.currentProvider.model}`) :
      chalk.red('❌ 未配置AI服务');

    if (this.isProcessing) {
      status += chalk.yellow(' ⚡ 处理中...');
    }

    const leftText = `${icon} 当前模式: ${name}`;
    const padding = width - leftText.length - status.length - 4;

    console.log(leftText + ' '.repeat(Math.max(0, padding)) + status);
    console.log(chalk.gray('·'.repeat(width)));
  }

  private renderMessageArea(): void {
    const maxHeight = Math.max(5, process.stdout.rows - 8);

    if (this.messages.length === 0) {
      const welcomeText = [
        chalk.bold('💬 欢迎使用 AICLI 混合布局！'),
        '',
        chalk.gray('🤖 支持与真实AI大模型对话'),
        chalk.gray('📱 智能布局切换，提供最佳体验'),
        '',
        chalk.gray('直接输入消息开始对话，或输入 /help 查看帮助。'),
        ''
      ];

      welcomeText.forEach(line => console.log(line));
    } else {
      // 显示最近的消息
      const recentMessages = this.messages.slice(-maxHeight);
      recentMessages.forEach(message => {
        const prefix = this.getMessagePrefix(message.type);
        const color = this.getMessageColor(message.type);
        console.log(`${color(prefix)} ${message.content}`);
      });
    }
  }

  private getMessagePrefix(type: WorkingMessageBlock['type']): string {
    switch (type) {
      case 'user':
        return '👤 用户:';
      case 'assistant':
        return '🤖 助手:';
      case 'system':
        return 'ℹ️  系统:';
      case 'error':
        return '❌ 错误:';
      default:
        return '📝 消息:';
    }
  }

  private getMessageColor(type: WorkingMessageBlock['type']): typeof chalk {
    switch (type) {
      case 'user':
        return chalk.blue;
      case 'assistant':
        return chalk.green;
      case 'system':
        return chalk.cyan;
      case 'error':
        return chalk.red;
      default:
        return chalk.white;
    }
  }

  private renderFooter(): void {
    const width = process.stdout.columns || 80;
    const shortcuts = '/help /mode /status /provider /exit';
    const centerText = chalk.gray(`快捷键: ${shortcuts}`);
    const padding = Math.max(0, Math.floor((width - centerText.length) / 2));

    console.log(chalk.gray('·'.repeat(width)));
    console.log(' '.repeat(padding) + centerText);
  }

  private handleInterrupt(): void {
    if (this.isProcessing) {
      this.isProcessing = false;
      this.addSystemMessage(chalk.yellow('⚠️ 操作已取消'));
      this.rl.prompt();
    } else {
      this.handleExit();
    }
  }

  private handleResize(): void {
    this.render();
  }

  private handleExit(): void {
    console.log(chalk.yellow('\n👋 再见! 感谢使用 AICLI 混合布局'));
    this.cleanup();
    process.exit(0);
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
    }
  }

  public setMode(mode: WorkingLayoutMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.rl.setPrompt(this.getModePrompt());

    this.addSystemMessage(`🔄 切换到${this.getModeName(mode)}`);
    this.render();
  }

  public getMode(): WorkingLayoutMode {
    return this.currentMode;
  }

  public async start(): Promise<void> {
    console.clear();
    this.render();

    // 显示欢迎信息
    setTimeout(() => {
      if (this.currentProvider) {
        this.addSystemMessage(chalk.bold('🎉 欢迎使用 AICLI 混合布局！'));
        this.addSystemMessage(`🤖 已连接到 ${this.currentProvider.name}/${this.currentProvider.model}`);
        this.addSystemMessage('💬 直接输入消息开始与AI对话');
      } else {
        this.addSystemMessage(chalk.bold('🎉 欢迎使用 AICLI 混合布局！'));
        this.addSystemMessage(chalk.yellow('⚠️ 未检测到AI服务配置'));
        this.addSystemMessage('💡 请设置 API 密钥后重新启动，或使用 /provider 查看配置说明');
      }
      this.addSystemMessage('📚 输入 /help 查看所有可用命令');
    }, 500);

    this.rl.prompt();
  }
}