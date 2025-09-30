import { EventEmitter } from 'events';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import * as inquirer from 'inquirer';
import { config } from '../config';
import { AIService } from '../services/ai';
import { ChatMessage } from '../types';

export interface InteractionOptions {
  enableHistory?: boolean;
  maxHistorySize?: number;
  enableAutoComplete?: boolean;
  enableKeyBindings?: boolean;
  theme?: 'light' | 'dark';
}

export interface CommandContext {
  input: string;
  timestamp: Date;
  session: any;
  history: string[];
}

export interface InteractionEvent {
  type: 'input' | 'command' | 'response' | 'error' | 'exit';
  data: any;
  timestamp: Date;
}

export class InteractionEngine extends EventEmitter {
  private options: Required<InteractionOptions>;
  private isRunning = false;
  private inputHistory: string[] = [];
  private historyIndex = -1;
  private currentInput = '';
  private aiService: AIService | null = null;
  private spinner: any | null = null;
  private sessionState: any = null;

  constructor(options: InteractionOptions = {}) {
    super();

    this.options = {
      enableHistory: options.enableHistory ?? true,
      maxHistorySize: options.maxHistorySize ?? 1000,
      enableAutoComplete: options.enableAutoComplete ?? true,
      enableKeyBindings: options.enableKeyBindings ?? true,
      theme: options.theme ?? 'dark',
      ...options
    };

    this.initializeAIService();
    this.setupEventHandlers();
  }

  private getPrompt(): string {
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return chalk.green(`${timestamp}> `);
  }

  private initializeAIService(): void {
    try {
      const currentProvider = config.getCurrentProvider();
      if (currentProvider) {
        const apiKey = process.env[currentProvider.apiKeyEnvVar];
        if (apiKey) {
          this.aiService = new AIService(currentProvider, apiKey);
        }
      }
    } catch (error) {
      this.emit('error', { type: 'ai_service_init_failed', error });
    }
  }

  private setupEventHandlers(): void {
    // 窗口大小变化
    process.stdout.on('resize', () => {
      this.emit('resize', { width: process.stdout.columns, height: process.stdout.rows });
    });

    // 进程异常处理
    process.on('uncaughtException', (error) => {
      this.emit('error', { type: 'uncaught_exception', error });
      this.gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.emit('error', { type: 'unhandled_rejection', reason, promise });
      this.gracefulShutdown();
    });
  }

  private async handleLineInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    // 记录输入历史
    this.addToHistory(input);

    const context: CommandContext = {
      input: trimmed,
      timestamp: new Date(),
      session: this.sessionState,
      history: this.inputHistory
    };

    this.emit('interaction', {
      type: 'input',
      data: context,
      timestamp: new Date()
    } as InteractionEvent);

