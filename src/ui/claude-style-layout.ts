import readline from 'readline';
import chalk from 'chalk';
import { config } from '../config';
import { projectContext } from '../core/project-context';
import { StreamManager, StreamChunk } from '../core/stream-manager';
import { sessionManagerV2 } from '../core/session-manager-v2';
import { initializeTools, toolRegistry, permissionManager } from '../core/tool-system-init';

export interface LayoutState {
  statusBarHeight: number;
  outputHeight: number;
  inputHeight: number;
  cursorPosition: number;
  isInputActive: boolean;
  contentBuffer: string[];
  lastRenderTime: number;
}

export interface MessageBlock {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool' | 'error';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ClaudeStyleLayout {
  private rl: readline.Interface;
  private streamManager: StreamManager;
  private layoutState: LayoutState;
  private messages: MessageBlock[] = [];
  private currentInput = '';
  private isProcessing = false;
  private abortController: AbortController;
  private permissionMode: 'normal' | 'auto' | 'plan' = 'normal';
  private inputHistory: string[] = [];
  private historyIndex = -1;

  constructor() {
    // 初始化工具系统
    initializeTools();
    this.streamManager = new StreamManager();
    this.abortController = new AbortController();

    // 获取终端尺寸
    const terminalHeight = process.stdout.rows || 24;
    this.layoutState = {
      statusBarHeight: 1, // 状态栏高度
      outputHeight: terminalHeight - 3, // 输出区域（总高度减去状态栏和输入行）
      inputHeight: 1, // 输入区域高度（只占一行）
      cursorPosition: 0,
      isInputActive: true,
      contentBuffer: [],
      lastRenderTime: 0
    };

    // 配置 readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getInputPrompt(),
      completer: this.completer.bind(this),
      history: this.inputHistory,
      historySize: 1000
    });

    this.setupEventListeners();
    this.updateTerminalSettings();
  }

  private getInputPrompt(): string {
    // Claude CLI 风格的极简提示符
    return '> ';
  }

  private setupEventListeners(): void {
    // 监听流式响应
    this.streamManager.subscribe(this.handleStreamChunk.bind(this));

    // 监听用户输入
    this.rl.on('line', this.handleUserInput.bind(this));

    // 监听 SIGINT (Ctrl+C)
    process.on('SIGINT', this.handleInterrupt.bind(this));

    // 监听窗口大小变化
    process.stdout.on('resize', this.handleResize.bind(this));

    // 监听原始按键输入 - 暂时禁用以测试readline
    // if (process.stdin.isTTY) {
    //   process.stdin.setRawMode(true);
    //   process.stdin.on('data', this.handleRawInput.bind(this));
    // }

    // 处理进程退出
    process.on('exit', () => this.cleanup());
  }

  private updateTerminalSettings(): void {
    // 设置终端标题
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b]0;AICLI - Claude Style\x07');
    }

    // 不隐藏光标，保持用户可以正常输入
    // process.stdout.write('\x1b[?25l');
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
    // 将内容添加到当前消息缓冲区
    if (this.messages.length === 0 || this.messages[this.messages.length - 1].type !== 'assistant') {
      this.addMessage({
        type: 'assistant',
        content: '',
        timestamp: new Date()
      });
    }

    const lastMessage = this.messages[this.messages.length - 1];
    lastMessage.content += content;

    // 实时渲染内容（提高性能，限制渲染频率）
    this.renderOutput();
  }

  private handleStatusUpdate(status: { type: string; message: string }): void {
    const statusMessage = this.formatStatusMessage(status);
    this.addMessage({
      type: 'system',
      content: statusMessage,
      timestamp: new Date(),
      metadata: { statusType: status.type }
    });
  }

  private handleToolCall(toolCall: { id: string; name: string; input: Record<string, unknown> }): void {
    const toolBox = this.formatToolCall(toolCall);
    this.addMessage({
      type: 'tool',
      content: toolBox,
      timestamp: new Date(),
      metadata: { toolId: toolCall.id, toolName: toolCall.name }
    });
  }

  private handleToolResult(toolResult: { id: string; result?: any; error?: string }): void {
    const resultBox = this.formatToolResult(toolResult);
    this.addMessage({
      type: 'tool',
      content: resultBox,
      timestamp: new Date(),
      metadata: { toolId: toolResult.id, isResult: true }
    });
  }

  private handleError(error: string): void {
    const errorBox = this.formatError(error);
    this.addMessage({
      type: 'error',
      content: errorBox,
      timestamp: new Date()
    });
  }

  private formatStatusMessage(status: { type: string; message: string }): string {
    switch (status.type) {
      case 'thinking':
        return chalk.yellow(`Thinking... ${status.message}`);
      case 'executing':
        return chalk.blue(`Executing... ${status.message}`);
      case 'completed':
        return chalk.green(`Completed: ${status.message}`);
      case 'failed':
        return chalk.red(`Failed: ${status.message}`);
      default:
        return chalk.gray(`${status.message}`);
    }
  }

  private formatToolCall(toolCall: { id: string; name: string; input: Record<string, unknown> }): string {
    const toolBox = chalk.blue('┌─ Tool Call');
    const toolName = chalk.blue(`│ ${toolCall.name}`);
    const toolId = chalk.gray(`│ ${toolCall.id}`);
    const separator = chalk.blue('├─ Input');
    const input = JSON.stringify(toolCall.input, null, 2);
    const formattedInput = chalk.white(`│ ${input.split('\n').join('\n│ ')}`);
    const bottom = chalk.blue('└─');

    return `${toolBox}\n${toolName}\n${toolId}\n${separator}\n${formattedInput}\n${bottom}`;
  }

  private formatToolResult(toolResult: { id: string; result?: any; error?: string }): string {
    const resultBox = chalk.green('┌─ Tool Result');
    const resultId = chalk.gray(`│ ${toolResult.id}`);

    let content = '';
    if (toolResult.error) {
      content = chalk.red(`│ Error: ${toolResult.error}`);
    } else {
      const resultStr = this.formatToolResultValue(toolResult.result);
      content = chalk.white(`│ ${resultStr.split('\n').join('\n│ ')}`);
    }

    const bottom = chalk.green('└─');

    return `${resultBox}\n${resultId}\n${content}\n${bottom}`;
  }

  private formatToolResultValue(result: any): string {
    if (result === null || result === undefined) {
      return 'No result';
    }

    if (typeof result === 'string') {
      return result;
    }

    if (typeof result === 'number' || typeof result === 'boolean') {
      return String(result);
    }

    if (Array.isArray(result)) {
      if (result.length === 0) return 'Empty array';
      return `Array with ${result.length} items`;
    }

    if (typeof result === 'object') {
      try {
        // 尝试安全地序列化对象
        const safeObj = this.getSafeObject(result);
        const jsonString = JSON.stringify(safeObj, null, 2);
        if (jsonString === '{}') {
          return 'Empty object';
        }
        return jsonString;
      } catch (error) {
        // 如果序列化失败，提供基本信息
        const keys = Object.keys(result).filter(key => {
          try {
            return typeof result[key] !== 'function';
          } catch {
            return false;
          }
        });
        if (keys.length === 0) return 'Object (no accessible properties)';
        return `Object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
      }
    }

    return String(result);
  }

  private getSafeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => this.getSafeObject(item));
    }

    // 处理普通对象
    if (typeof obj === 'object') {
      const safeObj: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          try {
            const value = obj[key];
            // 跳过函数和符号
            if (typeof value !== 'function' && typeof value !== 'symbol') {
              // 检查循环引用
              if (value === obj) {
                safeObj[key] = '[Circular reference]';
              } else {
                safeObj[key] = this.getSafeObject(value);
              }
            }
          } catch (error) {
            safeObj[key] = '[Error accessing property]';
          }
        }
      }
      return safeObj;
    }

    // 返回基本类型
    return obj;
  }

  private formatError(error: string): string {
    const errorBox = chalk.red('┌─ Error');
    const errorMessage = chalk.white(`│ ${error}`);
    const bottom = chalk.red('└─');

    return `${errorBox}\n${errorMessage}\n${bottom}`;
  }

  private addMessage(message: Omit<MessageBlock, 'id'>): void {
    const messageBlock: MessageBlock = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.messages.push(messageBlock);
    // 简单的消息显示，避免复杂的渲染逻辑
    this.displayMessage(messageBlock);
  }

  private showWelcome(): void {
    // Claude CLI 风格的简洁欢迎界面
    console.clear();

    // 渲染状态栏
    this.renderStatusBar();

    // 渲染欢迎信息
    const welcomeMessage = this.getWelcomeMessage();
    console.log(welcomeMessage);
  }

  private displayMessage(message: MessageBlock): void {
    // 简单的消息显示，避免复杂的渲染逻辑
    const formattedLines = this.formatMessage(message);
    formattedLines.forEach(line => {
      console.log(line);
    });

    // 重新显示提示符
    setTimeout(() => this.rl.prompt(), 10);
  }

  private renderOutput(): void {
    const now = Date.now();
    if (now - this.layoutState.lastRenderTime < 100) return; // 降低渲染频率到100ms

    this.layoutState.lastRenderTime = now;

    // 只有在不处理输入时才重新渲染
    if (!this.isProcessing) return;

    // 清除屏幕并重新渲染
    this.clearScreen();

    // 渲染状态栏
    this.renderStatusBar();

    // 渲染输出区域
    this.renderOutputArea();

    // 移动光标到输入位置（底部）并显示光标
    const terminalHeight = process.stdout.rows || 24;
    process.stdout.write(`\x1b[${terminalHeight}H`);
    process.stdout.write('\x1b[?25h'); // 显示光标
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  private renderStatusBar(): void {
    const currentProvider = config.getCurrentProvider();
    const currentModel = config.get('currentModel');
    const currentSession = sessionManagerV2.getCurrentSession();

    let statusBar = '';

    // 模型信息 (简化显示)
    if (currentProvider && currentModel) {
      // 简化模型名称显示
      const providerName = currentProvider.name === 'deepseek' ? 'DeepSeek' :
                         currentProvider.name === 'openai' ? 'OpenAI' :
                         currentProvider.name;
      statusBar += `${providerName} • ${currentSession?.metadata.title || 'New Chat'}`;
    } else {
      statusBar += 'No model • New Chat';
    }

    // 右侧状态指示
    let rightStatus = '';
    if (this.isProcessing) {
      rightStatus = ' ●'; // 处理中指示器
    }

    const terminalWidth = process.stdout.columns || 80;
    const padding = terminalWidth - statusBar.length - rightStatus.length;

    if (padding > 0) {
      statusBar += ' '.repeat(padding) + rightStatus;
    }

    // 更现代的状态栏样式
    process.stdout.write(chalk.bgRgb(40, 44, 52)(chalk.white(statusBar)) + '\n');
  }

  private renderOutputArea(): void {
    const outputLines = this.getOutputContent();
    const availableLines = this.layoutState.outputHeight;

    // 计算要显示的行数
    const startIndex = Math.max(0, outputLines.length - availableLines);
    const displayLines = outputLines.slice(startIndex, startIndex + availableLines);

    // 渲染内容
    displayLines.forEach(line => {
      process.stdout.write(line + '\n');
    });
  }

  private getOutputContent(): string[] {
    const lines: string[] = [];

    // 渲染欢迎信息
    if (this.messages.length === 0) {
      lines.push(this.getWelcomeMessage());
      return lines;
    }

    // 渲染消息
    this.messages.forEach(message => {
      const messageLines = this.formatMessage(message);
      lines.push(...messageLines);
    });

    return lines;
  }

  private getWelcomeMessage(): string {
    const lines: string[] = [];

    lines.push(chalk.bold.blue('Welcome to AICLI'));
    lines.push('');

    const currentProvider = config.getCurrentProvider();
    if (currentProvider) {
      lines.push(`Model: ${currentProvider.name}/${config.get('currentModel')}`);
    } else {
      lines.push('Model: Not configured');
    }

    lines.push('');
    lines.push('Type your message to start chatting.');
    lines.push('Type /help for commands, Ctrl+C to exit.');
    lines.push('');

    return lines.join('\n');
  }

  private formatMessage(message: MessageBlock): string[] {
    const lines: string[] = [];

    switch (message.type) {
      case 'user':
        // 用户消息：蓝色文本，无前缀
        lines.push(chalk.blue(message.content));
        break;
      case 'assistant':
        // 助手消息：绿色文本，无前缀
        lines.push(chalk.green(message.content));
        break;
      case 'system':
        // 系统消息：灰色文本，简洁格式
        lines.push(chalk.gray(message.content));
        break;
      case 'tool':
        // 工具消息：保持原有的框式格式，但简化颜色
        lines.push(message.content);
        break;
      case 'error':
        // 错误消息：红色文本，简洁格式
        lines.push(chalk.red(message.content));
        break;
    }

    lines.push(''); // 添加空行分隔
    return lines;
  }

  private renderInputArea(): void {
    // 显示输入提示符
    process.stdout.write(this.getInputPrompt());
  }

  private async handleUserInput(input: string): Promise<void> {
    if (this.isProcessing) {
      this.addMessage({
        type: 'system',
        content: '正在处理上一个请求，请稍候...',
        timestamp: new Date()
      });
      return;
    }

    input = input.trim();
    if (!input) {
      return;
    }

    // 添加到历史记录
    this.addToHistory(input);

    // 显示用户消息
    this.addMessage({
      type: 'user',
      content: input,
      timestamp: new Date()
    });

    // 检查是否是斜杠命令
    if (input.startsWith('/')) {
      await this.handleSlashCommand(input);
      return;
    }

    this.isProcessing = true;
    this.currentInput = input;

    try {
      // 处理用户消息
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
      // 处理完成后重新显示提示符
      this.rl.prompt();
    }
  }

  private async handleSlashCommand(input: string): Promise<void> {
    const command = input.slice(1);

    // 简单的命令处理
    switch (command) {
      case 'help':
        this.showHelp();
        break;
      case 'clear':
        this.messages = [];
        this.showWelcome();
        break;
      case 'exit':
        this.handleExit();
        break;
      case 'status':
        this.showStatus();
        break;
      default:
        this.addMessage({
          type: 'system',
          content: `未知命令: ${command}`,
          timestamp: new Date()
        });
    }
  }

  private showHelp(): void {
    const helpText = [
      'Available commands:',
      '',
      '/help     - Show this help',
      '/clear    - Clear screen',
      '/exit     - Exit',
      '/status   - Show status',
      '/provider - Manage AI providers',
      '/model    - Manage models',
      '/sessions - Session management',
      '/tools    - Show available tools',
      '',
      'Shortcuts: Ctrl+L (clear), Ctrl+C (exit), Tab (autocomplete)'
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
      'Status:',
      '',
      `Model: ${currentProvider?.name || 'None'}/${config.get('currentModel') || 'None'}`,
      `Permission mode: ${this.permissionMode}`,
      `Messages: ${this.messages.length}`,
      `Session: ${currentSession?.metadata.title || 'None'}`,
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
      const commands = ['help', 'clear', 'exit', 'status', 'provider', 'model', 'sessions', 'tools', 'permissions'];
      completions.push(
        ...commands
          .filter(cmd => cmd.startsWith(partial))
          .map(cmd => '/' + cmd)
      );
    }

    // 智能建议
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('分析') || lowerLine.includes('项目')) {
      completions.push('analyze project', 'show project structure');
    }
    if (lowerLine.includes('文件') || lowerLine.includes('读取')) {
      completions.push('read file:', 'list files', 'search files');
    }
    if (lowerLine.includes('代码') || lowerLine.includes('编程')) {
      completions.push('write code', 'analyze code', 'optimize code');
    }
    if (lowerLine.includes('帮助') || lowerLine.includes('help')) {
      completions.push('what can you do', 'how to use');
    }

    // 去重并限制数量
    return [[...new Set(completions)].slice(0, 8), line];
  }

  private handleInterrupt(): void {
    if (this.isProcessing) {
      this.isProcessing = false;
      this.addMessage({
        type: 'system',
        content: chalk.yellow('⚠️ 操作已取消'),
        timestamp: new Date()
      });
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
    const terminalHeight = process.stdout.rows || 24;
    this.layoutState.outputHeight = terminalHeight - 2; // 状态栏 + 输入行
    this.renderOutput();
  }

  private handleRawInput(data: Buffer): void {
    const key = data.toString();

    // Ctrl+L: 清屏
    if (key === '\x0c') {
      this.messages = [];
      this.renderOutput();
      return;
    }

    // Ctrl+C: 中断
    if (key === '\x03') {
      this.handleInterrupt();
      return;
    }
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

    // 显示光标
    process.stdout.write('\x1b[?25h');
  }

  public async start(): Promise<void> {
    // 使用简单的启动方式，避免干扰readline
    this.showWelcome();
    this.rl.prompt();
  }
}