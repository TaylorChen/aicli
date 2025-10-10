import readline from 'readline';
import chalk from 'chalk';
import { config } from '../config';
import { sessionManagerV2 } from '../core/session-manager-v2';
import { StreamManager, StreamChunk } from '../core/stream-manager';
import { initializeTools, toolRegistry, permissionManager } from '../core/tool-system-init';

export enum LayoutMode {
  CHAT = 'chat',      // 流式聊天布局 (类似 Qoder CLI)
  DASHBOARD = 'dashboard', // 仪表盘布局 (类似 Claude Code CLI)
  ADAPTIVE = 'adaptive'    // 自适应布局
}

export interface LayoutState {
  mode: LayoutMode;
  statusBarHeight: number;
  headerHeight: number;
  dashboardHeight: number;
  outputHeight: number;
  inputHeight: number;
  terminalWidth: number;
  terminalHeight: number;
  cursorPosition: number;
  isInputActive: boolean;
  contentBuffer: string[];
  lastRenderTime: number;
}

export interface MessageBlock {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool' | 'error' | 'status';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface StatusIndicator {
  type: 'thinking' | 'executing' | 'completed' | 'failed' | 'idle';
  message: string;
  progress?: number;
  tokens?: number;
  duration?: number;
}

export interface DashboardWidget {
  id: string;
  type: 'status' | 'tools' | 'session' | 'progress';
  title: string;
  content: string;
  visible: boolean;
  priority: number;
}

/**
 * 混合布局管理器 - 结合流式和仪表盘布局的优势
 */
export class HybridLayout {
  private rl!: readline.Interface;
  private streamManager: StreamManager;
  private layoutState!: LayoutState;
  private messages: MessageBlock[] = [];
  private currentInput = '';
  private isProcessing = false;
  private abortController: AbortController;
  private inputHistory: string[] = [];
  private historyIndex = -1;
  private statusIndicator: StatusIndicator | null = null;
  private dashboardWidgets: Map<string, DashboardWidget> = new Map();
  private currentMode: LayoutMode = LayoutMode.ADAPTIVE;

  constructor(mode: LayoutMode = LayoutMode.ADAPTIVE) {
    this.currentMode = mode;
    initializeTools();
    this.streamManager = new StreamManager();
    this.abortController = new AbortController();

    this.initializeLayoutState();
    this.initializeReadline();
    this.setupEventListeners();
    this.initializeDashboard();
    this.updateTerminalSettings();
  }

  private initializeLayoutState(): void {
    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 24;

    this.layoutState = {
      mode: this.currentMode,
      statusBarHeight: 1,
      headerHeight: this.currentMode === LayoutMode.DASHBOARD ? 3 : 2,
      dashboardHeight: this.currentMode === LayoutMode.DASHBOARD ? 5 : 0,
      outputHeight: terminalHeight - this.calculateFixedHeight(),
      inputHeight: 1,
      terminalWidth,
      terminalHeight,
      cursorPosition: 0,
      isInputActive: true,
      contentBuffer: [],
      lastRenderTime: 0
    };
  }

  private calculateFixedHeight(): number {
    let height = 0;
    height += this.layoutState.statusBarHeight;
    height += this.layoutState.headerHeight;
    height += this.layoutState.dashboardHeight;
    height += this.layoutState.inputHeight;
    return height + 2; // 额外间距
  }