    try {
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed.substring(1), context);
      } else {
        await this.handleMessage(trimmed, context);
      }
    } catch (error) {
      this.emit('interaction', {
        type: 'error',
        data: { input: trimmed, error },
        timestamp: new Date()
      } as InteractionEvent);
    }
  }

  private async handleCommand(command: string, context: CommandContext): Promise<void> {
    const [cmd, ...args] = command.toLowerCase().split(' ');

    this.emit('interaction', {
      type: 'command',
      data: { command: cmd, args, context },
      timestamp: new Date()
    } as InteractionEvent);

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'exit':
      case 'quit':
        this.gracefulShutdown();
        break;
      case 'clear':
        this.clearScreen();
        break;
      case 'history':
        this.showHistory();
        break;
      case 'status':
        this.showStatus();
        break;
      case 'config':
        await this.showConfig();
        break;
      case 'tools':
        this.showTools();
        break;
      case 'sessions':
        this.showSessions();
        break;
      default:
        this.emit('unknown_command', { command, args, context });
        process.stdout.write(chalk.yellow(`未知命令: /${cmd}\n`));
    }
  }

  private async handleMessage(message: string, context: CommandContext): Promise<void> {
    if (!this.aiService) {
      process.stdout.write(chalk.yellow('AI服务未配置\n'));
      return;
    }

    this.showLoading('正在思考...');

    try {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: message,
          timestamp: new Date()
        }
      ];

      // 流式响应处理
      const response = await this.aiService.sendMessage(messages);

      this.hideLoading();

      // 流式输出
      await this.streamResponse(response.content);

      this.emit('interaction', {
        type: 'response',
        data: { message, response, context },
        timestamp: new Date()
      } as InteractionEvent);

    } catch (error) {
      this.hideLoading();

      const errorMsg = `AI服务调用失败: ${error instanceof Error ? error.message : '未知错误'}`;
      process.stdout.write(chalk.red(errorMsg + '\n'));

      this.emit('interaction', {
        type: 'error',
        data: { message, error, context },
        timestamp: new Date()
      } as InteractionEvent);
    }
  }

  private async streamResponse(content: string): Promise<void> {
    try {
      // 模拟流式输出效果
      const words = content.split('');
      for (let i = 0; i < words.length; i++) {
        process.stdout.write(chalk.blue(words[i]));
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 5));
      }
      process.stdout.write('\n');
    } catch (error) {
      // 忽略输出错误
    }
  }

  private handleKeyPress(key: Buffer): void {
    const str = key.toString();

    // Escape 键中断当前操作
    if (str === '\x1b') {
      if (this.spinner?.isSpinning) {
        this.hideLoading();
        process.stdout.write(chalk.yellow('\n操作已中断\n'));
      }
    }

    // Ctrl+C
    if (str === '\x03') {
      this.handleInterrupt();
    }
  }

  private handleInterrupt(): void {
    this.emit('interaction', {
      type: 'exit',
      data: { reason: 'user_interrupt' },
      timestamp: new Date()
    } as InteractionEvent);

    this.gracefulShutdown();
  }

  private gracefulShutdown(): void {
    try {
      this.isRunning = false;
      this.hideLoading();
      process.stdout.write(chalk.yellow('\n👋 再见！\n'));
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  }

  private completer(line: string): [string[], string] {
    const commands = ['help', 'exit', 'quit', 'clear', 'history', 'status', 'config', 'tools', 'sessions'];
    const matches = commands.filter(cmd => cmd.startsWith(line));
    return [matches.length ? matches : commands, line];
  }

  private addToHistory(input: string): void {
    if (this.options.enableHistory) {
      this.inputHistory.push(input);

      // 限制历史记录大小
      if (this.inputHistory.length > this.options.maxHistorySize) {
        this.inputHistory = this.inputHistory.slice(-this.options.maxHistorySize);
      }
    }
  }

  private showLoading(message: string = '处理中...'): void {
    this.spinner = ora(message).start();
  }

  private hideLoading(): void {
    if (this.spinner?.isSpinning) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  private showHelp(): void {
    const helpText = `
${chalk.cyan('📚 可用命令:')}
${chalk.white('  /help      - 显示此帮助信息')}
${chalk.white('  /exit      - 退出程序')}
${chalk.white('  /clear     - 清空屏幕')}
${chalk.white('  /history   - 显示输入历史')}
${chalk.white('  /status    - 显示系统状态')}
${chalk.white('  /config    - 显示配置信息')}
${chalk.white('  /tools     - 显示可用工具')}
${chalk.white('  /sessions  - 显示会话信息')}

${chalk.yellow('💡 快捷键:')}
${chalk.white('  Ctrl+C     - 退出程序')}
${chalk.white('  Esc        - 中断当前操作')}
${chalk.white('  Tab        - 自动补全命令')}
${chalk.white('  ↑/↓        - 浏览历史输入')}
`;
    process.stdout.write(helpText + '\n');
  }

  private showHistory(): void {
    if (!this.options.enableHistory || this.inputHistory.length === 0) {
      process.stdout.write(chalk.yellow('暂无输入历史\n'));
      return;
    }

    process.stdout.write(chalk.cyan('📝 输入历史:\n'));
    this.inputHistory.slice(-10).forEach((input, index) => {
      process.stdout.write(chalk.white(`  ${index + 1}. ${input}\n`));
    });
  }

  private showStatus(): void {
    const status = {
      aiService: this.aiService ? '✅ 已配置' : '❌ 未配置',
      history: `${this.inputHistory.length} 条记录`,
      theme: this.options.theme,
      uptime: process.uptime()
    };

    process.stdout.write(chalk.cyan('📊 系统状态:\n'));
    Object.entries(status).forEach(([key, value]) => {
      process.stdout.write(chalk.white(`  ${key}: ${value}\n`));
    });
  }

  private async showConfig(): Promise<void> {
    const currentProvider = config.getCurrentProvider();
    process.stdout.write(chalk.cyan('⚙️  配置信息:\n'));

    if (currentProvider) {
      process.stdout.write(chalk.white(`  提供商: ${currentProvider.name}\n`));
      process.stdout.write(chalk.white(`  模型: ${config.get('currentModel')}\n`));
      process.stdout.write(chalk.white(`  API URL: ${currentProvider.baseUrl}\n`));
    } else {
      process.stdout.write(chalk.yellow('  未配置AI提供商\n'));
    }
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
    this.emit('screen_cleared');
  }

  private showTools(): void {
    const tools = [
      { name: 'web_search', description: 'Web搜索功能', status: '✅' },
      { name: 'execute_code', description: '代码执行', status: '✅' },
      { name: 'analyze_file', description: '文件分析', status: '✅' },
      { name: 'process_image', description: '图像处理', status: '✅' },
      { name: 'project_operation', description: '项目管理', status: '✅' }
    ];

    process.stdout.write(chalk.cyan('🛠️  可用工具:\n'));
    tools.forEach(tool => {
      process.stdout.write(chalk.white(`  ${tool.status} ${tool.name} - ${tool.description}\n`));
    });
  }

  private showSessions(): void {
    process.stdout.write(chalk.cyan('📝 会话管理:\n'));
    process.stdout.write(chalk.yellow('  当前无活跃会话\n'));
    process.stdout.write(chalk.white('  使用 /help 查看更多命令\n'));
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.emit('started');
  }

  public async processInput(input: string): Promise<void> {
    // 调用handleLineInput方法并等待完成
    await this.handleLineInput(input);
  }

  public stop(): void {
    this.gracefulShutdown();
  }

  public getSessionState(): any {
    return this.sessionState;
  }

  public setSessionState(state: any): void {
    this.sessionState = state;
  }
}