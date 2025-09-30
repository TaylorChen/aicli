import { EventEmitter } from 'events';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import * as figlet from 'figlet';
import gradient from 'gradient-string';
import { config } from '../config';
import { AIService } from '../services/ai';
import { ChatMessage } from '../types';
import { InteractionEngine, InteractionOptions, CommandContext, InteractionEvent } from '../core/interaction-engine';
import { OutputProcessor, OutputOptions, FormattedOutput } from '../core/output-processor';
import { ToolIntegration, ToolExecutionOptions } from '../core/tool-integration';
import { MultilineInputProcessor, MultilineInputOptions } from '../core/multiline-input';
import { ScreenshotPasteHandler, ScreenshotPasteOptions } from '../core/screenshot-paste-handler';

export interface ModernCLIOptions {
  theme?: 'claude' | 'qorder' | 'auto';
  showSidebar?: boolean;
  showStatusBar?: boolean;
  enableAnimations?: boolean;
  enableScreenshotPaste?: boolean;
}

export interface SessionInfo {
  id: string;
  title?: string;
  model: string;
  provider: string;
  messages: number;
  tokens?: number;
  startTime: Date;
}

export interface ToolStatus {
  name: string;
  category: string;
  status: 'ready' | 'running' | 'error' | 'disabled';
  description?: string;
}

export class ModernCLIInterface extends EventEmitter {
  private rl: readline.Interface;
  private options: ModernCLIOptions;
  private currentSession: SessionInfo | null = null;
  private toolStatuses: Map<string, ToolStatus> = new Map();
  private isRunning = false;
  private spinner: any | null = null;
  public messageHistory: Array<{ type: 'user' | 'ai'; content: string; timestamp: Date }> = [];
  private aiService: AIService | null = null;

  // 渲染防抖机制
  private renderTimeout: NodeJS.Timeout | null = null;
  private lastRenderTime: number = 0;

  // 新的事件驱动架构组件
  private interactionEngine!: InteractionEngine;
  private outputProcessor!: OutputProcessor;
  private toolIntegration!: ToolIntegration;
  private multilineInput!: MultilineInputProcessor;
  private screenshotPasteHandler!: ScreenshotPasteHandler;
  private pendingInputs: string[] = [];
  private isProcessing = false;

  constructor(options: ModernCLIOptions = {}) {
    super();

    this.options = {
      theme: options.theme || 'auto',
      showSidebar: options.showSidebar !== false,
      showStatusBar: options.showStatusBar !== false,
      enableAnimations: options.enableAnimations !== false,
      enableScreenshotPaste: options.enableScreenshotPaste !== false,
      ...options
    };

    // 初始化新的事件驱动架构组件
    this.interactionEngine = new InteractionEngine({
      enableHistory: true,
      maxHistorySize: 1000,
      enableAutoComplete: true,
      enableKeyBindings: true,
      theme: 'dark'
    });

    this.outputProcessor = new OutputProcessor({
      enableColors: true,
      enableMarkdown: true,
      enableStreaming: true,
      streamDelay: 10,
      maxLineWidth: process.stdout.columns || 80
    });

    this.toolIntegration = new ToolIntegration();

    // 初始化截图粘贴处理器
    if (this.options.enableScreenshotPaste) {
      this.screenshotPasteHandler = new ScreenshotPasteHandler({
        enableCtrlV: true,
        enableAutoDetect: false, // 暂时关闭自动检测避免性能问题
        maxFileSize: 10 // MB
      });
    }

    this.multilineInput = new MultilineInputProcessor({
      enableFileDrop: true,
      maxLines: 1000,
      indentSize: 2,
      enableSyntaxHighlight: true,
      editorPrompt: '📝 多行编辑器'
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this)
    });

