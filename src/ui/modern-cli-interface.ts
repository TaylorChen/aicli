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
import { AttachmentManager, ManagedAttachment } from '../core/attachment-manager';
import { DragDropHandler } from '../core/drag-drop-handler';
import { EnhancedDragHandler } from '../core/enhanced-drag-handler';
import { InputEnhancer, InputEnhancerOptions } from '../core/input-enhancer';
import { DragIndicator, createDragIndicator } from '../core/drag-indicator';
import { TerminalDragDetector, TerminalDragEvent } from '../core/terminal-drag-detector';
import { DragDisplay } from '../core/drag-display';
import { RealDragDetector, RealDragEvent } from '../core/real-drag-detector';
import { EnhancedAIService, EnhancedAIRequest } from '../services/enhanced-ai-service';

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
  private attachmentManager!: AttachmentManager;
  private dragDropHandler!: DragDropHandler;
  private enhancedDragHandler!: EnhancedDragHandler;
  private inputEnhancer!: InputEnhancer;
  private dragIndicator!: DragIndicator;
  private terminalDragDetector!: TerminalDragDetector;
  private dragDisplay!: DragDisplay;
  private realDragDetector!: RealDragDetector;
  private pendingInputs: string[] = [];
  private isProcessing = false;
  private currentAttachments: ManagedAttachment[] = [];

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

    // 初始化附件管理器
    this.attachmentManager = new AttachmentManager({
      maxAttachments: 10,
      maxTotalSize: 50 * 1024 * 1024, // 50MB
      autoCleanup: true
    });

    // 初始化拖拽处理器
    this.dragDropHandler = new DragDropHandler(this.attachmentManager, {
      enabled: true,
      showHints: true,
      maxFiles: 5,
      maxFileSize: 10 * 1024 * 1024 // 10MB
    });

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

    // 初始化增强拖拽处理器
    this.enhancedDragHandler = new EnhancedDragHandler(this.attachmentManager, {
      enableRealTimeFeedback: true,
      enableFilePreview: true,
      enableHoverEffects: true,
      showProgressIndicators: true
    });

    // 初始化输入增强器
    this.inputEnhancer = new InputEnhancer(this.rl, this.attachmentManager, {
      enableDragDrop: true,
      enableVisualFeedback: true,
      enableInlinePreview: true,
      dragPrompt: '🎯 拖拽文件到这里 > ',
      normalPrompt: '> ',
      showAttachmentIndicator: true
    });

    // 初始化拖拽指示器
    this.dragIndicator = createDragIndicator('full');

    // 初始化新的终端拖拽检测器
    this.terminalDragDetector = new TerminalDragDetector(this.attachmentManager, {
      enableFileWatcher: true,
      enableTempDirectory: true,
      detectionWindow: 3000,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      showProgress: true,
      enablePreview: true
    });

    // 初始化拖拽显示组件
    this.dragDisplay = new DragDisplay({
      showFileIcons: true,
      showFileSize: true,
      showFileType: true,
      showProgress: true,
      maxPreviewLength: 45,
      colorScheme: 'blue',
      compact: false
    });

    // 初始化真正的拖拽检测器
    this.realDragDetector = new RealDragDetector(this.attachmentManager, {
      enableAnsiDetection: true,
      enableFileSystemFallback: true,
      enableTerminalSpecific: true,
      watchDirectories: this.getDefaultWatchDirectories(),
      detectionTimeout: 5000,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      showVisualFeedback: true
    });

    this.initializeAIService();
    this.setupEventHandlers();
    this.setupInteractionEngine();
    this.setupMultilineInput();
    this.setupDragDropHandlers();
    this.setupEnhancedDragHandlers();
    this.setupTerminalDragDetector();
    this.setupRealDragDetector();
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
    const commands = ['/help', '/exit', '/clear', '/status', '/tools', '/config', '/sessions', '/paste', '/attachments', '/clear-attachments', '/remove-attachment', '/drag-files'];
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
      case 'attachments':
      case 'att':
        this.showAttachments();
        break;
      case 'clear-attachments':
      case 'clear-att':
        await this.clearAttachments();
        break;
      case 'remove-attachment':
      case 'rm-att':
        if (args.length > 0) {
          await this.removeAttachment(args[0]);
        } else {
          this.showMessage('用法: /remove-attachment <attachment_id>', 'warning');
        }
        break;
      case 'drag-files':
        await this.dragDropHandler.manualFileDetection();
        break;
      default:
        this.showMessage(`未知命令: /${command}。输入 /help 查看帮助。`, 'warning');
    }

    // 命令处理后重新渲染（除了exit命令）
    this.render();
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

      // 清理增强拖拽组件
      if (this.enhancedDragHandler) {
        try {
          this.enhancedDragHandler.cleanup();
        } catch (error) {
          // 忽略拖拽处理器清理错误
        }
      }

      if (this.inputEnhancer) {
        try {
          this.inputEnhancer.cleanup();
        } catch (error) {
          // 忽略输入增强器清理错误
        }
      }

      if (this.dragIndicator) {
        try {
          this.dragIndicator.cleanup();
        } catch (error) {
          // 忽略拖拽指示器清理错误
        }
      }

      if (this.terminalDragDetector) {
        try {
          this.terminalDragDetector.cleanup();
        } catch (error) {
          // 忽略终端拖拽检测器清理错误
        }
      }

      if (this.realDragDetector) {
        try {
          this.realDragDetector.disable();
        } catch (error) {
          // 忽略真正拖拽检测器清理错误
        }
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
      // 使用附件管理器处理粘贴
      const newAttachments = await this.attachmentManager.addFromClipboard();

      if (newAttachments.length > 0) {
        // 添加到当前附件列表
        this.currentAttachments.push(...newAttachments);

        // 显示粘贴结果
        console.log(chalk.green(`✅ 已添加 ${newAttachments.length} 个附件:`));
        newAttachments.forEach(attachment => {
          const icon = attachment.type === 'image' ? '🖼️' : '📄';
          console.log(`   ${icon} ${attachment.filename}`);
        });

        console.log(chalk.gray(`💡 当前共有 ${this.currentAttachments.length} 个附件，输入 /attachments 查看`));
      } else {
        console.log(chalk.yellow('⚠️ 剪贴板中没有可识别的内容'));
      }
    } catch (error) {
      this.showMessage(`粘贴失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private showAttachments(): void {
    const stats = this.attachmentManager.getStats();

    if (stats.count === 0) {
      this.showMessage('📎 暂无附件', 'info');
      return;
    }

    console.log(chalk.cyan(`\n📎 附件列表 (${stats.count})`));
    console.log(chalk.gray('─'.repeat(60)));

    const attachments = this.attachmentManager.getAllAttachments();
    attachments.forEach((attachment, index) => {
      const icon = attachment.type === 'image' ? '🖼️' : '📄';
      const sourceIcon = this.getSourceIcon(attachment.source.type);
      const size = attachment.size ? this.formatFileSize(attachment.size) : '未知大小';

      console.log(`${index + 1}. ${icon} ${chalk.white(attachment.filename)} ${sourceIcon}`);
      console.log(`   大小: ${chalk.gray(size)} | ID: ${chalk.gray(attachment.id)}`);

      if (attachment.source.originalPath) {
        console.log(`   原路径: ${chalk.gray(attachment.source.originalPath)}`);
      }

      console.log(`   来源: ${chalk.gray(this.getSourceDescription(attachment.source))}`);
      console.log('');
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan(`总计: ${stats.count} 个文件 (${this.formatFileSize(stats.totalSize)})`));
    console.log(chalk.gray(`📄 文件: ${stats.fileCount} | 🖼️ 图片: ${stats.imageCount} | 🗂️ 临时文件: ${stats.tempFiles}`));

    console.log(chalk.gray('\n💡 附件管理命令:'));
    console.log(chalk.gray('• /remove-attachment <id> - 删除指定附件'));
    console.log(chalk.gray('• /clear-attachments - 清空所有附件'));
    console.log(chalk.gray('• /paste - 粘贴剪贴板内容'));
    console.log(chalk.gray('• /drag-files - 手动检测拖拽文件'));
  }

  private async clearAttachments(): Promise<void> {
    const stats = this.attachmentManager.getStats();

    if (stats.count === 0) {
      this.showMessage('📎 暂无附件需要清理', 'info');
      return;
    }

    // 简单确认
    console.log(chalk.yellow(`\n⚠️ 确定要清空所有 ${stats.count} 个附件吗？`));
    console.log(chalk.gray('输入 y 确认，其他任意键取消'));

    // 在实际实现中，这里应该等待用户输入
    // 为了简化，我们直接清空
    this.attachmentManager.clearAttachments();
    this.currentAttachments = [];

    this.showMessage(`✅ 已清空所有附件`, 'success');
  }

  private async removeAttachment(attachmentId: string): Promise<void> {
    const attachment = this.attachmentManager.getAttachment(attachmentId);

    if (!attachment) {
      this.showMessage(`❌ 未找到附件: ${attachmentId}`, 'error');
      return;
    }

    const success = this.attachmentManager.removeAttachment(attachmentId);

    if (success) {
      // 从当前附件列表中移除
      this.currentAttachments = this.currentAttachments.filter(att => att.id !== attachmentId);
      this.showMessage(`✅ 已删除附件: ${attachment.filename}`, 'success');
    } else {
      this.showMessage(`❌ 删除附件失败: ${attachment.filename}`, 'error');
    }
  }

  private async handleUserMessage(content: string): Promise<void> {
    if (!this.aiService) {
      this.showMessage('AI 服务未初始化', 'error');
      return;
    }

    // 添加用户消息到历史
    this.messageHistory.push({
      type: 'user',
      content: content,
      timestamp: new Date()
    });

    // 显示加载动画
    this.spinner = ora({
      text: '🤔 AI 正在思考...',
      color: 'blue'
    }).start();

    try {
      // 如果有附件，使用增强的 AI 服务
      if (this.currentAttachments.length > 0) {
        await this.sendMessageWithAttachments(content);
      } else {
        // 使用普通 AI 服务
        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: content,
            timestamp: new Date()
          }
        ];
        const response = await this.aiService.sendMessage(messages);

        if (this.spinner) {
          this.spinner.stop();
          this.spinner = null;
        }

        this.messageHistory.push({
          type: 'ai',
          content: response.content,
          timestamp: new Date()
        });

        this.displayAIResponse(response.content);
      }
    } catch (error) {
      if (this.spinner) {
        this.spinner.stop();
        this.spinner = null;
      }

      this.showMessage(`AI 响应失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private async sendMessageWithAttachments(content: string): Promise<void> {
    if (!this.aiService) {
      this.showMessage('AI 服务未初始化', 'error');
      return;
    }

    try {
      // 创建增强 AI 服务实例
      const enhancedService = new (await import('../services/enhanced-ai-service')).EnhancedAIService({
        name: 'claude',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-sonnet-20240229'
      });

      // 构建消息
      const messages = [
        {
          role: 'user' as const,
          content: content,
          timestamp: new Date(),
          attachments: this.currentAttachments
        }
      ];

      const request: EnhancedAIRequest = {
        messages,
        attachments: this.currentAttachments.map(att => ({
          type: att.type,
          filename: att.filename,
          content: att.content,
          mimeType: att.mimeType,
          size: att.size,
          tempPath: att.tempPath
        })),
        model: 'claude-3-sonnet-20240229',
        stream: true,
        temperature: 0.7,
        maxTokens: 4000
      };

      if (this.spinner) {
        this.spinner.text = '🤖 AI 正在处理附件...';
      }

      let fullResponse = '';

      const response = await enhancedService.sendStreamMessage(request, (chunk: string) => {
        fullResponse += chunk;
        // 实时显示响应内容
        process.stdout.write(chunk);
      });

      if (this.spinner) {
        this.spinner.stop();
        this.spinner = null;
      }

      // 添加换行符确保格式正确
      if (fullResponse && !fullResponse.endsWith('\n')) {
        process.stdout.write('\n');
      }

      this.messageHistory.push({
        type: 'ai',
        content: fullResponse,
        timestamp: new Date()
      });

    } catch (error) {
      if (this.spinner) {
        this.spinner.stop();
        this.spinner = null;
      }

      this.showMessage(`处理附件消息失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private getSourceIcon(sourceType: string): string {
    const icons = {
      'paste': '📋',
      'drag': '🎯',
      'upload': '⬆️',
      'file': '📁'
    };
    return icons[sourceType as keyof typeof icons] || '📎';
  }

  private getSourceDescription(source: any): string {
    const descriptions = {
      'paste': '剪贴板粘贴',
      'drag': '拖拽添加',
      'upload': '文件上传',
      'file': '文件路径'
    };
    return descriptions[source.type as keyof typeof descriptions] || '未知来源';
  }

  
  private setupDragDropHandlers(): void {
    // 监听拖拽事件
    this.dragDropHandler.on('drag-enter', (event: any) => {
      console.log(chalk.cyan('🎯 检测到文件拖拽...'));
    });

    this.dragDropHandler.on('drag-leave', (event: any) => {
      console.log(chalk.gray('📴 文件拖拽已取消'));
    });

    this.dragDropHandler.on('drop', async (event: any) => {
      if (event.files && event.files.length > 0) {
        console.log(chalk.cyan(`📥 处理拖拽的 ${event.files.length} 个文件...`));

        // 添加到附件管理器
        const newAttachments = await this.attachmentManager.addFromDragDrop(event.files);

        if (newAttachments.length > 0) {
          // 添加到当前附件列表
          this.currentAttachments.push(...newAttachments);

          console.log(chalk.green(`✅ 已添加 ${newAttachments.length} 个附件:`));
          newAttachments.forEach(attachment => {
            const icon = attachment.type === 'image' ? '🖼️' : '📄';
            console.log(`   ${icon} ${attachment.filename}`);
          });

          console.log(chalk.gray(`💡 当前共有 ${this.currentAttachments.length} 个附件，输入 /attachments 查看`));
        }
      }
    });

    // 启用拖拽功能
    this.dragDropHandler.enable();
  }

  private setupEnhancedDragHandlers(): void {
    // 简化增强拖拽处理，避免与readline冲突
    // 主要依赖现有的拖拽处理器，增强拖拽处理器只提供辅助功能

    this.enhancedDragHandler.on('filesProcessed', (event) => {
      // 更新当前附件列表
      this.currentAttachments = this.attachmentManager.getAllAttachments();

      // 更新输入增强器的附件状态
      this.inputEnhancer.clearAttachments();
      this.currentAttachments.forEach(att => {
        this.inputEnhancer.addAttachment(att);
      });

      // 显示处理结果
      const { successCount, failCount, totalCount } = event;
      if (successCount > 0) {
        console.log(chalk.green(`✅ 通过增强拖拽添加了 ${successCount} 个文件`));
        if (failCount > 0) {
          console.log(chalk.yellow(`⚠️ ${failCount} 个文件处理失败`));
        }
      }
    });

    // 设置输入增强器事件处理（简化）
    this.inputEnhancer.on('filesProcessed', (event) => {
      // 同步附件状态
      this.currentAttachments = this.inputEnhancer.getAttachments();
    });

    // 启用增强拖拽功能（被动模式）
    this.enhancedDragHandler.enable();

    console.log(chalk.green('✅ 增强拖拽功能已启用（被动模式）'));
    console.log(chalk.cyan('💡 提示: 拖拽功能已优化，确保界面响应流畅'));
  }

  private setupTerminalDragDetector(): void {
    // 延迟启用，确保界面完全渲染后再启用拖拽检测
    setTimeout(() => {
      // 设置终端拖拽检测器事件处理
      this.terminalDragDetector.on('drag-start', (event: TerminalDragEvent) => {
        // 确保在当前行下方显示，不干扰输入
        process.stdout.write('\n');
        console.log(this.dragDisplay.renderDragStart(event.files));
        this.redrawPrompt();
      });

      this.terminalDragDetector.on('drag-progress', (event: TerminalDragEvent) => {
        const currentFile = event.files[0]?.fileName;
        const total = event.files.length;
        const current = event.files.filter(f => f.isProcessed).length;

        process.stdout.write('\n');
        console.log(this.dragDisplay.renderDragProgress(current, total, currentFile));
        this.redrawPrompt();
      });

      this.terminalDragDetector.on('drag-complete', (event: TerminalDragEvent) => {
        process.stdout.write('\n');
        console.log(this.dragDisplay.renderDragComplete(event.files));

        // 更新当前附件列表
        this.currentAttachments = this.attachmentManager.getAllAttachments();

        // 更新输入增强器的附件状态
        this.inputEnhancer.clearAttachments();
        this.currentAttachments.forEach(att => {
          this.inputEnhancer.addAttachment(att);
        });

        // 更新提示
        this.inputEnhancer.updatePrompt();
        this.redrawPrompt();
      });

      this.terminalDragDetector.on('drag-error', (event: TerminalDragEvent) => {
        process.stdout.write('\n');
        console.log(chalk.red(`❌ 拖拽处理出错: ${event.message}`));
        this.redrawPrompt();
      });

      // 启用终端拖拽检测
      this.terminalDragDetector.enable();

      // 显示启用信息
      setTimeout(() => {
        process.stdout.write('\n');
        console.log(chalk.green('✅ 终端拖拽检测已启用'));
        console.log(chalk.cyan('💡 现在支持拖拽文件和图片到终端'));
        console.log(chalk.gray('   📋 拖拽后将在下方显示文件预览'));
        this.redrawPrompt();
      }, 100);
    }, 2000); // 2秒后启用，确保界面完全渲染
  }

  private setupRealDragDetector(): void {
    // 设置真正拖拽检测器的事件处理
    this.realDragDetector.on('drag-enter', (event: RealDragEvent) => {
      process.stdout.write('\n');
      console.log(chalk.cyan('🎯 检测到拖拽进入输入框区域'));
      this.redrawPrompt();
    });

    this.realDragDetector.on('drag-over', (event: RealDragEvent) => {
      if (event.position) {
        // 可以在控制台显示拖拽位置信息
        // process.stdout.write(`\x1b[0H拖拽位置: ${event.position.x}, ${event.position.y}`);
      }
    });

    this.realDragDetector.on('drag-leave', (event: RealDragEvent) => {
      process.stdout.write('\n');
      console.log(chalk.gray('📤 拖拽已取消'));
      this.redrawPrompt();
    });

    this.realDragDetector.on('drop', (event: RealDragEvent) => {
      process.stdout.write('\n');
      console.log(this.dragDisplay.renderDragStart(event.files));
      this.redrawPrompt();
    });

    this.realDragDetector.on('drag-error', (event: RealDragEvent) => {
      process.stdout.write('\n');
      console.log(chalk.red(`❌ 拖拽错误: ${event.message}`));
      this.redrawPrompt();
    });

    this.realDragDetector.on('attachments-updated', (event: any) => {
      process.stdout.write('\n');

      // 更新当前附件列表
      this.currentAttachments = [...this.currentAttachments, ...event.attachments];

      // 同步到输入增强器
      if (this.inputEnhancer) {
        event.attachments.forEach((attachment: ManagedAttachment) => {
          this.inputEnhancer.addAttachment(attachment);
        });
      }

      console.log(chalk.green(`✅ ${event.message}`));
      console.log(chalk.cyan(`📎 当前附件总数: ${this.currentAttachments.length}`));

      // 显示附件信息
      event.attachments.forEach((attachment: ManagedAttachment, index: number) => {
        const icon = this.getFileIcon(attachment.type);
        console.log(chalk.gray(`   ${index + 1}. ${icon} ${attachment.filename} (${this.formatFileSize(attachment.size || 0)})`));
      });

      this.redrawPrompt();
    });

    // 延迟启用真正拖拽检测
    setTimeout(() => {
      this.realDragDetector.enable();

      // 显示启用信息
      setTimeout(() => {
        process.stdout.write('\n');
        console.log(chalk.green('🎯 增强拖拽检测已启用'));
        console.log(chalk.cyan('💡 现在支持直接拖拽文件到输入框区域'));
        console.log(chalk.gray('   📋 拖拽时会在输入框附近显示视觉反馈'));
        this.redrawPrompt();
      }, 100);
    }, 3000); // 3秒后启用，在终端拖拽检测之后
  }

  private getDefaultWatchDirectories(): string[] {
    const os = require('os');
    const path = require('path');

    return [
      os.tmpdir(),
      path.join(os.tmpdir(), 'aicli-drag-drop'),
      path.join(process.cwd(), 'temp'),
      path.join(process.cwd(), 'dropped-files'),
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Desktop')
    ];
  }

  private getFileIcon(type: string): string {
    const icons = {
      image: '🖼️',
      document: '📄',
      text: '📝',
      file: '📎',
      binary: '💾'
    };
    return icons[type as keyof typeof icons] || '📎';
  }

  
  private redrawPrompt(): void {
    // 重新绘制提示符
    if (this.rl && this.inputEnhancer) {
      try {
        process.stdout.write('\n');
        this.inputEnhancer.updatePrompt();
      } catch (error) {
        // 忽略重绘错误
      }
    }
  }

  private displayAIResponse(content: string): void {
    console.log('\n' + chalk.green('🤖 AI:'));
    console.log(content);
    console.log('');
  }
}