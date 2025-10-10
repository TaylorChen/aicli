import readline from 'readline';
import chalk from 'chalk';
import { SimpleAIIntegration, SimpleAIConfig } from './simple-ai-integration';

// 定义布局模式
enum FixedLayoutMode {
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  ADAPTIVE = 'adaptive'
}

interface FixedMessageBlock {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
}

/**
 * 修复版混合布局管理器
 * 使用简化的AI集成，确保与大模型正常交互
 */
export class FixedHybridLayout {
  private rl: readline.Interface;
  private messages: FixedMessageBlock[] = [];
  private currentMode: FixedLayoutMode = FixedLayoutMode.ADAPTIVE;
  private isProcessing = false;
  private aiService: SimpleAIIntegration;
  private currentProvider: string = '';

  constructor() {
    // 初始化AI服务
    this.aiService = new SimpleAIIntegration();
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
      const config: SimpleAIConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: deepseekKey
      };
      this.aiService.configure(config);
      this.currentProvider = 'deepseek/deepseek-chat';
    } else if (openaiKey) {
      const config: SimpleAIConfig = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: openaiKey
      };
      this.aiService.configure(config);
      this.currentProvider = 'openai/gpt-3.5-turbo';
    } else if (claudeKey) {
      const config: SimpleAIConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet-20240229',
        apiKey: claudeKey
      };
      this.aiService.configure(config);
      this.currentProvider = 'claude/claude-3-sonnet';
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
      process.stdout.write('\x1b]0;AICLI - Fixed Hybrid Layout\x07');
    }
  }

  private getModePrompt(): string {
    switch (this.currentMode) {
      case FixedLayoutMode.CHAT:
        return '💬 ';
      case FixedLayoutMode.DASHBOARD:
        return '📊 ';
      case FixedLayoutMode.ADAPTIVE:
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
        this.setMode(FixedLayoutMode.CHAT);
        break;
      case 'dashboard':
      case 'dash':
        this.setMode(FixedLayoutMode.DASHBOARD);
        break;
      case 'adaptive':
        this.setMode(FixedLayoutMode.ADAPTIVE);
        break;
      case 'status':
      case 'st':
        this.showStatus();
        break;
      case 'test':
        this.testAIConnection();
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
    const modes = [FixedLayoutMode.CHAT, FixedLayoutMode.DASHBOARD, FixedLayoutMode.ADAPTIVE];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setMode(nextMode);
  }

  
  private getModeName(mode: FixedLayoutMode): string {
    switch (mode) {
      case FixedLayoutMode.CHAT:
        return '聊天模式';
      case FixedLayoutMode.DASHBOARD:
        return '仪表盘模式';
      case FixedLayoutMode.ADAPTIVE:
        return '自适应模式';
      default:
        return '未知模式';
    }
  }

  private showHelp(): void {
    const helpContent = [
      '',
      chalk.bold.blue('📚 AICLI 修复版混合布局 - 帮助信息'),
      chalk.gray('─'.repeat(60)),
      '',
      chalk.bold('🎯 基础命令:'),
      '  /help, /h           - 显示帮助信息',
      '  /clear, /c          - 清空屏幕',
      '  /exit, /q           - 退出程序',
      '  /status, /st        - 显示当前状态',
      '  /test               - 测试AI连接',
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
      chalk.bold('💡 AI交互:'),
      '  🤖 支持真实大模型对话',
      '  📡 自动检测AI服务配置',
      '  🔑 支持DeepSeek、OpenAI、Claude',
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
      `🤖 AI状态: ${this.aiService.isConfigured() ? chalk.green('已连接') : chalk.red('未配置')}`,
      ''
    ];

    if (this.aiService.isConfigured()) {
      statusContent.push(`📡 提供商: ${chalk.blue(this.currentProvider)}`);
      statusContent.push(`🔑 API密钥: ${chalk.green('已配置')}`);
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

  private async testAIConnection(): Promise<void> {
    if (!this.aiService.isConfigured()) {
      this.addSystemMessage(chalk.red('❌ AI服务未配置，无法测试连接'));
      return;
    }

    this.addSystemMessage('🔍 正在测试AI连接...');
    this.isProcessing = true;
    this.render();

    try {
      const isConnected = await this.aiService.testConnection();

      if (isConnected) {
        this.addSystemMessage(chalk.green('✅ AI连接测试成功！'));
        this.addSystemMessage('🤖 AI服务已准备就绪，可以开始对话');
      } else {
        this.addSystemMessage(chalk.red('❌ AI连接测试失败'));
        this.addSystemMessage('请检查API密钥和网络连接');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.addSystemMessage(chalk.red(`❌ 连接测试出错: ${errorMessage}`));
    } finally {
      this.isProcessing = false;
      this.render();
      this.rl.prompt();
    }
  }

  private async processAIMessage(input: string): Promise<void> {
    if (!this.aiService.isConfigured()) {
      this.addSystemMessage(chalk.red('❌ 未配置AI服务，请先设置API密钥'));
      this.addSystemMessage('使用 /status 查看配置信息');
      this.addSystemMessage('使用 /test 测试AI连接');
      this.rl.prompt();
      return;
    }

    this.isProcessing = true;
    this.render();

    try {
      // 显示正在思考的状态
      this.addSystemMessage('🤔 正在思考...');

      // 调用AI服务
      const response = await this.aiService.sendMessage(input, {
        messages: this.getConversationHistory()
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

      // 显示使用统计
      if (response.usage) {
        const statsText = [
          '',
          chalk.gray(`📊 Token使用: ${response.usage.total_tokens || 'N/A'}`),
          chalk.gray(`📡 模型: ${response.model}`)
        ];
        this.addSystemMessage(statsText.join('\n'));
      }

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

  private getConversationHistory(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return this.messages
      .filter(msg => msg.type === 'user' || msg.type === 'assistant')
      .map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
  }

  private addMessage(message: Omit<FixedMessageBlock, 'id'>): void {
    const messageBlock: FixedMessageBlock = {
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

  private getModeIcon(mode: FixedLayoutMode): string {
    switch (mode) {
      case FixedLayoutMode.CHAT:
        return '💬';
      case FixedLayoutMode.DASHBOARD:
        return '📊';
      case FixedLayoutMode.ADAPTIVE:
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
    const title = chalk.bold.blue('🚀 AICLI - 修复版混合布局');
    const subtitle = chalk.gray('✨ 真实AI大模型交互 • 智能布局系统');
    const padding = Math.max(0, Math.floor((width - title.length) / 2));

    console.log(' '.repeat(padding) + title);
    console.log(' '.repeat(Math.max(0, padding - 5)) + subtitle);
    console.log(chalk.gray('─'.repeat(width)));
  }

  private renderModeIndicator(): void {
    const width = process.stdout.columns || 80;
    const icon = this.getModeIcon(this.currentMode);
    const name = chalk.cyan(this.getModeName(this.currentMode));
    let status = this.aiService.isConfigured() ?
      chalk.green(`🤖 ${this.currentProvider}`) :
      chalk.red('❌ 未配置AI服务');

    if (this.isProcessing) {
      status = status + chalk.yellow(' ⚡ 处理中...');
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
        chalk.bold('💬 欢迎使用 AICLI 修复版混合布局！'),
        '',
        chalk.green('🤖 支持真实AI大模型对话'),
        chalk.blue('📱 智能布局切换，提供最佳体验'),
        '',
        chalk.gray('🔍 检测到的AI服务:') + (this.aiService.isConfigured() ?
          chalk.green(` ${this.currentProvider}`) :
          chalk.red(' 无配置')),
        '',
        chalk.gray('💬 直接输入消息开始对话，或输入 /help 查看帮助。'),
        ''
      ];

      welcomeText.forEach(line => console.log(line));
    } else {
      // 显示最近的消息
      const recentMessages = this.messages.slice(-maxHeight);
      recentMessages.forEach(message => {
        const prefix = this.getMessagePrefix(message.type);
        let colorFunc: (text: string) => string;
        switch (message.type) {
          case 'user':
            colorFunc = chalk.blue;
            break;
          case 'assistant':
            colorFunc = chalk.green;
            break;
          case 'system':
            colorFunc = chalk.cyan;
            break;
          case 'error':
            colorFunc = chalk.red;
            break;
          default:
            colorFunc = chalk.white;
        }
        console.log(`${colorFunc(prefix)} ${message.content}`);
      });
    }
  }

  private getMessagePrefix(type: FixedMessageBlock['type']): string {
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

  
  private renderFooter(): void {
    const width = process.stdout.columns || 80;
    const shortcuts = '/help /mode /status /test /exit';
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

  public setMode(mode: FixedLayoutMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.rl.setPrompt(this.getModePrompt());

    this.addSystemMessage(`🔄 切换到${this.getModeName(mode)}`);
    this.render();
  }

  public getMode(): FixedLayoutMode {
    return this.currentMode;
  }

  public async start(): Promise<void> {
    console.clear();
    this.render();

    // 显示欢迎信息
    setTimeout(() => {
      this.addSystemMessage(chalk.bold('🎉 欢迎使用 AICLI 修复版混合布局！'));

      if (this.aiService.isConfigured()) {
        this.addSystemMessage(chalk.green(`🤖 已连接到 ${this.currentProvider}`));
        this.addSystemMessage('💬 直接输入消息开始与AI对话');
        this.addSystemMessage('🔍 使用 /test 测试AI连接');
      } else {
        this.addSystemMessage(chalk.yellow('⚠️ 未检测到AI服务配置'));
        this.addSystemMessage('💡 请设置 API 密钥后重新启动');
        this.addSystemMessage('🔑 支持的环境变量: DEEPSEEK_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY');
      }

      this.addSystemMessage('📚 输入 /help 查看所有可用命令');
    }, 500);

    this.rl.prompt();
  }
}