    this.initializeAIService();
    this.setupEventHandlers();
    this.setupInteractionEngine();
    this.setupMultilineInput();
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
      // 使用process.stderr.write避免干扰readline
      process.stderr.write('AI服务初始化失败: ' + (error instanceof Error ? error.message : error) + '\n');
    }
  }

  private setupEventHandlers(): void {
    // 退出处理函数 - 确保总是可用
    const handleExit = () => {
      try {
        // 停止交互引擎
        this.interactionEngine.stop();

        // 清理readline
        if (this.rl) {
          this.rl.close();
        }

        // 显示告别消息
        process.stdout.write('\n' + chalk.yellow('👋 再见！') + '\n');
      } catch (e) {
        // 忽略所有错误
      } finally {
        process.exit(0);
      }
    };

    // 处理Ctrl+C (SIGINT) - 多层保护
    // 1. readline层面
    this.rl.on('SIGINT', handleExit);

    // 2. 进程层面 - 使用once避免重复触发
    process.once('SIGINT', handleExit);

    // 3. 备用处理 - 监听所有可能的信号
    process.once('SIGTERM', handleExit);

    // 处理窗口大小变化
    process.stdout.on('resize', () => {
      if (this.isRunning) {
        this.render();
      }
    });

    // 处理进程异常退出
    process.on('uncaughtException', (error) => {
      console.error('\n❌ 未捕获的异常:', error);
      handleExit();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('\n❌ 未处理的Promise拒绝:', reason);
      handleExit();
    });
  }

  private setupInteractionEngine(): void {
    // 监听交互引擎的事件
    this.interactionEngine.on('interaction', (event: InteractionEvent) => {
      this.handleInteractionEvent(event);
    });

    this.interactionEngine.on('error', (error: any) => {
      this.showError(`交互引擎错误: ${error.error?.message || '未知错误'}`);
    });

    // 监听未知命令事件
    this.interactionEngine.on('unknown_command', (data: any) => {
      const { command, args, context } = data;
      this.showError(`未知命令: /${command}`);
    });

    // 监听工具执行事件
    this.toolIntegration.on('tool_execution_started', (record) => {
      this.showInfo(`开始执行工具: ${record.toolName}`, true);
    });

    this.toolIntegration.on('tool_execution_completed', (record) => {
      this.showSuccess(`工具执行完成: ${record.toolName} (${record.result?.executionTime}ms)`, true);
    });

    this.toolIntegration.on('tool_execution_failed', (record) => {
      this.showError(`工具执行失败: ${record.toolName} - ${record.result?.error}`, true);
    });
  }

  private setupMultilineInput(): void {
    // 监听多行输入完成事件
    this.multilineInput.on('inputComplete', async (content: string) => {
      if (content.trim()) {
        await this.processUserInput(content);
      }
    });

    // 监听多行输入取消事件
    this.multilineInput.on('inputCancelled', () => {
      this.render(); // 重新渲染界面
    });

    // 监听文件拖拽事件
    this.multilineInput.on('fileDrop', (fileDrop: any) => {
      this.showInfo(`📁 已加载文件: ${fileDrop.filePath} (${this.formatFileSize(fileDrop.size)})`);
    });
  }

  private handleInteractionEvent(event: InteractionEvent): void {
    switch (event.type) {
      case 'input':
        this.handleInputEvent(event.data as CommandContext);
        break;
      case 'command':
        this.handleCommandEvent(event.data);
        break;
      case 'response':
        this.handleResponseEvent(event.data);
        break;
      case 'error':
        this.handleErrorEvent(event.data);
        break;
      case 'exit':
        this.handleExitEvent(event.data);
        break;
    }
  }

  private handleInputEvent(context: CommandContext): void {
    this.messageHistory.push({
      type: 'user',
      content: context.input,
      timestamp: context.timestamp
    });
  }

  private handleCommandEvent(data: any): void {
    const { command, args, context } = data;
    // 不再显示冗余的执行命令信息，让 InteractionEngine 的具体命令显示处理
    // 只对特定命令记录到历史
    this.messageHistory.push({
      type: 'user',
      content: `/${command} ${args.join(' ')}`,
      timestamp: context.timestamp
    });
  }

  private handleResponseEvent(data: any): void {
    const { message, response, context } = data;
    this.messageHistory.push({
      type: 'ai',
      content: response.content,
      timestamp: new Date()
    });
  }

  private handleErrorEvent(data: any): void {
    const { input, error } = data;
    this.showError(`处理输入时出错: ${error.message || error}`);
  }

  private handleExitEvent(data: any): void {
    const { reason } = data;
    this.showInfo(`退出原因: ${reason}`);
  }

  private completer(line: string): [string[], string] {
    const commands = ['/help', '/exit', '/clear', '/status', '/tools', '/config', '/sessions', '/paste'];
    const matches = commands.filter(cmd => cmd.startsWith(line));
    return [matches.length ? matches : commands, line];
  }

  private getThemeColors() {
    const themes = {
      claude: {
        primary: '#6741d9',
        secondary: '#8b5cf6',
        accent: '#a78bfa',
        background: '#1a1a1a',
        text: '#e5e5e5',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
      },
      qorder: {
        primary: '#3b82f6',
        secondary: '#60a5fa',
        accent: '#93c5fd',
        background: '#0f0f0f',
        text: '#f3f4f6',
        success: '#22c55e',
        warning: '#fbbf24',
        error: '#f87171'
      },
      auto: {
        primary: '#8b5cf6',
        secondary: '#a78bfa',
        accent: '#c4b5fd',
        background: '#111111',
        text: '#e5e5e5',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
      }
    };

    return themes[this.options.theme || 'auto'];
  }

  private createGradient(text: string): string {
    const colors = this.getThemeColors();
    return gradient([
      colors.primary,
      colors.secondary
    ])(text);
  }

  private renderHeader(): string {
    try {
      const banner = figlet.textSync('AICLI', {
        font: 'Small',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      });

      // 添加闪烁效果
      const gradientBanner = this.createGradient(banner);
      const sparkle = this.options.enableAnimations ? '✨ ' : '';
      return sparkle + gradientBanner + '\n';
    } catch (error) {
      const fallback = this.createGradient('🤖 增强版 AICLI');
      const sparkle = this.options.enableAnimations ? '✨ ' : '';
      return sparkle + fallback + '\n';
    }
  }

  private renderSidebar(): string {
    if (!this.options.showSidebar) return '';

    const colors = this.getThemeColors();
    const width = Math.min(35, Math.floor(process.stdout.columns * 0.35));

    let sidebar = '';

    // 顶部装饰线
    sidebar += chalk.cyan('┌' + '─'.repeat(width - 2) + '┐') + '\n';

    // 标题区域
    const title = '🤖 AICLI';
    const padding = Math.floor((width - title.length - 4) / 2);
    sidebar += chalk.cyan('│') + ' '.repeat(padding) + chalk.white.bold(title) + ' '.repeat(width - padding - title.length - 4) + chalk.cyan('│') + '\n';

    // 分割线
    sidebar += chalk.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';

    // 会话信息区域
    if (this.currentSession) {
      sidebar += chalk.cyan('│') + chalk.white.bold(' 会话信息') + ' '.repeat(width - 12) + chalk.cyan('│') + '\n';
      sidebar += chalk.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';

      sidebar += chalk.cyan('│ 📝 ') + chalk.gray((this.currentSession.title || '未命名会话').padEnd(width - 6)) + chalk.cyan('│') + '\n';
      sidebar += chalk.cyan('│ 🤖 ') + chalk.gray((`${this.currentSession.provider}/${this.currentSession.model}`).padEnd(width - 6)) + chalk.cyan('│') + '\n';
      sidebar += chalk.cyan('│ 💬 ') + chalk.gray((`${this.currentSession.messages} 条消息`).padEnd(width - 6)) + chalk.cyan('│') + '\n';
      sidebar += chalk.cyan('│ ⏱️  ') + chalk.gray((this.formatDuration(this.currentSession.startTime)).padEnd(width - 6)) + chalk.cyan('│') + '\n';
    }

    // 工具状态区域
    const toolCategories = new Map<string, ToolStatus[]>();
    this.toolStatuses.forEach(tool => {
      if (!toolCategories.has(tool.category)) {
        toolCategories.set(tool.category, []);
      }
      toolCategories.get(tool.category)!.push(tool);
    });

    toolCategories.forEach((tools, category) => {
      sidebar += chalk.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';
      sidebar += chalk.cyan('│') + chalk.white.bold(` ${category}`) + ' '.repeat(width - category.length - 4) + chalk.cyan('│') + '\n';
      sidebar += chalk.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';

      tools.forEach(tool => {
        const statusIcon = this.getStatusIcon(tool.status);
        const statusColor = this.getStatusColor(tool.status);
        const toolName = tool.name.length > 15 ? tool.name.substring(0, 15) + '...' : tool.name;
        const padding = width - toolName.length - 10;

        let statusColorFunc;
        if (statusColor === 'green') {
          statusColorFunc = chalk.green;
        } else if (statusColor === 'red') {
          statusColorFunc = chalk.red;
        } else if (statusColor === 'yellow') {
          statusColorFunc = chalk.yellow;
        } else if (statusColor === 'blue') {
          statusColorFunc = chalk.blue;
        } else if (statusColor === 'gray') {
          statusColorFunc = chalk.gray;
        } else {
          statusColorFunc = chalk.white;
        }

        sidebar += chalk.cyan('│') +
                   chalk.white(`  ${statusIcon} `) +
                   chalk.gray(toolName) +
                   ' '.repeat(padding) +
                   statusColorFunc(`[${tool.status}]`) +
                   chalk.cyan('│') + '\n';
      });
    });

    // 底部装饰线
    sidebar += chalk.cyan('└' + '─'.repeat(width - 2) + '┘') + '\n';

    return sidebar + '\n';
  }

  private renderStatusBar(): string {
    if (!this.options.showStatusBar) return '';

    const width = process.stdout.columns;
    const separator = chalk.cyan('─'.repeat(width));

    // 动态状态指示器
    const statusIcon = this.options.enableAnimations ? '🟢' : '🚀';
    const animatedDots = this.options.enableAnimations ? '...' : '';

    const leftSide = chalk.white(`${statusIcon} 就绪${animatedDots}`) + ' ' + chalk.gray('Ctrl+C 退出');

    // 当前时间
    const currentTime = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    const centerSide = chalk.white('📅 ') + chalk.gray(currentTime);

    // 模式指示器
    const modeIcon = this.currentSession ? '💬' : '⚡';
    const modeText = this.currentSession ? '对话中' : '增强模式';
    const rightSide = chalk.white(`${modeIcon} `) + chalk.gray(modeText);

    const padding = width - (leftSide.length + centerSide.length + rightSide.length + 6);
    const middlePadding = ' '.repeat(Math.max(0, Math.floor(padding / 2)));

    return separator + '\n' +
           leftSide + middlePadding + centerSide + middlePadding + rightSide + '\n';
  }

  private getStatusIcon(status: string): string {
    const icons = {
      ready: '✅',
      running: '⏳',
      error: '❌',
      disabled: '⭕'
    };
    return icons[status as keyof typeof icons] || '⭕';
  }

  private getStatusColor(status: string): string {
    const colors = {
      ready: 'green',
      running: 'yellow',
      error: 'red',
      disabled: 'gray'
    };
    return colors[status as keyof typeof colors] || 'gray';
  }

  private formatDuration(startTime: Date): string {
    const duration = Date.now() - startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  private clearMessageHistory(): void {
    this.messageHistory = [];
  }

  private renderDebounced(delay: number = 200): void {
    // 取消之前的渲染定时器
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    // 设置新的渲染定时器
    this.renderTimeout = setTimeout(() => {
      if (this.isRunning) {
        this.render();
      }
      this.renderTimeout = null;
    }, delay);
  }

  public render(): void {
    if (!this.isRunning) {
      return;
    }

    // 防抖机制：避免频繁渲染
    const now = Date.now();
    if (now - this.lastRenderTime < 100) { // 100ms内的重复渲染请求被忽略
      return;
    }
    this.lastRenderTime = now;

    // 清屏
    this.clearScreen();

    // 构建完整的输出内容
    let output = '';

    // 添加头部
    output += this.renderHeader();

    // 计算布局
    const totalWidth = process.stdout.columns;
    const sidebarWidth = this.options.showSidebar ? Math.min(35, Math.floor(totalWidth * 0.35)) : 0;

    // 添加主要内容区域
    const mainContent = this.renderMainContent();

    if (this.options.showSidebar) {
      // 侧边栏布局
      const sidebar = this.renderSidebar();
      const sidebarLines = sidebar.split('\n');
      const mainLines = mainContent.split('\n');
      const maxLines = Math.max(sidebarLines.length, mainLines.length);

      for (let i = 0; i < maxLines; i++) {
        const sidebarLine = sidebarLines[i] || '';
        const mainLine = mainLines[i] || '';

        if (sidebarLine.trim()) {
          output += sidebarLine + '   ' + mainLine + '\n';
        } else if (mainLine.trim()) {
          output += ' '.repeat(sidebarWidth) + '   ' + mainLine + '\n';
        } else {
          output += '\n';
        }
      }
    } else {
      // 全宽布局
      output += mainContent;
    }

    // 添加状态栏
    output += this.renderStatusBar();

    // 一次性输出所有内容（不使用console.log避免干扰readline）
    if (output) {
      process.stdout.write(output);
    }

    // 重新设置提示符并显示
    this.renderPrompt();
    // 确保提示符显示
    if (this.rl && this.isRunning) {
      this.rl.prompt();
    }
  }

  private renderMainContent(): string {
    // 主要内容区域
    let content = '';

    // 欢迎信息
    content += chalk.cyan('╭─ 欢迎使用增强版 AICLI ─' + '─'.repeat(Math.max(0, process.stdout.columns - 50)) + '╮') + '\n';
    content += chalk.cyan('│') + ' '.repeat(process.stdout.columns - 2) + chalk.cyan('│') + '\n';

    const welcomeText = '🤖 AI编程助手已就绪 - 开始输入您的消息';
    const welcomePadding = Math.floor((process.stdout.columns - welcomeText.length - 4) / 2);
    content += chalk.cyan('│') + ' '.repeat(welcomePadding) + chalk.white.bold(welcomeText) + ' '.repeat(process.stdout.columns - welcomePadding - welcomeText.length - 4) + chalk.cyan('│') + '\n';

    content += chalk.cyan('│') + ' '.repeat(process.stdout.columns - 2) + chalk.cyan('│') + '\n';
    content += chalk.cyan('╰' + '─'.repeat(process.stdout.columns - 2) + '╯') + '\n\n';

    // 显示消息历史
    if (this.messageHistory.length > 0) {
      content += chalk.yellow.bold('💬 对话历史:') + '\n';
      content += chalk.cyan('─'.repeat(process.stdout.columns - 20)) + '\n\n';

      // 只显示最近的几条消息，避免界面过长
      const recentMessages = this.messageHistory.slice(-10);

      for (const msg of recentMessages) {
        const timeStr = msg.timestamp.toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });

        if (msg.type === 'user') {
          content += chalk.green(`👤 [${timeStr}] `) + chalk.white(msg.content) + '\n';
        } else {
          content += chalk.blue(`🤖 [${timeStr}] `) + chalk.gray(msg.content) + '\n';
        }
        content += '\n';
      }
    } else {
      // 快速命令提示
      content += chalk.yellow.bold('💡 快速命令:') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/help     ') + chalk.gray('- 显示帮助信息') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/paste    ') + chalk.gray('- 粘贴剪贴板内容（支持截图）') + '\n';
    content += chalk.white('  • ') + chalk.cyan('/status   ') + chalk.gray('- 查看系统状态') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/tools    ') + chalk.gray('- 查看工具列表') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/clear    ') + chalk.gray('- 清空屏幕') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/exit     ') + chalk.gray('- 退出程序') + '\n\n';

      content += chalk.yellow.bold('🆕 新功能:') + '\n';
      content += chalk.white('  • ') + chalk.cyan('/paste    ') + chalk.gray('- 粘贴剪贴板内容（支持截图）') + '\n';
      content += chalk.white('  • ') + chalk.cyan('""" 或 ``` ') + chalk.gray('- 进入多行输入模式') + '\n';
      content += chalk.white('  • ') + chalk.cyan('拖拽文件  ') + chalk.gray('- 自动加载文件内容') + '\n\n';
    }

    // 提示信息
    content += chalk.gray('💬 直接输入消息开始对话，或输入命令查看更多选项\n');

    return content;
  }

  private renderPrompt(): void {
    // 动态输入提示
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    // 根据状态变化提示符样式
    let promptPrefix = '';
    if (this.currentSession) {
      const messageCount = this.currentSession.messages;
      if (messageCount > 10) {
        promptPrefix = '💭 '; // 深度对话模式
      } else if (messageCount > 5) {
        promptPrefix = '🗨️  '; // 对话模式
      } else {
        promptPrefix = '👤 '; // 开始对话模式
      }
    } else {
      promptPrefix = '🤖 '; // 初始模式
    }

    // 添加动画效果
    if (this.options.enableAnimations) {
      const animationFrames = ['⚡', '⭐', '✨'];
      const frameIndex = Math.floor(Date.now() / 1000) % animationFrames.length;
      promptPrefix = animationFrames[frameIndex] + ' ';
    }

    const prompt = this.createGradient(`${promptPrefix}[${timestamp}] > `);
    this.rl.setPrompt(prompt);
  }

  public updateSession(session: SessionInfo): void {
    this.currentSession = session;
    if (this.isRunning) {
      this.render();
    }
  }

  public updateToolStatus(toolName: string, status: ToolStatus): void {
    this.toolStatuses.set(toolName, status);
    if (this.isRunning) {
      this.render();
    }
  }

  public showLoading(message: string = '处理中...'): void {
    this.spinner = ora({
      text: message,
      spinner: 'dots',
      color: 'cyan'
    }).start();
  }

  public hideLoading(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
      // 不在这里调用 render，让调用者控制渲染时机
    }
  }

  public showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', skipRerender: boolean = false): void {
    const colorMap = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red
    };

    // 使用process.stdout.write避免干扰readline
    process.stdout.write(colorMap[type](message) + '\n');

    if (this.isRunning && !skipRerender) {
      this.renderDebounced(300);
    }
  }

  private showInfo(message: string, skipRerender: boolean = false): void {
    this.showMessage(message, 'info', skipRerender);
  }

  private showSuccess(message: string, skipRerender: boolean = false): void {
    this.showMessage(message, 'success', skipRerender);
  }

  private showWarning(message: string, skipRerender: boolean = false): void {
    this.showMessage(message, 'warning', skipRerender);
  }

  private showError(message: string, skipRerender: boolean = false): void {
    this.showMessage(message, 'error', skipRerender);
  }

  public async start(): Promise<void> {
    this.isRunning = true;

    // 显示欢迎信息
    this.showWelcomeMessage();

    // 初始化工具状态
    this.initializeToolStatuses();

    // 启动交互引擎
    this.interactionEngine.start();

    // 开始渲染循环
    this.render();

    // 设置输入处理
    this.setupInputHandler();
  }

  private showWelcomeMessage(): void {
    // 使用process.stdout.write避免干扰readline
    process.stdout.write(this.createGradient('🎉 欢迎使用增强版 AICLI!') + '\n');
    process.stdout.write(chalk.gray('基于 Claude Code CLI 设计理念的现代化 AI 编程助手') + '\n');
    process.stdout.write('\n');

    if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
      process.stdout.write(chalk.yellow('⚠️  未检测到 API 密钥配置') + '\n');
      process.stdout.write(chalk.gray('请设置环境变量以获得完整功能体验:') + '\n');
      process.stdout.write(chalk.cyan('  export DEEPSEEK_API_KEY="your_api_key"') + '\n');
      process.stdout.write(chalk.cyan('  export OPENAI_API_KEY="your_api_key"') + '\n');
      process.stdout.write('\n');
    }

    // 显示新功能提示
    process.stdout.write(chalk.cyan('🆕 新功能:') + '\n');
    process.stdout.write(chalk.white('  📝 多行输入 - 输入 """ 或 ``` 进入多行模式') + '\n');
    process.stdout.write(chalk.white('  📁 文件拖拽 - 直接拖拽文件到终端自动加载内容') + '\n');
    process.stdout.write('\n');
  }

  private initializeToolStatuses(): void {
    const defaultTools: ToolStatus[] = [
      { name: 'web_search', category: 'Web', status: 'ready', description: 'Web搜索功能' },
      { name: 'execute_code', category: 'Code', status: 'ready', description: '代码执行' },
      { name: 'analyze_file', category: 'File', status: 'ready', description: '文件分析' },
      { name: 'process_image', category: 'Media', status: 'ready', description: '图像处理' },
      { name: 'project_operation', category: 'Project', status: 'ready', description: '项目管理' }
    ];

    defaultTools.forEach(tool => {
      this.toolStatuses.set(tool.name, tool);
    });
  }

  private setupInputHandler(): void {
    // 启用截图粘贴功能
    if (this.options.enableScreenshotPaste && this.screenshotPasteHandler) {
      this.screenshotPasteHandler.enable(this.rl);

      // 监听粘贴事件
      this.screenshotPasteHandler.on('paste', (event) => {
        console.log(chalk.dim(`\n📋 已处理粘贴内容: ${event.type}`));
      });

      // 监听文本插入事件
      this.screenshotPasteHandler.on('insert-text', (text: string) => {
        // 将粘贴的文本添加到输入队列
        this.pendingInputs.push(text);
      });
    }

    // 使用多行输入处理器替代传统readline
    this.rl.on('line', async (input) => {
      // 暂停readline以避免冲突
      this.rl.pause();

      try {
        // 检查是否是多行输入命令
        const trimmed = input.trim();
        if (trimmed === '"""' || trimmed === '```' || trimmed === "'''" || trimmed === '/multiline') {
          // 启动多行输入模式
          await this.startMultilineInput();
        } else {
          // 检查是否是信息类命令（不需要重新渲染界面的命令）
          const isInfoCommand = trimmed.startsWith('/') &&
            ['/help', '/status', '/tools', '/config', '/sessions', '/history'].some(cmd =>
              trimmed.startsWith(cmd) && (trimmed.length === cmd.length || trimmed[cmd.length] === ' ')
            );

          // 将输入传递给 InteractionEngine 处理
          await this.interactionEngine.processInput(input);

          // 只有非信息类命令才需要重新渲染界面
          if (!isInfoCommand) {
            this.renderDebounced(100); // 使用短延迟的防抖渲染
          }
        }
      } catch (error) {
        process.stderr.write('输入处理错误: ' + (error instanceof Error ? error.message : error) + '\n');
      } finally {
        // 恢复readline状态
        setTimeout(() => {
          if (this.isRunning) {
            this.rl.resume();
            this.rl.prompt();
          }
        }, 100);
      }
    });
  }

  private restoreInputState(): void {
    this.safeRestorePrompt();
  }

  private safeRestorePrompt(): void {
    if (!this.isRunning || !this.rl) return;

    try {
      // 确保readline处于活动状态
      this.rl.resume();

      // 清理当前行并重新显示提示符
      process.stdout.write('\r\x1b[K');
      this.rl.prompt();
    } catch (error) {
      // 如果失败，尝试最基本的方式
      try {
        const timestamp = new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
        process.stdout.write(`\n${chalk.green(`${timestamp}> `)}`);
      } catch (fallbackError) {
        // 最后的备用方案
        process.stdout.write('\n> ');
      }
    }
  }

  private async startMultilineInput(): Promise<void> {
    // 临时关闭当前的readline
    this.rl.pause();

    // 启动编辑器模式
    const content = await this.multilineInput.startEditor();

    // 编辑器完成后，恢复原始readline并重新渲染界面
    if (this.isRunning) {
      this.rl.resume();

      // 处理编辑器返回的内容
      if (content.trim()) {
        await this.processUserInput(content);
      } else {
        // 如果取消编辑，重新渲染界面
        this.render();
        this.rl.prompt();
      }
    }
  }

  private async handleDirectCommand(command: string): Promise<void> {
    await this.handleCommand(command);
  }

  private async processUserInput(content: string): Promise<void> {
    if (!content.trim()) return;

    // 检查是否是命令
    if (content.trim().startsWith('/')) {
      const command = content.trim().substring(1);
      await this.handleCommand(command);
    } else {
      // 处理用户消息
      await this.handleUserMessage(content);
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.toLowerCase().split(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'exit':
        process.stdout.write('\n' + chalk.yellow('👋 再见！') + '\n');
        this.stop();
        process.exit(0);
        return; // 退出命令不需要重新渲染
      case 'clear':
        this.clearMessageHistory();
        this.clearScreen();
        break;
      case 'status':
        this.showSystemStatus();
        break;
      case 'tools':
        this.showTools();
        break;
      case 'config':
        this.showConfig();
        break;
      case 'sessions':
        this.showSessions();
        break;
      case 'paste':
        await this.handlePasteCommand();
        break;
      default:
        this.showMessage(`未知命令: /${command}。输入 /help 查看帮助。`, 'warning');
    }

    // 命令处理后重新渲染（除了exit命令）
    this.render();
  }

  private async handleUserMessage(message: string): Promise<void> {
    try {
      // 显示加载状态
      this.showLoading('正在处理...');

      // 记录用户消息到历史
      this.messageHistory.push({
        type: 'user',
        content: message,
        timestamp: new Date()
      });

      // 发送消息事件
      this.emit('userMessage', message);

      let aiResponse: string;

      if (this.aiService) {
        // 调用真正的AI服务 - 带超时保护
        try {
          const messages: ChatMessage[] = [
            {
              role: 'user',
              content: message,
              timestamp: new Date()
            }
          ];

          // 设置超时保护
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI服务响应超时')), 30000);
          });

          const response = await Promise.race([
            this.aiService.sendMessage(messages),
            timeoutPromise
          ]) as any;

          aiResponse = response.content || 'AI返回了空响应';
        } catch (error) {
          aiResponse = `AI服务调用失败: ${error instanceof Error ? error.message : '未知错误'}`;
        }
      } else {
        // 没有AI服务时的备用响应
        aiResponse = '未检测到AI服务配置。请设置API密钥以获得完整功能。';
      }

      // 记录AI响应到历史
      this.messageHistory.push({
        type: 'ai',
        content: aiResponse,
        timestamp: new Date()
      });

      // 更新会话消息计数
      if (this.currentSession) {
        this.currentSession.messages += 2; // 用户消息 + AI响应
      }

    } catch (error) {
      // 记录错误消息到历史
      this.messageHistory.push({
        type: 'ai',
        content: `处理消息时出错: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: new Date()
      });
    } finally {
      // 隐藏加载状态
      this.hideLoading();

      // 确保界面重新渲染并恢复输入状态
      try {
        this.render();
        // 强制恢复 readline 状态（多层保障）
        setTimeout(() => {
          if (this.isRunning && this.rl) {
            try {
              // 确保readline处于活动状态
              this.rl.resume();
              // 重新设置提示符并显示
              this.renderPrompt();
              this.rl.prompt();
            } catch (promptError: any) {
              console.log('Readline恢复失败，使用基本恢复:', promptError?.message || '未知错误');
              // 如果 prompt 失败，尝试基本恢复
              process.stdout.write('\n> ');
            }
          }
        }, 50);

        // 添加额外的恢复保障
        setTimeout(() => {
          if (this.isRunning && this.rl) {
            try {
              this.rl.resume();
              this.rl.prompt();
            } catch (e: any) {
              // 忽略第二次恢复的错误
            }
          }
        }, 200);
      } catch (renderError) {
        // 如果渲染失败，尝试简单的输出并恢复状态
        try {
          process.stdout.write('\n' + chalk.yellow('消息处理完成') + '\n> ');
          if (this.isRunning && this.rl) {
            setTimeout(() => {
              try {
                this.rl.resume();
                this.rl.prompt();
              } catch (e) {
                process.stdout.write('> ');
              }
            }, 100);
          }
        } catch (outputError) {
          // 忽略所有错误
        }
      }
    }
  }

  private showHelp(): void {
    // 显示帮助信息后延迟重新渲染
    const helpText = chalk.cyan('\n📚 可用命令:') + '\n\n' +
                     chalk.white('  /help      ') + chalk.gray('- 显示此帮助信息') + '\n' +
                     chalk.white('  /status    ') + chalk.gray('- 显示系统状态') + '\n' +
                     chalk.white('  /tools     ') + chalk.gray('- 显示工具列表') + '\n' +
                     chalk.white('  /config    ') + chalk.gray('- 显示配置信息') + '\n' +
                     chalk.white('  /sessions  ') + chalk.gray('- 显示会话列表') + '\n' +
                     chalk.white('  /clear     ') + chalk.gray('- 清空屏幕') + '\n' +
                     chalk.white('  /exit      ') + chalk.gray('- 退出程序') + '\n\n' +

                     chalk.cyan('🆕 多行输入功能:') + '\n' +
                     chalk.white('  """ 或 ``` ') + chalk.gray('- 进入多行输入模式') + '\n' +
                     chalk.white('  /multiline  ') + chalk.gray('- 进入多行输入模式') + '\n' +
                     chalk.white('  /submit     ') + chalk.gray('- 提交多行输入 (多行模式下)') + '\n' +
                     chalk.white('  /cancel     ') + chalk.gray('- 取消多行输入 (多行模式下)') + '\n\n' +

                     chalk.cyan('📁 文件拖拽功能:') + '\n' +
                     chalk.white('  拖拽文件到终端 ') + chalk.gray('- 自动加载文件内容') + '\n' +
                     chalk.white('  支持文件类型: ') + chalk.gray('.js, .ts, .json, .md, .txt 等') + '\n' +
                     chalk.white('  文件大小限制: ') + chalk.gray('1MB') + '\n';

    // 使用process.stdout.write而不是console.log
    process.stdout.write(helpText + '\n');

    // 延迟重新渲染 - 使用防抖机制
    this.renderDebounced(1500);
  }

  private showSystemStatus(): void {
    const statusText = chalk.cyan('\n🔧 系统状态:') + '\n\n';

    let sessionInfo = '';
    if (this.currentSession) {
      sessionInfo += chalk.white('  📝 当前会话: ') + chalk.gray(this.currentSession.title || '未命名') + '\n';
      sessionInfo += chalk.white('  🤖 AI模型: ') + chalk.gray(`${this.currentSession.provider}/${this.currentSession.model}`) + '\n';
      sessionInfo += chalk.white('  💬 消息数: ') + chalk.gray(this.currentSession.messages) + '\n';
      sessionInfo += chalk.white('  ⏱️  运行时间: ') + chalk.gray(this.formatDuration(this.currentSession.startTime)) + '\n';
    } else {
      sessionInfo += chalk.white('  📝 当前会话: ') + chalk.gray('无') + '\n';
    }

    const readyTools = Array.from(this.toolStatuses.values()).filter(t => t.status === 'ready').length;
    const toolsInfo = chalk.white('  🛠️ 工具状态: ') + chalk.gray(`${this.toolStatuses.size} 个工具已注册`) + '\n' +
                     chalk.white('  ✅ 可用工具: ') + chalk.gray(`${readyTools} 个`);

    process.stdout.write(statusText + sessionInfo + toolsInfo + '\n');

    this.renderDebounced(1000);
  }

  private showTools(): void {
    let toolsText = chalk.cyan('\n🛠️ 可用工具:') + '\n\n';

    const categories = new Map<string, ToolStatus[]>();
    this.toolStatuses.forEach(tool => {
      if (!categories.has(tool.category)) {
        categories.set(tool.category, []);
      }
      categories.get(tool.category)!.push(tool);
    });

    categories.forEach((tools, category) => {
      toolsText += chalk.cyan(`  ${category}:`) + '\n';
      tools.forEach(tool => {
        const statusIcon = this.getStatusIcon(tool.status);
        toolsText += chalk.white(`    ${statusIcon} ${tool.name}`) +
                     chalk.gray(` [${tool.status}]`) + '\n';
      });
      toolsText += '\n';
    });

    process.stdout.write(toolsText);

    this.renderDebounced(1000);
  }

  private showConfig(): void {
    let configText = chalk.cyan('\n⚙️ 配置信息:') + '\n\n';
    configText += chalk.white('  🎨 主题: ') + chalk.gray(this.options.theme) + '\n';
    configText += chalk.white('  📊 侧边栏: ') + chalk.gray(this.options.showSidebar ? '启用' : '禁用') + '\n';
    configText += chalk.white('  📊 状态栏: ') + chalk.gray(this.options.showStatusBar ? '启用' : '禁用') + '\n';
    configText += chalk.white('  ✨ 动画: ') + chalk.gray(this.options.enableAnimations ? '启用' : '禁用') + '\n';

    if (process.env.DEEPSEEK_API_KEY) {
      configText += chalk.white('  🔑 DeepSeek: ') + chalk.green('已配置') + '\n';
    }
    if (process.env.OPENAI_API_KEY) {
      configText += chalk.white('  🔑 OpenAI: ') + chalk.green('已配置') + '\n';
    }

    process.stdout.write(configText);

    this.renderDebounced(1000);
  }

  private showSessions(): void {
    let sessionsText = chalk.cyan('\n💾 会话管理:') + '\n\n';

    if (this.currentSession) {
      sessionsText += chalk.cyan('  当前会话:') + '\n';
      sessionsText += chalk.white(`    📝 ${this.currentSession.title || '未命名会话'}`) + '\n';
      sessionsText += chalk.white(`    🤖 ${this.currentSession.provider}/${this.currentSession.model}`) + '\n';
      sessionsText += chalk.white(`    💬 ${this.currentSession.messages} 条消息`) + '\n';
      sessionsText += chalk.white(`    ⏱️  ${this.formatDuration(this.currentSession.startTime)}`) + '\n';
    } else {
      sessionsText += chalk.white('  📝 当前会话: 无') + '\n';
    }

    sessionsText += '\n' + chalk.gray('  会话管理功能开发中...') + '\n';

    process.stdout.write(sessionsText);

    this.renderDebounced(1000);
  }

  public stop(): void {
    try {
      this.isRunning = false;
      this.hideLoading();

      // 清理渲染定时器
      if (this.renderTimeout) {
        clearTimeout(this.renderTimeout);
        this.renderTimeout = null;
      }

      // 停止多行输入处理器
      if (this.multilineInput) {
        try {
          this.multilineInput.stop();
        } catch (error) {
          // 忽略多行输入处理器停止错误
        }
      }

      // 安全移除窗口大小变化监听器
      try {
        process.stdout.removeAllListeners('resize');
      } catch (error) {
        // 忽略监听器移除错误
      }

      // 安全关闭readline
      if (this.rl) {
        try {
          this.rl.close();
        } catch (error) {
          // 忽略readline关闭错误
        }
      }
    } catch (error) {
      // 忽略所有停止错误
    }
  }

  private async showFormattedOutput(content: string, type: 'text' | 'markdown' | 'code' | 'error' | 'success' | 'warning' = 'text'): Promise<void> {
    const output: FormattedOutput = {
      content,
      type,
      metadata: {
        timestamp: new Date(),
        session: this.currentSession
      }
    };

    await this.outputProcessor.process(output);
  }

  public getAvailableTools(): any[] {
    return this.toolIntegration.getAllTools();
  }

  public async executeTool(toolName: string, parameters: Record<string, any>, options: ToolExecutionOptions = {}): Promise<any> {
    return await this.toolIntegration.executeTool(toolName, parameters, options);
  }

  public getOutputProcessor(): OutputProcessor {
    return this.outputProcessor;
  }

  public getInteractionEngine(): InteractionEngine {
    return this.interactionEngine;
  }

  private async handlePasteCommand(): Promise<void> {
    if (!this.options.enableScreenshotPaste || !this.screenshotPasteHandler) {
      this.showMessage('截图粘贴功能未启用', 'error');
      return;
    }

    try {
      await this.screenshotPasteHandler.manualPaste();
    } catch (error) {
      this.showMessage(`粘贴失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }
}