  private initializeReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getInputPrompt(),
      completer: this.completer.bind(this),
      history: this.inputHistory,
      historySize: 1000
    });
  }

  private setupEventListeners(): void {
    this.streamManager.subscribe(this.handleStreamChunk.bind(this));
    this.rl.on('line', this.handleUserInput.bind(this));
    process.on('SIGINT', this.handleInterrupt.bind(this));
    process.stdout.on('resize', this.handleResize.bind(this));
    process.on('exit', () => this.cleanup());
  }

  private initializeDashboard(): void {
    // 初始化仪表盘组件
    this.dashboardWidgets.set('status', {
      id: 'status',
      type: 'status',
      title: 'System Status',
      content: '',
      visible: true,
      priority: 1
    });

    this.dashboardWidgets.set('tools', {
      id: 'tools',
      type: 'tools',
      title: 'Active Tools',
      content: '',
      visible: true,
      priority: 2
    });

    this.dashboardWidgets.set('session', {
      id: 'session',
      type: 'session',
      title: 'Session Info',
      content: '',
      visible: true,
      priority: 3
    });

    this.updateDashboardContent();
  }

  private updateTerminalSettings(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b]0;AICLI - Hybrid Layout\x07');
    }
  }

  private getInputPrompt(): string {
    switch (this.currentMode) {
      case LayoutMode.CHAT:
        return '💬 ';
      case LayoutMode.DASHBOARD:
        return '🔧 ';
      case LayoutMode.ADAPTIVE:
      default:
        return '🤖 ';
    }
  }

  private handleStreamChunk(chunk: StreamChunk): Promise<void> {
    switch (chunk.type) {
      case 'content':
        this.handleContentChunk(chunk.content || '');
        break;
      case 'status':
        if (chunk.status) {
          this.handleStatusUpdate(chunk.status);
        }
        break;
      case 'tool_call':
        if (chunk.toolCall) {
          this.handleToolCall(chunk.toolCall);
        }
        break;
      case 'tool_result':
        if (chunk.toolResult) {
          this.handleToolResult(chunk.toolResult);
        }
        break;
      case 'error':
        this.handleError(chunk.error || '未知错误');
        break;
    }
    return Promise.resolve();
  }

  private handleContentChunk(content: string): void {
    if (this.messages.length === 0 || this.messages[this.messages.length - 1].type !== 'assistant') {
      this.addMessage({
        type: 'assistant',
        content: '',
        timestamp: new Date()
      });
    }

    const lastMessage = this.messages[this.messages.length - 1];
    lastMessage.content += content;

    // 根据布局模式决定渲染策略
    if (this.currentMode === LayoutMode.CHAT) {
      this.renderStreamingContent();
    } else {
      this.renderOutput();
    }
  }

  private handleStatusUpdate(status: any): void {
    this.statusIndicator = {
      type: status.type === 'thinking' ? 'thinking' :
            status.type === 'executing' ? 'executing' :
            status.type === 'completed' ? 'completed' :
            status.type === 'failed' ? 'failed' : 'idle',
      message: status.message,
      tokens: status.tokens,
      duration: status.duration
    };

    this.updateDashboardContent();
    this.renderOutput();
  }

  private handleToolCall(toolCall: { id: string; name: string; input: Record<string, unknown> }): void {
    const toolMessage = this.formatToolCall(toolCall);
    this.addMessage({
      type: 'tool',
      content: toolMessage,
      timestamp: new Date(),
      metadata: { toolId: toolCall.id, toolName: toolCall.name }
    });

    this.updateDashboardContent();
  }

  private handleToolResult(toolResult: { id: string; result?: any; error?: string }): void {
    const resultMessage = this.formatToolResult(toolResult);
    this.addMessage({
      type: 'tool',
      content: resultMessage,
      timestamp: new Date(),
      metadata: { toolId: toolResult.id, isResult: true }
    });

    this.updateDashboardContent();
  }

  private handleError(error: string): void {
    const errorMessage = this.formatError(error);
    this.addMessage({
      type: 'error',
      content: errorMessage,
      timestamp: new Date()
    });
  }

  private formatToolCall(toolCall: { id: string; name: string; input: Record<string, unknown> }): string {
    if (this.currentMode === LayoutMode.CHAT) {
      // 聊天模式：简洁显示
      return `🔧 使用工具: ${toolCall.name}`;
    } else {
      // 仪表盘模式：详细树状显示
      const lines = [
        chalk.blue('┌─ Tool Call'),
        chalk.blue(`│ ${toolCall.name}`),
        chalk.gray(`│ ${toolCall.id}`),
        chalk.blue('├─ Input'),
        ...JSON.stringify(toolCall.input, null, 2)
          .split('\n')
          .map(line => chalk.white(`│ ${line}`)),
        chalk.blue('└─')
      ];
      return lines.join('\n');
    }
  }

  private formatToolResult(toolResult: { id: string; result?: any; error?: string }): string {
    if (this.currentMode === LayoutMode.CHAT) {
      if (toolResult.error) {
        return `❌ 工具执行失败: ${toolResult.error}`;
      } else {
        return `✅ 工具执行完成`;
      }
    } else {
      const lines = [
        chalk.green('┌─ Tool Result'),
        chalk.gray(`│ ${toolResult.id}`)
      ];

      if (toolResult.error) {
        lines.push(chalk.red(`│ Error: ${toolResult.error}`));
      } else {
        const resultStr = this.formatToolResultValue(toolResult.result);
        lines.push(...resultStr.split('\n').map(line => chalk.white(`│ ${line}`)));
      }

      lines.push(chalk.green('└─'));
      return lines.join('\n');
    }
  }

  private formatToolResultValue(result: any): string {
    if (result === null || result === undefined) return 'No result';
    if (typeof result === 'string') return result;
    if (typeof result === 'number' || typeof result === 'boolean') return String(result);
    if (Array.isArray(result)) return `Array with ${result.length} items`;

    try {
      const jsonString = JSON.stringify(result, null, 2);
      return jsonString === '{}' ? 'Empty object' : jsonString;
    } catch {
      return 'Object (cannot be serialized)';
    }
  }

  private formatError(error: string): string {
    if (this.currentMode === LayoutMode.CHAT) {
      return `❌ 错误: ${error}`;
    } else {
      const lines = [
        chalk.red('┌─ Error'),
        chalk.white(`│ ${error}`),
        chalk.red('└─')
      ];
      return lines.join('\n');
    }
  }

  private addMessage(message: Omit<MessageBlock, 'id'>): void {
    const messageBlock: MessageBlock = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.messages.push(messageBlock);

    // 根据消息类型和布局模式决定显示方式
    if (this.shouldDisplayImmediately(messageBlock)) {
      this.displayMessage(messageBlock);
    }
  }

  private shouldDisplayImmediately(message: MessageBlock): boolean {
    // 在聊天模式下，立即显示所有消息
    if (this.currentMode === LayoutMode.CHAT) {
      return true;
    }

    // 在仪表盘模式下，某些消息类型可能延迟显示
    return message.type === 'error' || message.type === 'system';
  }

  private displayMessage(message: MessageBlock): void {
    const formattedLines = this.formatMessage(message);
    formattedLines.forEach(line => {
      console.log(line);
    });

    setTimeout(() => this.rl.prompt(), 10);
  }

  private updateDashboardContent(): void {
    // 更新状态组件
    if (this.statusIndicator) {
      const statusWidget = this.dashboardWidgets.get('status');
      if (statusWidget) {
        statusWidget.content = this.formatStatusIndicator(this.statusIndicator);
      }
    }

    // 更新会话组件
    const sessionWidget = this.dashboardWidgets.get('session');
    if (sessionWidget) {
      sessionWidget.content = this.formatSessionInfo();
    }

    // 更新工具组件
    const toolsWidget = this.dashboardWidgets.get('tools');
    if (toolsWidget) {
      toolsWidget.content = this.formatActiveTools();
    }
  }

  private formatStatusIndicator(indicator: StatusIndicator): string {
    const icon = this.getStatusIcon(indicator.type);
    const color = this.getStatusColor(indicator.type);

    let content = `${color(icon)} ${indicator.message}`;

    if (indicator.tokens) {
      content += chalk.gray(` • ${indicator.tokens} tokens`);
    }

    if (indicator.duration) {
      content += chalk.gray(` • ${indicator.duration}s`);
    }

    return content;
  }

  private getStatusIcon(type: StatusIndicator['type']): string {
    switch (type) {
      case 'thinking': return '🤔';
      case 'executing': return '⚡';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'idle': return '💭';
    }
  }

  private getStatusColor(type: StatusIndicator['type']): typeof chalk {
    switch (type) {
      case 'thinking': return chalk.yellow;
      case 'executing': return chalk.blue;
      case 'completed': return chalk.green;
      case 'failed': return chalk.red;
      case 'idle': return chalk.gray;
    }
  }

  private formatSessionInfo(): string {
    const currentProvider = config.getCurrentProvider();
    const currentSession = sessionManagerV2.getCurrentSession();

    const lines = [
      `模型: ${currentProvider?.name || '未配置'}/${config.get('currentModel') || '未设置'}`,
      `会话: ${currentSession?.metadata.title || '新会话'}`,
      `消息: ${this.messages.length}`
    ];

    return lines.join('\n');
  }

  private formatActiveTools(): string {
    const recentToolMessages = this.messages
      .filter(msg => msg.type === 'tool')
      .slice(-3);

    if (recentToolMessages.length === 0) {
      return '暂无工具活动';
    }

    return recentToolMessages
      .map(msg => {
        const toolName = msg.metadata?.toolName || '未知工具';
        const status = msg.metadata?.isResult ? '✅' : '🔧';
        return `${status} ${toolName}`;
      })
      .join('\n');
  }

  private renderStreamingContent(): void {
    // 聊天模式：流式显示内容
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant') {
      // 移动光标到上一行并覆盖内容
      process.stdout.write('\x1b[1A\x1b[2K');
      console.log(chalk.green(lastMessage.content));
    }
  }

  private renderOutput(): void {
    const now = Date.now();
    if (now - this.layoutState.lastRenderTime < 100) return;

    this.layoutState.lastRenderTime = now;

    if (this.currentMode === LayoutMode.CHAT) {
      this.renderChatLayout();
    } else {
      this.renderDashboardLayout();
    }
  }

  private renderChatLayout(): void {
    // 聊天模式：简单流式布局
    this.clearScreen();
    this.renderStatusBar();
    this.renderChatContent();
    this.renderInputArea();
  }

  private renderDashboardLayout(): void {
    // 仪表盘模式：分区布局
    this.clearScreen();
    this.renderHeader();
    this.renderDashboard();
    this.renderOutputArea();
    this.renderStatusBar();
    this.renderInputArea();
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  private renderHeader(): void {
    const terminalWidth = this.layoutState.terminalWidth;
    const title = chalk.bold.blue('🤖 AICLI - Hybrid Layout');
    const subtitle = chalk.gray('Adaptive CLI Interface with Dashboard View');

    // 居中显示标题
    const titlePadding = Math.max(0, Math.floor((terminalWidth - title.length) / 2));
    const subtitlePadding = Math.max(0, Math.floor((terminalWidth - subtitle.length) / 2));

    console.log(' '.repeat(titlePadding) + title);
    console.log(' '.repeat(subtitlePadding) + subtitle);
    console.log(chalk.gray('─'.repeat(terminalWidth)));
  }

  private renderDashboard(): void {
    const visibleWidgets = Array.from(this.dashboardWidgets.values())
      .filter(widget => widget.visible)
      .sort((a, b) => a.priority - b.priority);

    if (visibleWidgets.length === 0) return;

    const terminalWidth = this.layoutState.terminalWidth;
    const widgetWidth = Math.floor(terminalWidth / 2) - 2;

    // 两列布局
    for (let i = 0; i < visibleWidgets.length; i += 2) {
      const leftWidget = visibleWidgets[i];
      const rightWidget = visibleWidgets[i + 1];

      const leftContent = this.formatWidget(leftWidget, widgetWidth);
      const rightContent = rightWidget ? this.formatWidget(rightWidget, widgetWidth) : ' '.repeat(widgetWidth);

      // 并排显示两个组件
      const leftLines = leftContent.split('\n');
      const rightLines = rightContent.split('\n');
      const maxLines = Math.max(leftLines.length, rightLines.length);

      for (let j = 0; j < maxLines; j++) {
        const leftLine = leftLines[j] || ' '.repeat(widgetWidth);
        const rightLine = rightLines[j] || ' '.repeat(widgetWidth);
        console.log(leftLine + ' │ ' + rightLine);
      }

      if (i + 1 < visibleWidgets.length) {
        console.log(chalk.gray('─'.repeat(terminalWidth)));
      }
    }
  }

  private formatWidget(widget: DashboardWidget, width: number): string {
    const lines: string[] = [];

    // 标题
    const title = chalk.bold(widget.title);
    lines.push('┌─' + title + ' '.repeat(Math.max(0, width - title.length - 3)));

    // 内容
    const contentLines = widget.content.split('\n');
    for (const line of contentLines) {
      const truncatedLine = line.length > width - 2 ? line.substring(0, width - 5) + '...' : line;
      lines.push('│ ' + truncatedLine.padEnd(width - 3));
    }

    // 填充剩余空间
    const minHeight = 3;
    while (lines.length < minHeight) {
      lines.push('│ ' + ' '.repeat(width - 3));
    }

    // 底部
    lines.push('└─' + '─'.repeat(width - 3));

    return lines.join('\n');
  }

  private renderStatusBar(): void {
    const currentProvider = config.getCurrentProvider();
    const currentSession = sessionManagerV2.getCurrentSession();

    let statusBar = '';

    // 左侧信息
    if (currentProvider) {
      const providerName = currentProvider.name === 'deepseek' ? 'DeepSeek' :
                         currentProvider.name === 'openai' ? 'OpenAI' :
                         currentProvider.name;
      statusBar += `${providerName} • ${currentSession?.metadata.title || 'New Chat'}`;
    } else {
      statusBar += 'No Model • New Chat';
    }

    // 中间模式指示
    const modeIndicator = this.getModeIndicator();

    // 右侧状态
    let rightStatus = '';
    if (this.isProcessing) {
      rightStatus = this.statusIndicator ?
        `${this.getStatusIcon(this.statusIndicator.type)}` :
        ' ●';
    }

    const terminalWidth = this.layoutState.terminalWidth;
    const leftWidth = statusBar.length;
    const modeWidth = modeIndicator.length;
    const rightWidth = rightStatus.length;
    const padding = terminalWidth - leftWidth - modeWidth - rightWidth - 4; // 4 for separators

    if (padding > 0) {
      statusBar += ' '.repeat(Math.floor(padding / 2)) + ' │ ' + modeIndicator + ' │ ' + ' '.repeat(Math.ceil(padding / 2)) + rightStatus;
    }

    console.log(chalk.bgRgb(40, 44, 52).white(statusBar));
  }

  private getModeIndicator(): string {
    switch (this.currentMode) {
      case LayoutMode.CHAT:
        return chalk.blue('💬 Chat');
      case LayoutMode.DASHBOARD:
        return chalk.cyan('📊 Dashboard');
      case LayoutMode.ADAPTIVE:
        return chalk.green('🤖 Adaptive');
      default:
        return 'Unknown';
    }
  }

  private renderOutputArea(): void {
    const outputLines = this.getOutputContent();
    const availableLines = this.layoutState.outputHeight;

    const startIndex = Math.max(0, outputLines.length - availableLines);
    const displayLines = outputLines.slice(startIndex, startIndex + availableLines);

    displayLines.forEach(line => {
      console.log(line);
    });
  }

  private renderChatContent(): void {
    const welcomeMessage = this.getWelcomeMessage();
    console.log(welcomeMessage);

    // 显示最近的对话
    const recentMessages = this.messages.slice(-5);
    recentMessages.forEach(message => {
      const formattedLines = this.formatMessage(message);
      formattedLines.forEach(line => {
        console.log(line);
      });
    });
  }

  private getOutputContent(): string[] {
    const lines: string[] = [];

    if (this.messages.length === 0) {
      lines.push(this.getWelcomeMessage());
      return lines;
    }

    this.messages.forEach(message => {
      const messageLines = this.formatMessage(message);
      lines.push(...messageLines);
    });

    return lines;
  }

  private getWelcomeMessage(): string {
    const lines: string[] = [];

    lines.push(chalk.bold.blue('🚀 欢迎使用 AICLI - 混合布局版本'));
    lines.push('');

    const currentProvider = config.getCurrentProvider();
    if (currentProvider) {
      lines.push(`🤖 当前模型: ${currentProvider.name}/${config.get('currentModel')}`);
    } else {
      lines.push('⚠️  模型未配置，请设置 API 密钥');
    }

    lines.push(`📱 当前模式: ${this.getModeDescription()}`);
    lines.push('');
    lines.push('💡 快捷键:');
    lines.push('   Ctrl+L - 切换布局模式');
    lines.push('   Ctrl+T - 显示/隐藏仪表盘');
    lines.push('   Ctrl+H - 显示帮助');
    lines.push('   Ctrl+C - 退出');
    lines.push('');
    lines.push('🎯 开始输入消息来与 AI 对话...');

    return lines.join('\n');
  }

  private getModeDescription(): string {
    switch (this.currentMode) {
      case LayoutMode.CHAT:
        return '聊天模式 (流式对话)';
      case LayoutMode.DASHBOARD:
        return '仪表盘模式 (结构化显示)';
      case LayoutMode.ADAPTIVE:
        return '自适应模式 (智能切换)';
      default:
        return '未知模式';
    }
  }

  private formatMessage(message: MessageBlock): string[] {
    const lines: string[] = [];

    switch (message.type) {
      case 'user':
        lines.push(chalk.blue('👤 用户: ') + message.content);
        break;
      case 'assistant':
        lines.push(chalk.green('🤖 助手: ') + message.content);
        break;
      case 'system':
        lines.push(chalk.gray('ℹ️  系统: ') + message.content);
        break;
      case 'tool':
        lines.push(message.content);
        break;
      case 'error':
        lines.push(chalk.red('❌ 错误: ') + message.content);
        break;
      case 'status':
        lines.push(chalk.cyan('📊 状态: ') + message.content);
        break;
    }

    lines.push('');
    return lines;
  }

  private renderInputArea(): void {
    process.stdout.write(this.getInputPrompt());
  }

  private async handleUserInput(input: string): Promise<void> {
    if (this.isProcessing) {
      this.addMessage({
        type: 'system',
        content: '⏳ 正在处理上一个请求，请稍候...',
        timestamp: new Date()
      });
      return;
    }

    input = input.trim();
    if (!input) return;

    this.addToHistory(input);

    this.addMessage({
      type: 'user',
      content: input,
      timestamp: new Date()
    });

    if (input.startsWith('/')) {
      await this.handleSlashCommand(input);
      return;
    }

    this.isProcessing = true;
    this.currentInput = input;

    try {
      await this.streamManager.processMessage(input, {
        toolRegistry,
        permissionManager,
        sessionManager: sessionManagerV2,
        projectId: process.cwd()
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : '未知错误');
    } finally {
      this.isProcessing = false;
      this.currentInput = '';
      this.historyIndex = -1;
      this.statusIndicator = null;
      this.updateDashboardContent();
      this.rl.prompt();
    }
  }

  private async handleSlashCommand(input: string): Promise<void> {
    const command = input.slice(1);

    switch (command) {
      case 'help':
      case 'h':
        this.showHelp();
        break;
      case 'clear':
      case 'c':
        this.messages = [];
        this.renderOutput();
        break;
      case 'exit':
      case 'q':
        this.handleExit();
        break;
      case 'status':
      case 'st':
        this.showStatus();
        break;
      case 'mode':
        this.toggleMode();
        break;
      case 'dashboard':
      case 'dash':
        this.toggleDashboard();
        break;
      default:
        this.addMessage({
          type: 'system',
          content: `❓ 未知命令: ${command}`,
          timestamp: new Date()
        });
    }
  }

  private toggleMode(): void {
    const modes = [LayoutMode.CHAT, LayoutMode.DASHBOARD, LayoutMode.ADAPTIVE];
    const currentIndex = modes.indexOf(this.currentMode);
    this.currentMode = modes[(currentIndex + 1) % modes.length];

    this.layoutState.mode = this.currentMode;
    this.initializeLayoutState();

    this.addMessage({
      type: 'system',
      content: `🔄 切换到${this.getModeDescription()}`,
      timestamp: new Date()
    });

    this.renderOutput();
  }

  private toggleDashboard(): void {
    if (this.currentMode === LayoutMode.CHAT) {
      this.currentMode = LayoutMode.DASHBOARD;
      this.layoutState.mode = LayoutMode.DASHBOARD;
      this.initializeLayoutState();
    } else {
      this.currentMode = LayoutMode.CHAT;
      this.layoutState.mode = LayoutMode.CHAT;
      this.initializeLayoutState();
    }

    this.addMessage({
      type: 'system',
      content: `🔄 切换到${this.getModeDescription()}`,
      timestamp: new Date()
    });

    this.renderOutput();
  }

  private showHelp(): void {
    const helpText = [
      '📚 可用命令:',
      '',
      '🔧 基础命令:',
      '   /help, /h     - 显示帮助',
      '   /clear, /c    - 清空屏幕',
      '   /exit, /q     - 退出程序',
      '   /status, /st  - 显示状态',
      '',
      '🎨 布局控制:',
      '   /mode         - 切换布局模式',
      '   /dashboard    - 切换仪表盘显示',
      '',
      '⌨️  快捷键:',
      '   Ctrl+L        - 切换布局模式',
      '   Ctrl+T        - 显示/隐藏仪表盘',
      '   Ctrl+H        - 显示帮助',
      '   Ctrl+C        - 退出程序',
      '',
      '💡 布局模式:',
      '   💬 Chat        - 流式聊天布局',
      '   📊 Dashboard   - 仪表盘布局',
      '   🤖 Adaptive    - 自适应布局'
    ].join('\n');

    this.addMessage({
      type: 'system',
      content: helpText,
      timestamp: new Date()
    });
  }

  private showStatus(): void {
    const currentProvider = config.getCurrentProvider();
    const currentSession = sessionManagerV2.getCurrentSession();

    const statusText = [
      '📊 系统状态:',
      '',
      `🤖 模型: ${currentProvider?.name || '未配置'}/${config.get('currentModel') || '未设置'}`,
      `📱 模式: ${this.getModeDescription()}`,
      `💬 消息: ${this.messages.length}`,
      `📁 会话: ${currentSession?.metadata.title || '新会话'}`,
      `🔧 工具: ${Object.keys(toolRegistry).length} 个可用`,
      `⚡ 处理: ${this.isProcessing ? '进行中' : '空闲'}`
    ].join('\n');

    this.addMessage({
      type: 'system',
      content: statusText,
      timestamp: new Date()
    });
  }

  private addToHistory(input: string): void {
    if (this.inputHistory.length === 0 || this.inputHistory[this.inputHistory.length - 1] !== input) {
      this.inputHistory.push(input);
      if (this.inputHistory.length > 100) {
        this.inputHistory.shift();
      }
    }
    this.historyIndex = -1;
  }

  private completer(line: string): [string[], string] {
    const completions: string[] = [];

    if (line.startsWith('/')) {
      const partial = line.slice(1);
      const commands = ['help', 'h', 'clear', 'c', 'exit', 'q', 'status', 'st', 'mode', 'dashboard', 'dash'];
      completions.push(
        ...commands
          .filter(cmd => cmd.startsWith(partial))
          .map(cmd => '/' + cmd)
      );
    }

    // 智能建议保持不变...
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('分析') || lowerLine.includes('项目')) {
      completions.push('analyze project', 'show project structure');
    }
    if (lowerLine.includes('文件') || lowerLine.includes('读取')) {
      completions.push('read file:', 'list files', 'search files');
    }

    return [[...new Set(completions)].slice(0, 8), line];
  }

  private handleInterrupt(): void {
    if (this.isProcessing) {
      this.isProcessing = false;
      this.statusIndicator = null;
      this.addMessage({
        type: 'system',
        content: chalk.yellow('⚠️ 操作已取消'),
        timestamp: new Date()
      });
      this.updateDashboardContent();
      this.rl.prompt();
    } else {
      this.handleExit();
    }
  }

  private handleExit(): void {
    this.cleanup();
    console.log(chalk.yellow('\n👋 再见!'));
    process.exit(0);
  }

  private handleResize(): void {
    this.layoutState.terminalWidth = process.stdout.columns || 80;
    this.layoutState.terminalHeight = process.stdout.rows || 24;
    this.initializeLayoutState();
    this.renderOutput();
  }

  private cleanup(): void {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }

    if (this.rl) {
      this.rl.close();
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    process.stdout.write('\x1b[?25h');
  }

  public async start(): Promise<void> {
    console.clear();
    this.renderOutput();
    this.rl.prompt();
  }

  public setMode(mode: LayoutMode): void {
    this.currentMode = mode;
    this.layoutState.mode = mode;
    this.initializeLayoutState();
    this.renderOutput();
  }

  public getMode(): LayoutMode {
    return this.currentMode;
  }
}