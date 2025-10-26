import * as readline from 'readline';
import * as path from 'path';
import chalk from 'chalk';
import * as figlet from 'figlet';
import { TerminalFileUploader, FileAttachment } from '../core/terminal-file-uploader';
import { EnhancedClipboardHandler } from '../core/enhanced-clipboard-handler';
import { DeepSeekIntegration, DeepSeekConfig } from '../services/deepseek-integration';
import { PermissionManager } from '../core/permission-manager';
import { SessionManagerV3 } from '../core/session-manager-v3';
import { UpdateManager } from '../core/update-manager';

export interface EnhancedCLIOptions {
  provider: 'deepseek' | 'openai' | 'claude';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxFiles?: number;
  maxFileSize?: number;
  enableStreaming?: boolean;
  autoClearAttachments?: boolean;
  allowedTools?: string;
  disallowedTools?: string;
  addDir?: string[];
  permissionMode?: string;
  permissionPromptTool?: string;
  dangerouslySkipPermissions?: boolean;
  verbose?: boolean;
}

export class EnhancedCLIInterface {
  private uploader: TerminalFileUploader;
  private clipboardHandler: EnhancedClipboardHandler;
  private aiService: DeepSeekIntegration;
  private permissionManager: PermissionManager;
  private sessionManager: SessionManagerV3;
  private updateManager: UpdateManager;
  private readline!: readline.Interface;
  private currentAttachments: FileAttachment[] = [];
  private isStreaming = false;
  private currentSessionId: string | null = null;

  // 增强交互功能
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private multiLineBuffer: string[] = [];
  private isMultiLineMode = false;

  // Vim模式相关
  private vimMode = false;
  private vimBuffer = '';
  private vimCursorPos = 0;
  private vimModeType: 'insert' | 'normal' | 'visual' | 'command' = 'insert';
  private vimCommandBuffer = '';
  private vimLastYank = '';
  private vimIsRecording = false;
  private vimMacroBuffer = '';

  constructor(private options: EnhancedCLIOptions) {
    // 设置默认选项
    this.options = {
      ...options,
      autoClearAttachments: options.autoClearAttachments !== false // 默认启用自动清除
    };

    // 初始化文件上传器
    this.uploader = new TerminalFileUploader({
      maxFiles: this.options.maxFiles || 20,
      maxFileSize: this.options.maxFileSize || 50 * 1024 * 1024,
      enableDragDrop: true,
      enableClipboard: true
    });

    // 初始化剪贴板处理器
    this.clipboardHandler = new EnhancedClipboardHandler({
      enableImagePaste: true,
      enableFilePathPaste: true
    });

    // 初始化权限管理器
    this.permissionManager = new PermissionManager({
      allowedTools: this.options.allowedTools,
      disallowedTools: this.options.disallowedTools,
      permissionMode: this.options.permissionMode as any,
      dangerouslySkipPermissions: this.options.dangerouslySkipPermissions,
      additionalDirectories: this.options.addDir
    });

    // 初始化会话管理器
    this.sessionManager = new SessionManagerV3();

    // 初始化更新管理器
    this.updateManager = new UpdateManager();

    // 初始化AI服务
    this.aiService = new DeepSeekIntegration({
      apiKey: options.apiKey || '',
      baseUrl: options.baseUrl,
      model: options.model,
      maxTokens: 4000,
      temperature: 0.7
    });
  }

  public async start(): Promise<void> {
    // 设置事件监听
    this.setupEventListeners();

    // 初始化文件上传器（静默模式，不输出额外信息）
    await this.uploader.initializeSilent();

    // 检查更新
    await this.checkForUpdates();

    // 创建新会话
    await this.createNewSession();

    // 验证API配置
    await this.validateConfiguration();

    // 最后显示完整界面并启动命令行界面
    this.displayWelcome();
    this.setupReadline();
  }

  private displayWelcome(): void {
    console.clear();
    this.displayFullInterface();
  }

  private displayFullInterface(): void {
    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 24;

    // 显示简化版欢迎界面
    this.displaySimpleWelcome();
    this.displayStatusBar();
    this.displayInputArea();
  }

  private displayWelcomeHeader(): void {
    const modelInfo = this.aiService.getModelInfo();

    console.log('');
    console.log(chalk.cyan.bold('🚀 AICLI - Enhanced AI Programming Assistant'));
    console.log(chalk.gray(`🤖 ${modelInfo.model} (${modelInfo.provider})`));

    if (this.currentAttachments.length > 0) {
      console.log(chalk.blue(`📎 ${this.currentAttachments.length} 个附件已添加`));
    }

    if (this.currentSessionId) {
      console.log(chalk.blue(`📝 会话: ${this.currentSessionId.substring(0, 8)}...`));
    }

    console.log(chalk.gray('💬 开始对话，或输入 /help 查看帮助'));
    console.log('');
  }

  private displaySimpleWelcome(): void {
    const modelInfo = this.aiService.getModelInfo();

    // 极简欢迎界面 - Claude/qorder风格
    console.log('');
    console.log(chalk.cyan.bold('🚀 AICLI - Enhanced AI Programming Assistant'));
    console.log(chalk.gray(`🤖 ${modelInfo.model} (${modelInfo.provider})`));

    if (this.currentAttachments.length > 0) {
      console.log(chalk.blue(`📎 ${this.currentAttachments.length} 个附件已添加`));
    }

    console.log('');
    console.log(chalk.gray('💬 开始对话，或输入 /help 查看帮助'));
    console.log('');
  }

  private displaySimpleInterface(): void {
    // Simple interface for small terminals
    console.clear();

    const modelInfo = this.aiService.getModelInfo();

    console.log(chalk.cyan.bold('🚀 AICLI - Enhanced AI Programming Assistant'));
    console.log(chalk.gray('─'.repeat(Math.min(50, process.stdout.columns || 80))));
    console.log('');

    console.log(chalk.cyan(`🤖 Model: ${modelInfo.model} (${modelInfo.provider})`));
    console.log(chalk.green('✅ Ready for commands! Type /help for assistance.'));
    console.log('');

    console.log(chalk.white('Quick commands:'));
    console.log(chalk.gray('  /help    - Show all commands'));
    console.log(chalk.gray('  /paste   - Add files/screenshots'));
    console.log(chalk.gray('  /status  - Show system status'));
    console.log(chalk.gray('  /quit    - Exit'));
    console.log('');

    this.displayStatusBar();
    this.displayInputArea();
  }

  private displayHeader(): void {
    console.clear();

    // Top header bar
    const header = chalk.cyan.bold('🚀 AICLI - Enhanced AI Programming Assistant');
    const width = process.stdout.columns || 80;
    const padding = Math.max(0, Math.floor((width - header.length) / 2));
    const headerLine = ' '.repeat(padding) + header;

    console.log(chalk.gray('─'.repeat(width)));
    console.log(headerLine);
    console.log(chalk.gray('─'.repeat(width)));
    console.log('');
  }

  private displaySidebar(): void {
    // Adaptive sidebar width based on terminal size
    const terminalWidth = process.stdout.columns || 80;
    const sidebarWidth = Math.min(20, Math.floor(terminalWidth * 0.25));

    const sidebarContent = [
      '',
      chalk.cyan.bold('📋 Navigation'),
      chalk.gray('─'.repeat(Math.max(10, sidebarWidth - 2))),
      chalk.green('● Chat'),
      chalk.gray('  Files'),
      chalk.gray('  Settings'),
      chalk.gray('  Help'),
      '',
      chalk.cyan.bold('📎 Attachments'),
      chalk.gray('─'.repeat(Math.max(10, sidebarWidth - 2))),
      this.getAttachmentSummary(),
      '',
      chalk.cyan.bold('🔧 Quick Actions'),
      chalk.gray('─'.repeat(Math.max(10, sidebarWidth - 2))),
      chalk.gray('  📁 Upload File'),
      chalk.gray('  📋 Paste'),
      chalk.gray('  📊 Status'),
    ];

    // Create sidebar layout
    sidebarContent.forEach(line => {
      const paddedLine = line.length > sidebarWidth ? line.substring(0, sidebarWidth - 3) + '...' : line;
      process.stdout.write(paddedLine.padEnd(sidebarWidth) + chalk.gray('│') + '\n');
    });
  }

  private getAttachmentSummary(): string {
    const count = this.currentAttachments.length;
    if (count === 0) {
      return chalk.gray('  No attachments');
    } else {
      return chalk.white(`  ${count} file${count > 1 ? 's' : ''}`);
    }
  }

  private displayMainContent(): void {
    // Adaptive content width based on terminal size
    const terminalWidth = process.stdout.columns || 80;
    const sidebarWidth = Math.min(20, Math.floor(terminalWidth * 0.25));
    const contentWidth = Math.max(40, terminalWidth - sidebarWidth - 3);

    console.log('');
    console.log(chalk.gray('├' + '─'.repeat(sidebarWidth) + '┬' + '─'.repeat(contentWidth) + '┤'));
    console.log('');

    // Model info (adaptive formatting)
    const modelInfo = this.aiService.getModelInfo();
    const modelText = `🤖 AI Model: ${modelInfo.model.toUpperCase()} (${modelInfo.provider.toUpperCase()})`;
    if (modelText.length > contentWidth) {
      console.log(chalk.cyan.bold(modelText.substring(0, contentWidth - 3) + '...'));
    } else {
      console.log(chalk.cyan.bold(modelText));
    }

    // Capabilities (truncate if too long)
    const capabilitiesText = `Capabilities: ${modelInfo.capabilities.join(', ')}`;
    if (capabilitiesText.length > contentWidth) {
      console.log(chalk.gray(capabilitiesText.substring(0, contentWidth - 3) + '...'));
    } else {
      console.log(chalk.gray(capabilitiesText));
    }
    console.log('');

    // Welcome message
    const welcomeText = 'Welcome to AICLI! Your enhanced AI programming assistant.';
    if (welcomeText.length > contentWidth) {
      console.log(chalk.green.bold(welcomeText.substring(0, contentWidth - 3) + '...'));
    } else {
      console.log(chalk.green.bold(welcomeText));
    }
    console.log('');
    console.log(chalk.white('💡 Get started with:'));
    console.log(chalk.gray('  • Type your message to chat with AI'));
    console.log(chalk.gray('  • Use /paste to add screenshots or files'));
    console.log(chalk.gray('  • Drag files into the terminal window'));
    console.log(chalk.gray('  • Use /help to see all commands'));
    console.log('');
  }

  private displayStatusBar(): void {
    const width = process.stdout.columns || 80;
    let statusInfo = '';

    // 收集状态信息
    const parts: string[] = [];

    // 附件信息
    if (this.currentAttachments.length > 0) {
      parts.push(chalk.blue(`📎 ${this.currentAttachments.length}`));
    }

    // 流式状态
    if (this.isStreaming) {
      parts.push(chalk.yellow('🔄'));
    }

    // 会话信息
    if (this.currentSessionId) {
      parts.push(chalk.green(`📝 ${this.currentSessionId.substring(0, 8)}`));
    }

    // 权限信息（如果有特殊设置）
    const permissionSummary = this.getPermissionSummary();
    if (permissionSummary) {
      parts.push(permissionSummary);
    }

    // 模型信息
    const modelInfo = this.aiService.getModelInfo();
    parts.push(chalk.cyan(`🤖 ${modelInfo.model}`));

    // 构建状态栏
    if (parts.length > 0) {
      statusInfo = parts.join(' │ ');

      // 确保状态信息不超过终端宽度
      if (statusInfo.length > width - 4) {
        statusInfo = statusInfo.substring(0, width - 7) + '...';
      }

      console.log(chalk.gray(statusInfo));
    }
  }

  private displayInputArea(): void {
    console.log('');
    // 不在这里显示提示符，让 readline 处理
    // 这样可以避免提示符被覆盖或导致界面问题
  }

  private refreshInterface(): void {
    if (this.readline) {
      // Save cursor position
      process.stdout.write('\x1b[s');

      // Move to status bar position (bottom)
      const terminalHeight = process.stdout.rows || 24;
      process.stdout.write(`\x1b[${terminalHeight};1H`);

      // Clear status bar line and redraw
      process.stdout.write('\x1b[2K');
      this.displayStatusBar();

      // Restore cursor position
      process.stdout.write('\x1b[u');

      // Update prompt
      this.readline.setPrompt(this.buildPrompt());
    }
  }

  private async validateConfiguration(): Promise<void> {
    // 静默验证，不输出额外信息避免干扰界面
    // API配置状态将在状态栏中显示
    if (!this.options.apiKey) {
      // 可以在状态栏中显示配置状态，这里不输出
    } else {
      // 静默验证API密钥
      try {
        await this.aiService.validateApiKey();
      } catch (error) {
        // 静默处理验证错误
      }
    }
  }

  private setupEventListeners(): void {
    // 监听文件添加事件
    this.uploader.on('fileAdded', (attachment: FileAttachment) => {
      this.currentAttachments.push(attachment);
      this.displayAttachmentStatus();
      this.showAttachmentAddedPrompt();
    });

    // 监听文件删除事件
    this.uploader.on('fileRemoved', (attachment: FileAttachment) => {
      const index = this.currentAttachments.findIndex(a => a.id === attachment.id);
      if (index !== -1) {
        this.currentAttachments.splice(index, 1);
      }
      this.displayAttachmentStatus();
    });

    // 监听文件清空事件
    this.uploader.on('filesCleared', () => {
      this.currentAttachments = [];
      this.displayAttachmentStatus();
    });

    // 监听文件处理完成事件
    this.uploader.on('filesProcessed', (attachments: FileAttachment[]) => {
      console.log(chalk.green(`\n✅ 已处理 ${attachments.length} 个附件`));
    });

    // 监听剪贴板事件
    this.clipboardHandler.on('imagePasted', (attachment: FileAttachment) => {
      console.log(chalk.blue('🖼️ 检测到剪贴板图片，自动添加到附件列表'));
      this.currentAttachments.push(attachment);
      this.displayAttachmentStatus();
      this.showAttachmentAddedPrompt();
    });

    this.clipboardHandler.on('filePasted', (attachment: FileAttachment) => {
      console.log(chalk.blue('📎 检测到剪贴板文件，自动添加到附件列表'));
      this.currentAttachments.push(attachment);
      this.displayAttachmentStatus();
      this.showAttachmentAddedPrompt();
    });

    this.clipboardHandler.on('textPasted', (attachment: FileAttachment) => {
      console.log(chalk.blue('📝 检测到剪贴板文本，自动添加到附件列表'));
      this.currentAttachments.push(attachment);
      this.displayAttachmentStatus();
      this.showAttachmentAddedPrompt();
    });
  }

  private setupReadline(): void {
    // 首先完全禁用终端的鼠标跟踪功能
    this.disableMouseTracking();

    // 尝试在非交互式环境中也提供基本功能
    if (!process.stdin.isTTY) {
      console.log(chalk.yellow('⚠️ 检测到非交互式环境，某些功能可能受限'));
      // 不退出程序，继续运行但可能会有功能限制
    }

    this.readline = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.buildPrompt(),
      terminal: true,
      historySize: 1000,
      // 禁用自动补全和默认的按键处理
      completer: undefined,
      tabSize: 4
    });

    // 设置键盘快捷键
    this.setupKeyboardShortcuts();

    // 设置终端为原始模式以支持Vim模式的单按键捕获
    // 注意：这需要在setupReadlineEnhancements中设置，因为readline需要控制

    this.readline.on('line', async (input: string) => {
      // 如果在Vim模式下，完全忽略line事件
      // Vim模式下的所有输入都由keypress处理器处理
      if (this.vimMode) {
        // 在Vim模式下，不显示提示符，不处理输入
        return;
      }

      const trimmedInput = input.trim();
      if (trimmedInput) {
        // 显示用户输入，类似ChatGPT
        if (!trimmedInput.startsWith('/')) {
          console.log('');
          console.log(chalk.green('👤 ') + trimmedInput);
        }
        await this.handleInput(trimmedInput);
      }
      this.readline.prompt();
    });

    this.readline.on('close', () => {
      this.cleanup();
      console.log(chalk.yellow('\n👋 再见！'));
      process.exit(0);
    });

    // 延迟一点显示提示符，让用户先看到完整的欢迎界面
    setTimeout(() => {
      if (this.readline) {
        this.readline.prompt();
      }
    }, 100);
  }

  private setupKeyboardShortcuts(): void {
    // 读取单字符输入
    process.stdin.on('data', (key) => {
      const keyStr = key.toString();

      // Ctrl+D 退出
      if (keyStr === '\u0004') {
        console.log(chalk.yellow('\n👋 再见！'));
        process.exit(0);
      }

      // Ctrl+L 清屏
      if (keyStr === '\u000C') {
        console.clear();
        this.displayWelcomeHeader();
        this.readline.prompt();
        return;
      }
    });

    // 设置SIGINT处理 (Ctrl+C)
    process.on('SIGINT', () => {
      if (this.isStreaming) {
        // 如果正在流式输出，中断流
        this.isStreaming = false;
        console.log(chalk.yellow('\n⚡ 已中断AI回复'));
        this.readline.prompt();
      } else {
        console.log(chalk.yellow('\n💡 输入 /quit 退出程序，或继续对话'));
        this.readline.prompt();
      }
    });

    // 增强readline输入处理
    if (this.readline) {
      this.setupReadlineEnhancements();
    }
  }

  private setupReadlineEnhancements(): void {
    // 处理特殊按键
    readline.emitKeypressEvents(process.stdin);

    // 启用原始模式以支持Vim模式的单按键捕获
    // 必须在readline创建之后设置，否则会冲突
    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (str, key) => {
      if (!key) return;

      // Vim模式处理
      if (this.vimMode) {
        const vimHandled = this.handleVimKeypress(str, key);
        if (vimHandled) {
          return;
        }
      }

      // Ctrl+L 清屏
      if (key.ctrl && key.name === 'l') {
        console.clear();
        this.displayWelcomeHeader();
        this.readline.prompt();
        return;
      }

      // 上箭头 - 历史导航 (简化版本)
      if (key.name === 'up' && this.commandHistory.length > 0) {
        if (this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          const historyCommand = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
          // 简单的输出替换方式
          process.stdout.write('\x1b[2K\r'); // 清除当前行
          process.stdout.write(this.buildPrompt() + historyCommand);
        }
        return;
      }

      // 下箭头 - 历史导航
      if (key.name === 'down') {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          const historyCommand = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
          process.stdout.write('\x1b[2K\r'); // 清除当前行
          process.stdout.write(this.buildPrompt() + historyCommand);
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          process.stdout.write('\x1b[2K\r'); // 清除当前行
          this.readline.prompt();
        }
        return;
      }

      // Esc+Esc - 编辑上一条消息
      if (key.name === 'escape' && this.lastEscapePress) {
        if (this.commandHistory.length > 0) {
          const lastCommand = this.commandHistory[this.commandHistory.length - 1];
          process.stdout.write('\x1b[2K\r'); // 清除当前行
          process.stdout.write(this.buildPrompt() + lastCommand);
        }
        this.lastEscapePress = undefined;
        return;
      } else if (key.name === 'escape') {
        this.lastEscapePress = Date.now();
        setTimeout(() => {
          this.lastEscapePress = undefined;
        }, 500);
        return;
      }

      // Shift+Enter - 多行输入
      if (key.name === 'enter' && key.shift) {
        this.handleMultiLineInput();
        return;
      }
    });
  }

  private lastEscapePress?: number;

  private handleMultiLineInput(): void {
    // 启用多行输入模式
    this.isMultiLineMode = true;
    console.log(chalk.green('✅ 多行输入模式已启用'));
    console.log(chalk.gray('💡 输入空行结束多行输入'));
    process.stdout.write(chalk.gray('... '));
  }

  private handleBackslashEnter(): void {
    console.log(chalk.gray('💡 检测到\\，准备多行输入'));
    this.isMultiLineMode = true;
    process.stdout.write(chalk.gray('... '));
  }

  private addToHistory(command: string): void {
    if (command.trim()) {
      // 避免重复添加最近的命令，提高性能
      const lastCommand = this.commandHistory[this.commandHistory.length - 1];
      if (lastCommand !== command) {
        this.commandHistory.push(command);
        // 限制历史记录数量
        if (this.commandHistory.length > 1000) {
          this.commandHistory = this.commandHistory.slice(-1000);
        }
      }
    }
    this.historyIndex = -1;
  }

  private disableMouseTracking(): void {
    // 发送ANSI序列来禁用所有鼠标跟踪模式
    if (process.stdout.isTTY) {
      // 禁用所有鼠标跟踪模式
      process.stdout.write('\x1b[?9l');     // 禁用X10鼠标跟踪
      process.stdout.write('\x1b[?1000l');  // 禁用VT200鼠标跟踪
      process.stdout.write('\x1b[?1001l');  // 禁用高亮鼠标跟踪
      process.stdout.write('\x1b[?1002l');  // 禁用按钮事件跟踪
      process.stdout.write('\x1b[?1003l');  // 禁用所有事件跟踪
      process.stdout.write('\x1b[?1006l');  // 禁用SGR鼠标跟踪
      process.stdout.write('\x1b[?1015l');  // 禁用URXVT鼠标跟踪

      // 只显示光标，不要重置终端（避免清屏）
      process.stdout.write('\x1b[?25h');    // 显示光标
      // process.stdout.write('\x1bc');        // 重置终端 - 注释掉，会清屏！
    }
  }

  private buildPrompt(): string {
    const attachmentCount = this.currentAttachments.length;
    const attachmentIndicator = attachmentCount > 0 ? chalk.cyan(`📎${attachmentCount} `) : '';

    // Vim模式指示器
    let vimIndicator = '';
    if (this.vimMode) {
      const modeColor = this.vimModeType === 'normal' ? chalk.green :
                       this.vimModeType === 'visual' ? chalk.yellow :
                       this.vimModeType === 'command' ? chalk.magenta : chalk.blue;
      vimIndicator = modeColor(`[${this.vimModeType.toUpperCase()}] `);
    }

    // 会话指示器
    let sessionIndicator = '';
    if (this.currentSessionId) {
      sessionIndicator = chalk.magenta(`[${this.currentSessionId.substring(0, 6)}] `);
    }

    // 更简洁的对话式提示符
    return `${attachmentIndicator}${vimIndicator}${sessionIndicator}${chalk.blue('❯ ')}`;
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return;

    // 如果在Vim模式下，完全忽略所有输入
    // Vim模式下的所有操作都由keypress处理器处理
    if (this.vimMode) {
      return;
    }

    try {
      // 处理多行输入模式
      if (this.isMultiLineMode || this.multiLineBuffer.length > 0) {
        if (input === '') {
          // 空行结束多行输入
          this.isMultiLineMode = false;
          const fullInput = this.multiLineBuffer.join('\n');
          this.multiLineBuffer = [];

          // 防止过长的多行输入
          if (fullInput.length > 50000) {
            console.log(chalk.red('❌ 输入内容过长，请分段提交'));
            return;
          }

          // 添加到历史记录
          this.addToHistory(fullInput);

          // 处理完整的输入
          await this.processFullInput(fullInput);
        } else {
          // 防止过多的行数
          if (this.multiLineBuffer.length >= 1000) {
            console.log(chalk.red('❌ 行数过多，请分段提交'));
            this.multiLineBuffer = [];
            this.isMultiLineMode = false;
            return;
          }
          // 继续多行输入
          this.multiLineBuffer.push(input);
        }
        return;
      }

      // 防止过长的单行输入
      if (input.length > 10000) {
        console.log(chalk.red('❌ 输入内容过长，请分段提交'));
        return;
      }

      // 处理Bash模式 (!前缀)
      if (input.startsWith('!')) {
        await this.handleBashCommand(input.slice(1));
        return;
      }

      // 检查是否是斜杠开头的输入
      if (input.startsWith('/')) {
        // 先判断是否是已知的命令
        const cmdName = input.slice(1).split(' ')[0].toLowerCase();
        const knownCommands = [
          'paste', 'p', 'attachments', 'att', 'clear', 'c', 'remove', 'rm',
          'upload', 'up', 'status', 'st', 'help', 'h', 'quit', 'q', 'exit',
          'vim', 'history', 'hist', 'shortcuts', 'keys', 'multiline', 'ml',
          'bash', 'cd', 'ls', 'pwd', 'cat', 'grep', 'find', 'tree', 'files',
          'search', 'provider', 'model', 'config', 'reset', 'session', 'sessions'
        ];
        
        if (knownCommands.includes(cmdName)) {
          // 是已知命令，直接处理
          await this.handleCommand(input);
          return;
        }
        
        // 不是已知命令，可能是文件路径，让uploader尝试处理
        if (await this.uploader.processInput(input)) {
          return;
        }
        
        // 既不是已知命令也不是有效文件路径，当作未知命令处理
        await this.handleCommand(input);
        return;
      }

      // 对于不以斜杠开头的输入，检查是否是文件路径
      if (await this.uploader.processInput(input)) {
        return;
      }

      // 添加到历史记录
      this.addToHistory(input);

      // 处理AI对话 - ChatGPT风格
      await this.handleAIMessage(input);
    } catch (error) {
      console.log(chalk.red(`❌ 处理输入时发生错误: ${error instanceof Error ? error.message : '未知错误'}`));
      // 重置多行输入状态
      this.multiLineBuffer = [];
      this.isMultiLineMode = false;
    }
  }

  private async processFullInput(input: string): Promise<void> {
    // 检查是否是斜杠开头的输入
    if (input.startsWith('/')) {
      // 先判断是否是已知的命令
      const cmdName = input.slice(1).split(' ')[0].toLowerCase();
      const knownCommands = [
        'paste', 'p', 'attachments', 'att', 'clear', 'c', 'remove', 'rm',
        'upload', 'up', 'status', 'st', 'help', 'h', 'quit', 'q', 'exit',
        'vim', 'history', 'hist', 'shortcuts', 'keys', 'multiline', 'ml',
        'bash', 'cd', 'ls', 'pwd', 'cat', 'grep', 'find', 'tree', 'files',
        'search', 'provider', 'model', 'config', 'reset', 'session', 'sessions'
      ];
      
      if (knownCommands.includes(cmdName)) {
        // 是已知命令，直接处理
        await this.handleCommand(input);
        return;
      }
      
      // 不是已知命令，可能是文件路径
      if (await this.uploader.processInput(input)) {
        return;
      }
      
      // 既不是已知命令也不是有效文件路径
      await this.handleCommand(input);
      return;
    }

    // 处理Bash模式
    if (input.startsWith('!')) {
      await this.handleBashCommand(input.slice(1));
      return;
    }

    // 对于不以斜杠开头的输入，检查是否是文件路径
    if (await this.uploader.processInput(input)) {
      return;
    }

    // 处理AI对话
    await this.handleAIMessage(input);
  }

  // 判断输入是否看起来像文件路径
  private looksLikeFilePath(input: string): boolean {
    // 如果包含文件扩展名，很可能是文件路径
    const hasExtension = /\.(txt|md|js|ts|json|pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|py|java|cpp|c|go|rs|html|css|vue|jsx|tsx|xml|yaml|yml|env|ini|conf|cfg)$/i.test(input);

    // 如果包含路径分隔符，很可能是文件路径
    const hasPathSeparators = input.includes('/') || input.includes('\\');

    // 如果是常见的文件路径模式
    const startsWithCommonPath = /^(\.|~|\/|[a-zA-Z]:)/.test(input);

    return hasExtension || (hasPathSeparators && input.length > 3) || startsWithCommonPath;
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).toLowerCase().split(' ');
    const fullArgs = args.join(' ');

    switch (cmd) {
      // 核心功能命令
      case 'paste':
      case 'p':
        await this.handlePaste();
        break;

      case 'attachments':
      case 'att':
        this.handleShowAttachments();
        break;

      case 'clear':
      case 'c':
        this.handleClear();
        break;

      case 'remove':
      case 'rm':
        this.handleRemove(args[0]);
        break;

      case 'upload':
      case 'up':
        await this.handleUpload(args[0]);
        break;

      case 'status':
      case 'st':
        this.handleStatus();
        break;

      case 'help':
      case 'h':
        this.handleHelp();
        break;

      case 'quit':
      case 'q':
      case 'exit':
        this.handleQuit();
        break;

      // 模型管理命令
      case 'model':
        if (fullArgs) {
          console.log(chalk.cyan(`🤖 切换到模型: ${fullArgs}`));
          console.log(chalk.gray('模型切换功能将在未来版本中实现'));
        } else {
          const modelInfo = this.aiService.getModelInfo();
          console.log(chalk.cyan(`🤖 当前模型: ${modelInfo.model} (${modelInfo.provider})`));
        }
        break;

      // 配置命令
      case 'config':
        this.handleStatus(); // 临时使用status显示配置信息
        break;

      // 清除对话历史
      case 'reset':
        console.log(chalk.yellow('🔄 对话历史已清除'));
        break;

      // 内存管理
      case 'memory':
        console.log(chalk.cyan('🧠 内存管理功能将在未来版本中实现'));
        break;

      // 增强交互功能命令
      case 'history':
      case 'hist':
        this.handleShowHistory();
        break;

      case 'clear-history':
        this.handleClearHistory();
        break;

      case 'vim':
        this.handleToggleVimMode();
        break;

      case 'multiline':
      case 'ml':
        this.handleToggleMultiLineMode();
        break;

      case 'shortcuts':
      case 'keys':
        this.handleShowShortcuts();
        break;

      default:
        console.log(chalk.red(`❌ 未知命令: ${cmd}`));
        console.log(chalk.gray('输入 /help 查看可用命令'));
    }
  }

  private async handlePaste(): Promise<void> {
    console.log(chalk.blue('📋 处理剪贴板内容...'));

    try {
      const attachment = await this.clipboardHandler.handlePaste();

      if (attachment) {
        // 同步到上传器
        await this.uploader.addAttachmentsFromPaths([attachment.originalPath]);
        console.log(chalk.green(`✅ 已添加剪贴板内容: ${attachment.filename}`));
      } else {
        console.log(chalk.yellow('⚠️ 剪贴板中没有可处理的内容'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ 处理剪贴板失败: ${error instanceof Error ? error.message : '未知错误'}`));
    }
  }

  private handleShowAttachments(): void {
    // Clear and redisplay interface with attachment details
    console.clear();
    this.displayHeader();
    this.displaySidebar();
    this.displayAttachmentDetails();
    this.displayStatusBar();
    this.displayInputArea();
  }

  private displayAttachmentDetails(): void {
    const contentWidth = (process.stdout.columns || 80) - 22;

    console.log(chalk.gray('├' + '─'.repeat(21) + '┬' + '─'.repeat(contentWidth) + '┤'));
    console.log('');
    console.log(chalk.cyan.bold('📎 Attachments'));
    console.log(chalk.gray('─'.repeat(contentWidth - 2)));

    if (this.currentAttachments.length === 0) {
      console.log(chalk.gray('  No attachments added yet'));
      console.log('');
      console.log(chalk.white('💡 Add attachments:'));
      console.log(chalk.gray('  • Use /paste to paste from clipboard'));
      console.log(chalk.gray('  • Drag files into the terminal'));
      console.log(chalk.gray('  • Use /upload [path] to upload specific files'));
    } else {
      this.currentAttachments.forEach((attachment, index) => {
        const icon = this.getFileIcon(attachment.type);
        const size = this.formatFileSize(attachment.size);
        const status = attachment.uploaded ? chalk.green('✅ Uploaded') : chalk.gray('○ Pending');

        console.log(chalk.white(`  ${index + 1}. ${icon} ${attachment.filename}`));
        console.log(chalk.gray(`      Size: ${size} | Status: ${status}`));
        if (attachment.originalPath) {
          console.log(chalk.gray(`      Path: ${attachment.originalPath}`));
        }
        console.log('');
      });

      console.log(chalk.white('💡 Options:'));
      console.log(chalk.gray(`  • Use /remove <number> to delete an attachment`));
      console.log(chalk.gray(`  • Use /clear to remove all attachments`));
    }
    console.log('');
  }

  private handleClear(): void {
    this.currentAttachments = [];
    this.uploader.clearAttachments();
    console.log(chalk.green('✅ 附件列表已清空'));
    this.displayAttachmentStatus();
  }

  private handleRemove(indexStr: string): void {
    const index = parseInt(indexStr) - 1;

    if (isNaN(index) || index < 0 || index >= this.currentAttachments.length) {
      console.log(chalk.red('❌ 无效的附件编号'));
      return;
    }

    const removed = this.currentAttachments.splice(index, 1)[0];
    console.log(chalk.green(`✅ 已删除: ${removed.filename}`));
    this.displayAttachmentStatus();
  }

  private async handleUpload(filePath?: string): Promise<void> {
    if (filePath) {
      // 上传指定文件
      const success = await this.uploader.addFile(filePath);
      if (success) {
        console.log(chalk.green(`✅ 已添加文件: ${path.basename(filePath)}`));
      }
    } else {
      // 显示当前附件的上传状态
      console.log(chalk.cyan('📤 附件上传状态:'));
      this.currentAttachments.forEach((attachment, index) => {
        const status = attachment.uploaded ? chalk.green('✅ 已上传') : chalk.gray('○ 待上传');
        console.log(chalk.gray(`   ${index + 1}. ${attachment.filename} ${status}`));
      });
    }
  }

  private handleStatus(): void {
    // Clear and redisplay interface with status content
    console.clear();
    this.displayHeader();
    this.displaySidebar();
    this.displayStatusContent();
    this.displayStatusBar();
    this.displayInputArea();
  }

  private displayStatusContent(): void {
    const contentWidth = (process.stdout.columns || 80) - 22;
    const modelInfo = this.aiService.getModelInfo();

    console.log(chalk.gray('├' + '─'.repeat(21) + '┬' + '─'.repeat(contentWidth) + '┤'));
    console.log('');
    console.log(chalk.cyan.bold('📊 System Status'));
    console.log(chalk.gray('─'.repeat(contentWidth - 2)));

    console.log(chalk.white('🤖 AI Configuration:'));
    console.log(chalk.gray(`  Provider: ${modelInfo.provider.toUpperCase()}`));
    console.log(chalk.gray(`  Model: ${modelInfo.model}`));
    console.log(chalk.gray(`  Capabilities: ${modelInfo.capabilities.join(', ')}`));
    console.log('');

    console.log(chalk.white('📎 Attachments:'));
    console.log(chalk.gray(`  Count: ${this.currentAttachments.length} files`));
    if (this.currentAttachments.length > 0) {
      const totalSize = this.currentAttachments.reduce((sum, att) => sum + att.size, 0);
      console.log(chalk.gray(`  Total Size: ${this.formatFileSize(totalSize)}`));
    }
    console.log('');

    console.log(chalk.white('⚙️  Application Settings:'));
    console.log(chalk.gray(`  Streaming: ${this.options.enableStreaming ? 'Enabled' : 'Disabled'}`));
    console.log(chalk.gray(`  Auto-clear: ${this.options.autoClearAttachments ? 'Enabled' : 'Disabled'}`));
    console.log(chalk.gray(`  Max Files: ${this.options.maxFiles || 20}`));
    console.log(chalk.gray(`  Max File Size: ${this.formatFileSize(this.options.maxFileSize || 50 * 1024 * 1024)}`));
    console.log('');

    console.log(chalk.white('🔑 API Configuration:'));
    console.log(chalk.gray(`  API Key: ${this.options.apiKey ? 'Configured' : 'Not configured'}`));
    console.log(chalk.gray(`  Base URL: ${this.options.baseUrl || 'Default'}`));
    console.log('');
  }

  private handleHelp(): void {
    // 简洁的帮助显示，符合对话式界面
    console.log('');
    console.log(chalk.cyan('📖 可用命令:'));
    console.log('');

    console.log(chalk.white('核心功能:'));
    console.log(chalk.gray('  /help, /h              - 显示帮助'));
    console.log(chalk.gray('  /paste, /p             - 粘贴剪贴板内容'));
    console.log(chalk.gray('  /attachments, /att     - 查看附件列表'));
    console.log(chalk.gray('  /clear, /c             - 清除所有附件'));
    console.log(chalk.gray('  /status, /st           - 显示系统状态'));
    console.log(chalk.gray('  /reset                 - 清除对话历史'));
    console.log(chalk.gray('  /quit, /q              - 退出程序'));
    console.log('');

    console.log(chalk.white('高级功能:'));
    console.log(chalk.gray('  /model [name]          - 查看/切换AI模型'));
    console.log(chalk.gray('  /config                - 查看配置信息'));
    console.log(chalk.gray('  /memory                - 内存管理 (开发中)'));
    console.log('');

    console.log(chalk.white('文件操作:'));
    console.log(chalk.gray('  /ls, /list            - 列出文件'));
    console.log(chalk.gray('  /cat <file>           - 查看文件内容'));
    console.log(chalk.gray('  /search <term>         - 搜索文件内容'));
    console.log('');

    console.log(chalk.white('快捷键:'));
    console.log(chalk.gray('  Ctrl+C                - 中断AI回复/取消输入'));
    console.log(chalk.gray('  Ctrl+D                - 退出程序'));
    console.log(chalk.gray('  Ctrl+L                - 清屏'));
    console.log(chalk.gray('  上/下箭头              - 命令历史导航'));
    console.log(chalk.gray('  Esc+Esc               - 编辑上一条消息'));
    console.log(chalk.gray('  Shift+Enter           - 多行输入模式'));
    console.log(chalk.gray('  \\ + Enter             - 换行继续输入'));
    console.log('');

    console.log(chalk.white('增强功能:'));
    console.log(chalk.gray('  !命令                  - Bash模式执行shell命令'));
    console.log(chalk.gray('  /history, /hist       - 查看命令历史'));
    console.log(chalk.gray('  /clear-history         - 清空命令历史'));
    console.log(chalk.gray('  /multiline, /ml       - 切换多行输入模式'));
    console.log(chalk.gray('  /vim                  - 切换Vim编辑模式'));
    console.log(chalk.gray('  /shortcuts, /keys     - 显示快捷键帮助'));
    console.log('');

    console.log(chalk.gray('直接输入消息开始对话，或输入文件路径添加附件'));
    console.log('');
  }

  private displayHelpContent(): void {
    const contentWidth = (process.stdout.columns || 80) - 22;

    console.log(chalk.gray('├' + '─'.repeat(21) + '┬' + '─'.repeat(contentWidth) + '┤'));
    console.log('');
    console.log(chalk.cyan.bold('📖 Help & Commands'));
    console.log(chalk.gray('─'.repeat(contentWidth - 2)));

    console.log(chalk.white('🔧 Basic Commands:'));
    console.log(chalk.gray('  /help, /h                  - Show this help'));
    console.log(chalk.gray('  /paste, /p                 - Paste from clipboard'));
    console.log(chalk.gray('  /attachments, /att         - View attachments'));
    console.log(chalk.gray('  /clear, /c                 - Clear all attachments'));
    console.log(chalk.gray('  /remove <n>, /rm <n>       - Remove attachment #n'));
    console.log(chalk.gray('  /upload [path], /up [path] - Upload file'));
    console.log(chalk.gray('  /status, /st               - Show system status'));
    console.log(chalk.gray('  /quit, /q                  - Exit program'));
    console.log('');

    console.log(chalk.white('📁 File Operations:'));
    console.log(chalk.gray('  /ls, /list, /dir           - List files'));
    console.log(chalk.gray('  /cat, /read, /view <file>  - View file content'));
    console.log(chalk.gray('  /tree, /files              - Show file tree'));
    console.log(chalk.gray('  /search, /find, /grep      - Search files'));
    console.log('');

    console.log(chalk.white('💡 Pro Tips:'));
    console.log(chalk.gray('  • Type messages directly to chat with AI'));
    console.log(chalk.gray('  • Enter file paths to add as attachments'));
    console.log(chalk.gray('  • Drag files into terminal to add them'));
    console.log(chalk.gray('  • Supports images, documents, code files'));
    console.log(chalk.gray('  • Attachments auto-clear after AI response'));
    console.log('');

    console.log(chalk.white('⌨️  Shortcuts:'));
    console.log(chalk.gray('  Ctrl+C  - Exit program / Cancel streaming'));
    console.log(chalk.gray('  Ctrl+V  - Paste clipboard content'));
    console.log(chalk.gray('  ↑/↓     - Navigate history'));
    console.log(chalk.gray('  Tab     - Auto-complete commands'));
    console.log('');
  }

  private handleQuit(): void {
    this.readline.close();
  }

  private async handleAIMessage(message: string): Promise<void> {
    if (!this.options.apiKey) {
      console.log(chalk.yellow('⚠️ 未配置API密钥，无法与AI对话'));
      console.log(chalk.gray('请设置环境变量后重启程序'));
      return;
    }

    if (this.isStreaming) {
      console.log(chalk.yellow('⚠️ 当前正在处理上一个请求，请稍候...'));
      return;
    }

    try {
      if (this.options.enableStreaming) {
        await this.sendStreamingMessage(message);
      } else {
        await this.sendRegularMessage(message);
      }
    } catch (error) {
      console.log(chalk.red(`❌ AI请求失败: ${error instanceof Error ? error.message : '未知错误'}`));
    }
  }

  private async sendRegularMessage(message: string): Promise<void> {
    const response = await this.aiService.sendMessageWithAttachments(message, this.currentAttachments);

    // AI响应已在 sendMessageWithAttachments 中显示
    console.log('');

    // 自动清除附件
    this.clearAttachmentsAfterConversation();
  }

  private async sendStreamingMessage(message: string): Promise<void> {
    this.isStreaming = true;

    // ChatGPT风格的对话显示
    console.log('');
    console.log(chalk.blue('🤖'));

    let fullResponse = '';

    await this.aiService.sendMessageWithAttachmentsStream(
      message,
      this.currentAttachments,
      (chunk: string) => {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
    );

    console.log('');

    this.isStreaming = false;

    // 自动清除附件
    this.clearAttachmentsAfterConversation();
  }

  
  private displayAttachmentStatus(): void {
    // Refresh the interface to show updated attachment count
    this.refreshInterface();
  }

  private showAttachmentAddedPrompt(): void {
    // 不输出额外信息，界面更新会显示附件状态
    // 用户的注意力集中在主界面的状态变化上
  }

  private clearAttachmentsAfterConversation(): void {
    if (this.options.autoClearAttachments && this.currentAttachments.length > 0) {
      this.currentAttachments = [];
      this.uploader.clearAttachments();

      // 静默清除，界面会自动更新显示状态
      this.displayAttachmentStatus();
    }
  }

  private getFileIcon(type: string): string {
    const icons = {
      image: '🖼️',
      document: '📄',
      text: '📝',
      binary: '💾',
      unknown: '📎'
    };
    return icons[type as keyof typeof icons] || icons.unknown;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private cleanup(): void {
    // 清理资源
    this.clipboardHandler.cleanup();

    // 清理临时文件
    try {
      const os = require('os');
      const fs = require('fs');

      const tempDirs = [
        path.join(os.tmpdir(), 'aicli-drag-drop'),
        path.join(os.tmpdir(), 'aicli-clipboard')
      ];

      tempDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach((file: string) => {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch (error) {
              // 忽略删除错误
            }
          });
        }
      });
    } catch (error) {
      // 忽略清理错误
    }
  }

  // 检查更新
  private async checkForUpdates(): Promise<void> {
    try {
      if (this.options.verbose) {
        console.log(chalk.blue('🔍 检查更新...'));
      }

      const updateInfo = await this.updateManager.checkForUpdates();

      if (updateInfo.updateAvailable) {
        console.log(chalk.green(`🚀 发现新版本: ${updateInfo.latestVersion}`));
        console.log(chalk.yellow(`当前版本: ${updateInfo.currentVersion}`));
        console.log(chalk.gray('运行 "aicli update" 进行更新'));
        console.log('');
      } else if (this.options.verbose) {
        console.log(chalk.gray(`✅ 已是最新版本 (${updateInfo.currentVersion})`));
      }
    } catch (error) {
      if (this.options.verbose) {
        console.log(chalk.yellow('⚠️  无法检查更新'));
      }
    }
  }

  // 创建新会话
  private async createNewSession(): Promise<void> {
    try {
      this.currentSessionId = this.sessionManager.createSession({
        provider: this.options.provider,
        model: this.options.model
      });

      if (this.options.verbose) {
        console.log(chalk.green(`📝 新会话已创建: ${this.currentSessionId}`));
      }
    } catch (error) {
      console.error(chalk.red('❌ 创建会话失败:'), error);
    }
  }

  // 获取权限摘要
  private getPermissionSummary(): string {
    const summary = this.permissionManager.getPermissionSummary();

    let info = '';
    if (summary.mode !== 'default') {
      info += chalk.blue(`权限模式: ${summary.mode} `);
    }
    if (summary.dangerouslySkipped) {
      info += chalk.red('权限已跳过 ');
    }
    if (summary.allowedTools.length > 0) {
      info += chalk.green(`允许工具: ${summary.allowedTools.length}个 `);
    }
    if (summary.disallowedTools.length > 0) {
      info += chalk.red(`禁止工具: ${summary.disallowedTools.length}个 `);
    }

    return info;
  }

  // 获取会话信息
  private getSessionInfo(): string {
    if (!this.currentSessionId) {
      return chalk.gray('无会话');
    }

    const sessionCount = this.sessionManager.getAllSessions().then(sessions => sessions.length);
    return chalk.blue(`会话: ${this.currentSessionId.substring(0, 8)}...`);
  }

  // 危险的命令列表
  private readonly DANGEROUS_COMMANDS = [
    'rm -rf /', 'sudo rm', 'sudo shutdown', 'sudo reboot',
    'sudo halt', 'sudo poweroff', 'format', 'del /f /s /q',
    'chmod -R 777 /', 'chown -R', 'dd if=/dev/zero',
    'mkfs', 'fdisk', 'diskutil', ':(){ :|:& };:',
    'fork bomb', 'wget http://', 'curl http://',
    'nc -l', 'ncat -l', 'socat TCP-LISTEN'
  ];

  // Bash命令处理
  private async handleBashCommand(command: string): Promise<void> {
    if (!command.trim()) {
      console.log(chalk.yellow('💡 Bash模式: 输入shell命令，例如: !ls -la'));
      return;
    }

    // 安全检查
    const trimmedCommand = command.trim().toLowerCase();
    if (this.DANGEROUS_COMMANDS.some(dangerous => trimmedCommand.includes(dangerous))) {
      console.log(chalk.red('❌ 检测到危险命令，为安全起见已阻止执行'));
      console.log(chalk.gray('💡 如需执行此类命令，请直接在终端中运行'));
      return;
    }

    // 检查命令复杂度
    if (command.length > 500) {
      console.log(chalk.red('❌ 命令过长，请简化或分步执行'));
      return;
    }

    console.log(chalk.gray(`\n💻 执行: ${command}`));

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // 检查是否需要后台运行
      const isBackgroundRun = command.includes(' &') || this.isLongRunningCommand(command);

      if (isBackgroundRun) {
        // 后台运行命令
        const cleanCommand = command.replace(/ &$/, '');
        console.log(chalk.yellow('🔄 后台运行中...'));

        const child = exec(cleanCommand, {
          cwd: process.cwd(),
          detached: true,
          timeout: 60000 // 后台命令1分钟超时
        });

        child.unref();

        console.log(chalk.green(`✅ 后台任务已启动: PID ${child.pid}`));
        console.log(chalk.gray('💡 任务将在后台继续运行'));
      } else {
        // 前台运行命令
        const { stdout, stderr } = await execAsync(command, {
          cwd: process.cwd(),
          timeout: 30000, // 30秒超时
          maxBuffer: 1024 * 1024 * 2 // 2MB输出限制
        });

        if (stdout) {
          console.log(chalk.white(stdout));
        }

        if (stderr) {
          console.log(chalk.red(stderr));
        }

        console.log(chalk.green(`\n✅ 命令执行完成`));
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ 命令执行失败: ${error.message}`));

      if (error.signal === 'SIGTERM') {
        console.log(chalk.yellow('⏱️ 命令超时（30秒）'));
      } else if (error.code === 'ENOENT') {
        console.log(chalk.yellow('⚠️ 命令未找到，请检查命令是否正确'));
      } else if (error.code === 'EACCES') {
        console.log(chalk.yellow('⚠️ 权限不足，请检查权限或使用sudo'));
      }
    }

    console.log(''); // 空行分隔
  }

  // 判断是否为长时间运行的命令
  private isLongRunningCommand(command: string): boolean {
    const longRunningCommands = [
      'npm start', 'npm run dev', 'npm run serve',
      'yarn start', 'yarn dev',
      'python -m http.server', 'python -m flask run',
      'webpack --watch', 'vite',
      'docker-compose up', 'docker compose up',
      'ping', 'wget', 'curl',
      'git clone', 'git pull'
    ];

    return longRunningCommands.some(cmd => command.includes(cmd));
  }

  // 增强交互功能命令处理
  private handleShowHistory(): void {
    console.log(chalk.cyan('\n📚 命令历史'));
    console.log(chalk.gray('─'.repeat(50)));

    if (this.commandHistory.length === 0) {
      console.log(chalk.gray('  暂无命令历史'));
    } else {
      this.commandHistory.slice(-20).forEach((cmd, index) => {
        const num = this.commandHistory.length - 20 + index + 1;
        console.log(chalk.gray(`${num.toString().padStart(3)}. `) + chalk.white(cmd));
      });
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white('💡 使用方法:'));
    console.log(chalk.gray('  上/下箭头键: 导航历史'));
    console.log(chalk.gray('  Esc+Esc: 编辑上一条命令'));
    console.log(chalk.gray('  /clear-history: 清空历史'));
  }

  private handleClearHistory(): void {
    const count = this.commandHistory.length;
    this.commandHistory = [];
    this.historyIndex = -1;
    console.log(chalk.green(`✅ 已清空 ${count} 条历史记录`));
  }

  private handleToggleVimMode(): void {
    this.vimMode = !this.vimMode;

    if (this.vimMode) {
      this.vimModeType = 'normal'; // 默认进入Normal模式

      // 同步当前readline的输入到Vim buffer
      this.updateVimBufferFromReadline();

      console.log(chalk.green('✅ Vim模式已启用'));

      // 检查是否支持原始模式
      if (!process.stdin.isTTY) {
        console.log(chalk.yellow('⚠️ 检测到非交互式环境，Vim模式功能可能受限'));
        console.log(chalk.gray('💡 建议在真实终端中使用以获得完整Vim体验'));
      }

      console.log(chalk.gray('📋 基础Vim命令:'));
      console.log(chalk.gray('  h/j/k/l - 移动光标  w/b - 单词跳转  i/I/a/A - 插入模式'));
      console.log(chalk.gray('  x/X - 删除字符  dd - 删除行  yy - 复制行  p/P - 粘贴'));
      console.log(chalk.gray('  Esc - Normal模式  :q - 退出Vim模式  Ctrl+C - 强制退出'));
      console.log(chalk.blue('🎯 当前模式: [NORMAL]'));

      // 在Vim模式下，清除readline提示符并显示Vim行
      setTimeout(() => {
        process.stdout.write('\x1b[2K\r'); // 清除当前行
        this.redrawVimLine();
      }, 100);
    } else {
      console.log(chalk.yellow('⚠️ Vim模式已禁用'));
      this.vimModeType = 'insert';

      // 退出Vim模式，清除Vim显示并恢复readline提示符
      process.stdout.write('\x1b[2K\r'); // 清除当前行
      if (this.readline) {
        this.readline.prompt();
      }
    }
  }

  private handleToggleMultiLineMode(): void {
    this.isMultiLineMode = !this.isMultiLineMode;
    if (this.isMultiLineMode) {
      console.log(chalk.green('✅ 多行输入模式已启用'));
      console.log(chalk.gray('💡 输入空行结束多行输入，或使用Shift+Enter换行'));
    } else {
      console.log(chalk.yellow('⚠️ 多行输入模式已禁用'));
    }
  }

  private handleShowShortcuts(): void {
    console.log(chalk.cyan('\n⌨️ 键盘快捷键'));
    console.log(chalk.gray('─'.repeat(80)));

    console.log(chalk.blue('📋 基本快捷键:'));
    console.log(chalk.gray('  Ctrl+C        : 中断当前操作/取消'));
    console.log(chalk.gray('  Ctrl+D        : 退出程序'));
    console.log(chalk.gray('  Ctrl+L        : 清屏'));
    console.log(chalk.gray('  上/下箭头      : 命令历史导航'));
    console.log(chalk.gray('  Esc+Esc       : 编辑上一条消息'));

    console.log(chalk.blue('\n📝 多行输入:'));
    console.log(chalk.gray('  \\ + Enter     : 换行继续输入'));
    console.log(chalk.gray('  Shift+Enter   : 多行输入模式'));
    console.log(chalk.gray('  空行          : 结束多行输入'));

    console.log(chalk.blue('\n💻 Bash模式:'));
    console.log(chalk.gray('  !命令         : 执行shell命令'));
    console.log(chalk.gray('  !npm start    : 后台运行命令'));

    console.log(chalk.blue('\n🔧 命令模式:'));
    console.log(chalk.gray('  /vim          : 切换Vim模式'));
    console.log(chalk.gray('  /multiline    : 切换多行模式'));
    console.log(chalk.gray('  /history      : 查看命令历史'));
    console.log(chalk.gray('  /shortcuts    : 显示此帮助'));

    console.log(chalk.green('\n🎯 Vim模式 (输入/vim开启):'));

    console.log(chalk.green.bold('\n    模式切换:'));
    console.log(chalk.gray('      i           : 进入插入模式'));
    console.log(chalk.gray('      I           : 在行首插入'));
    console.log(chalk.gray('      a           : 在光标后插入'));
    console.log(chalk.gray('      A           : 在行尾插入'));
    console.log(chalk.gray('      o           : 在下方新建行'));
    console.log(chalk.gray('      O           : 在上方新建行'));
    console.log(chalk.gray('      Esc         : 返回普通模式'));
    console.log(chalk.gray('      v           : 进入可视模式'));

    console.log(chalk.blue.bold('\n    移动命令:'));
    console.log(chalk.gray('      h           : 左移一个字符'));
    console.log(chalk.gray('      j           : 下移一行'));
    console.log(chalk.gray('      k           : 上移一行'));
    console.log(chalk.gray('      l           : 右移一个字符'));
    console.log(chalk.gray('      w           : 跳到下一个单词'));
    console.log(chalk.gray('      b           : 跳到上一个单词'));
    console.log(chalk.gray('      e           : 跳到单词末尾'));
    console.log(chalk.gray('      0           : 跳到行首'));
    console.log(chalk.gray('      $           : 跳到行尾'));
    console.log(chalk.gray('      ^           : 跳到行首非空字符'));

    console.log(chalk.red.bold('\n    编辑命令:'));
    console.log(chalk.gray('      x           : 删除当前字符'));
    console.log(chalk.gray('      X           : 删除前一个字符'));
    console.log(chalk.gray('      dd          : 删除整行'));
    console.log(chalk.gray('      cc          : 修改整行'));
    console.log(chalk.gray('      s           : 删除当前字符并插入'));
    console.log(chalk.gray('      S           : 删除整行并插入'));
    console.log(chalk.gray('      yy          : 复制整行'));
    console.log(chalk.gray('      p           : 在光标后粘贴'));
    console.log(chalk.gray('      P           : 在光标前粘贴'));

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.yellow('💡 提示: 在Vim模式下，左下角会显示当前模式状态'));
  }

  // ==================== Vim模式实现 ====================

  private handleVimKeypress(str: string, key: any): boolean {
    // 处理Vim模式的特殊键位
    if (this.vimModeType === 'normal') {
      return this.handleVimNormalMode(str, key);
    } else if (this.vimModeType === 'insert') {
      return this.handleVimInsertMode(str, key);
    } else if (this.vimModeType === 'visual') {
      return this.handleVimVisualMode(str, key);
    } else if (this.vimModeType === 'command') {
      return this.handleVimCommandMode(str, key);
    }
    return false;
  }

  private handleVimNormalMode(str: string, key: any): boolean {
    // 特殊处理：Ctrl+C 用于退出Vim模式
    if (key.ctrl && key.name === 'c') {
      this.vimMode = false;
      this.vimModeType = 'insert';
      console.log(chalk.yellow('⚠️ Vim模式已禁用 (Ctrl+C)'));
      process.stdout.write('\x1b[2K\r'); // 清除当前行
      if (this.readline) {
        this.readline.prompt();
      }
      return true;
    }

    // 特殊处理：Enter键在Vim模式下不应该退出，而是被忽略
    if (key.name === 'enter' || key.name === 'return') {
      return true; // 在Vim模式下忽略Enter键
    }

    switch (str) {
      // 移动命令
      case 'h':
        this.vimMoveCursor(-1);
        return true;
      case 'j':
        this.vimMoveCursorVertical(1);
        return true;
      case 'k':
        this.vimMoveCursorVertical(-1);
        return true;
      case 'l':
        this.vimMoveCursor(1);
        return true;
      case 'w':
        this.vimMoveToNextWord();
        return true;
      case 'b':
        this.vimMoveToPrevWord();
        return true;
      case 'e':
        this.vimMoveToEndOfWord();
        return true;
      case '0':
        this.vimMoveToStartOfLine();
        return true;
      case '$':
        this.vimMoveToEndOfLine();
        return true;
      case '^':
        this.vimMoveToFirstNonBlank();
        return true;

      // 编辑命令
      case 'i':
        this.vimEnterInsertMode();
        return true;
      case 'I':
        this.vimMoveToFirstNonBlank();
        this.vimEnterInsertMode();
        return true;
      case 'a':
        this.vimMoveCursor(1);
        this.vimEnterInsertMode();
        return true;
      case 'A':
        this.vimMoveToEndOfLine();
        this.vimEnterInsertMode();
        return true;
      case 'o':
        this.vimOpenNewLineBelow();
        return true;
      case 'O':
        this.vimOpenNewLineAbove();
        return true;
      case 's':
        this.vimSubstituteChar();
        return true;
      case 'S':
        this.vimSubstituteLine();
        return true;

      // 删除命令
      case 'x':
        this.vimDeleteChar();
        return true;
      case 'X':
        this.vimDeleteCharBefore();
        return true;
      case 'd':
        this.vimDeleteCommand();
        return true;
      case 'c':
        this.vimChangeCommand();
        return true;
      case 'D':
        this.vimDeleteToEndOfLine();
        return true;
      case 'C':
        this.vimChangeToEndOfLine();
        return true;
      case 'dd':
        this.vimDeleteLine();
        return true;
      case 'cc':
        this.vimChangeLine();
        return true;

      // 复制粘贴
      case 'y':
        this.vimYankCommand();
        return true;
      case 'p':
        this.vimPasteAfter();
        return true;
      case 'P':
        this.vimPasteBefore();
        return true;
      case 'yy':
        this.vimYankLine();
        return true;

      // 撤销重做 (简化版本)
      case 'u':
        this.vimUndo();
        return true;
      case 'r':
        this.vimRedo();
        return true;

      // 退出和保存
      case ':':
        this.vimEnterCommandMode();
        return true;
      case '/':
        this.vimEnterSearchMode();
        return true;
      case 'n':
        this.vimSearchNext();
        return true;
      case 'N':
        this.vimSearchPrev();
        return true;

      // 其他
      case '.':
        this.vimRepeatLastCommand();
        return true;
      case 'G':
        this.vimGoToLineEnd();
        return true;
      case 'g':
        this.vimGoToLineStart();
        return true;
    }

    // 处理特殊键
    if (key.name === 'escape') {
      return true; // 在Normal模式下Esc不做任何事
    }

    return false;
  }

  private handleVimInsertMode(str: string, key: any): boolean {
    // Insert模式下，处理字符输入和特殊按键

    // 特殊处理：Enter键应该提交命令
    if (key.name === 'enter' || key.name === 'return') {
      // 退出Vim模式，让readline正常处理Enter
      this.vimMode = false;
      this.vimModeType = 'insert';
      return false; // 让Enter键正常处理
    }

    // Esc键退出到Normal模式
    if (key.name === 'escape') {
      this.vimEnterNormalMode();
      return true;
    }

    // Backspace键删除字符
    if (key.name === 'backspace' || key.name === 'delete') {
      if (this.vimCursorPos > 0) {
        this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos - 1) + this.vimBuffer.slice(this.vimCursorPos);
        this.vimCursorPos--;
        this.redrawVimLine();
      }
      return true;
    }

    // 方向键移动光标
    if (key.name === 'left') {
      this.vimCursorPos = Math.max(0, this.vimCursorPos - 1);
      this.redrawVimLine();
      return true;
    }
    if (key.name === 'right') {
      this.vimCursorPos = Math.min(this.vimBuffer.length, this.vimCursorPos + 1);
      this.redrawVimLine();
      return true;
    }

    // 普通字符插入
    if (str && str.length === 1 && !key.ctrl && !key.meta) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos) + str + this.vimBuffer.slice(this.vimCursorPos);
      this.vimCursorPos++;
      this.redrawVimLine();
      return true;
    }

    return false; // 其他按键让默认处理
  }

  private handleVimVisualMode(str: string, key: any): boolean {
    // Visual模式 (简化实现)

    // 特殊处理：Enter键应该提交命令，而不是被Vim拦截
    if (key.name === 'enter' || key.name === 'return') {
      // 退出Vim模式，让readline正常处理Enter
      this.vimMode = false;
      this.vimModeType = 'insert';
      return false; // 让Enter键正常处理
    }

    switch (str) {
      case 'h':
      case 'j':
      case 'k':
      case 'l':
      case 'w':
      case 'b':
        // 移动选择区域
        this.vimMoveSelection(str);
        return true;
      case 'y':
        this.vimYankSelection();
        return true;
      case 'd':
        this.vimDeleteSelection();
        return true;
      case 'c':
        this.vimChangeSelection();
        return true;
      case 'escape':
        this.vimEnterNormalMode();
        return true;
    }
    return false;
  }

  private handleVimCommandMode(str: string, key: any): boolean {
    // 命令模式处理

    // Enter键执行命令
    if (key.name === 'enter' || key.name === 'return') {
      this.executeVimCommand();
      return true;
    }

    // Esc键退出命令模式
    if (key.name === 'escape') {
      this.vimEnterNormalMode();
      return true;
    }

    // Backspace键删除字符
    if (key.name === 'backspace' || key.name === 'delete') {
      if (this.vimCommandBuffer.length > 0) {
        this.vimCommandBuffer = this.vimCommandBuffer.slice(0, -1);
        this.redrawVimCommandLine();
      }
      return true;
    }

    // 普通字符添加到命令缓冲区
    if (str && str.length === 1 && !key.ctrl && !key.meta) {
      this.vimCommandBuffer += str;
      this.redrawVimCommandLine();
      return true;
    }

    return false;
  }

  // ==================== Vim模式辅助方法 ====================

  private vimEnterNormalMode(): void {
    this.vimModeType = 'normal';
    this.updateVimStatus();
  }

  private vimEnterInsertMode(): void {
    this.vimModeType = 'insert';
    this.updateVimStatus();
  }

  private vimEnterVisualMode(): void {
    this.vimModeType = 'visual';
    this.updateVimStatus();
  }

  private vimEnterCommandMode(): void {
    this.vimModeType = 'command';
    this.vimCommandBuffer = '';
    this.updateVimStatus();
    // 显示命令提示符
    this.redrawVimCommandLine();
  }

  private executeVimCommand(): void {
    const command = this.vimCommandBuffer.trim();

    switch (command) {
      case 'q':
        // 退出Vim模式
        this.vimMode = false;
        this.vimModeType = 'insert';
        console.log(chalk.yellow('⚠️ Vim模式已退出'));
        if (this.readline) {
          this.readline.prompt();
        }
        break;

      case 'w':
        // "保存"（这里只是模拟）
        console.log(chalk.green('✅ 已保存'));
        this.vimEnterNormalMode();
        break;

      case 'wq':
        // 保存并退出
        console.log(chalk.green('✅ 已保存'));
        this.vimMode = false;
        this.vimModeType = 'insert';
        console.log(chalk.yellow('⚠️ Vim模式已退出'));
        if (this.readline) {
          this.readline.prompt();
        }
        break;

      case 'q!':
        // 强制退出
        this.vimMode = false;
        this.vimModeType = 'insert';
        console.log(chalk.yellow('⚠️ Vim模式已强制退出'));
        if (this.readline) {
          this.readline.prompt();
        }
        break;

      default:
        if (command) {
          console.log(chalk.red(`❌ 未知命令: ${command}`));
        }
        this.vimEnterNormalMode();
        break;
    }

    this.vimCommandBuffer = '';
  }

  private redrawVimCommandLine(): void {
    // 清除当前行并显示命令行
    process.stdout.write('\x1b[2K\r'); // 清除行
    process.stdout.write(chalk.blue(':') + chalk.white(this.vimCommandBuffer));
  }

  private vimEnterSearchMode(): void {
    console.log('\n/');
    // 简化实现
  }

  private updateVimStatus(): void {
    // 根据不同模式更新状态显示
    if (this.vimModeType === 'command') {
      // 命令模式直接显示命令行
      this.redrawVimCommandLine();
    } else {
      // 其他模式更新提示符并显示当前行
      process.stdout.write('\n');
      this.redrawVimLine();
    }
  }

  private vimMoveCursor(offset: number): void {
    this.vimCursorPos = Math.max(0, Math.min(this.vimBuffer.length, this.vimCursorPos + offset));
    this.redrawVimLine();
  }

  private vimMoveCursorVertical(direction: number): void {
    // 简化实现：在单行中垂直移动没有意义
    // 实际Vim中会在多行间移动
    this.redrawVimLine();
  }

  private vimMoveToNextWord(): void {
    const regex = /\b\w+\b/g;
    let match;
    while ((match = regex.exec(this.vimBuffer)) !== null) {
      if (match.index > this.vimCursorPos) {
        this.vimCursorPos = match.index;
        break;
      }
    }
    this.redrawVimLine();
  }

  private vimMoveToPrevWord(): void {
    const regex = /\b\w+\b/g;
    let matches = [];
    let match;
    while ((match = regex.exec(this.vimBuffer)) !== null) {
      matches.push(match);
    }
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].index < this.vimCursorPos) {
        this.vimCursorPos = matches[i].index;
        break;
      }
    }
    this.redrawVimLine();
  }

  private vimMoveToEndOfWord(): void {
    const regex = /\b\w+\b/g;
    let match;
    while ((match = regex.exec(this.vimBuffer)) !== null) {
      if (match.index >= this.vimCursorPos) {
        this.vimCursorPos = match.index + match[0].length - 1;
        break;
      }
    }
    this.redrawVimLine();
  }

  private vimMoveToStartOfLine(): void {
    this.vimCursorPos = 0;
    this.redrawVimLine();
  }

  private vimMoveToEndOfLine(): void {
    this.vimCursorPos = this.vimBuffer.length;
    this.redrawVimLine();
  }

  private vimMoveToFirstNonBlank(): void {
    const match = this.vimBuffer.match(/\S/);
    this.vimCursorPos = match ? (match.index ?? 0) : 0;
    this.redrawVimLine();
  }

  private vimDeleteChar(): void {
    if (this.vimCursorPos < this.vimBuffer.length) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos) + this.vimBuffer.slice(this.vimCursorPos + 1);
      this.redrawVimLine();
    }
  }

  private vimDeleteCharBefore(): void {
    if (this.vimCursorPos > 0) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos - 1) + this.vimBuffer.slice(this.vimCursorPos);
      this.vimCursorPos--;
      this.redrawVimLine();
    }
  }

  private vimDeleteLine(): void {
    this.vimLastYank = this.vimBuffer;
    this.vimBuffer = '';
    this.vimCursorPos = 0;
    this.redrawVimLine();
  }

  private vimYankLine(): void {
    this.vimLastYank = this.vimBuffer;
    console.log(chalk.green(`\n已复制行: ${this.vimBuffer}`));
  }

  private vimPasteAfter(): void {
    if (this.vimLastYank) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos + 1) + this.vimLastYank + this.vimBuffer.slice(this.vimCursorPos + 1);
      this.vimCursorPos += this.vimLastYank.length;
      this.redrawVimLine();
    }
  }

  private vimPasteBefore(): void {
    if (this.vimLastYank) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos) + this.vimLastYank + this.vimBuffer.slice(this.vimCursorPos);
      this.vimCursorPos += this.vimLastYank.length;
      this.redrawVimLine();
    }
  }

  private vimOpenNewLineBelow(): void {
    this.vimBuffer += '\n';
    this.vimCursorPos = this.vimBuffer.length;
    this.vimEnterInsertMode();
    this.redrawVimLine();
  }

  private vimOpenNewLineAbove(): void {
    this.vimBuffer = '\n' + this.vimBuffer;
    this.vimCursorPos = 0;
    this.vimEnterInsertMode();
    this.redrawVimLine();
  }

  private vimSubstituteChar(): void {
    if (this.vimCursorPos < this.vimBuffer.length) {
      this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos) + ' ' + this.vimBuffer.slice(this.vimCursorPos + 1);
      this.vimEnterInsertMode();
      this.redrawVimLine();
    }
  }

  private vimSubstituteLine(): void {
    this.vimBuffer = '';
    this.vimCursorPos = 0;
    this.vimEnterInsertMode();
    this.redrawVimLine();
  }

  private vimDeleteToEndOfLine(): void {
    this.vimLastYank = this.vimBuffer.slice(this.vimCursorPos);
    this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos);
    this.redrawVimLine();
  }

  private vimChangeToEndOfLine(): void {
    this.vimLastYank = this.vimBuffer.slice(this.vimCursorPos);
    this.vimBuffer = this.vimBuffer.slice(0, this.vimCursorPos);
    this.vimEnterInsertMode();
    this.redrawVimLine();
  }

  private vimDeleteCommand(): void {
    // 简化实现：等待下一个字符
    console.log(chalk.yellow('等待删除命令 (如: dw, dd, d$)'));
  }

  private vimChangeCommand(): void {
    // 简化实现：等待下一个字符
    console.log(chalk.yellow('等待修改命令 (如: cw, cc, c$)'));
  }

  private vimYankCommand(): void {
    // 简化实现：等待下一个字符
    console.log(chalk.yellow('等待复制命令 (如: yw, yy)'));
  }

  private vimChangeLine(): void {
    this.vimLastYank = this.vimBuffer;
    this.vimBuffer = '';
    this.vimCursorPos = 0;
    this.vimEnterInsertMode();
    this.redrawVimLine();
  }

  private vimMoveSelection(direction: string): void {
    // Visual模式选择移动 (简化实现)
    console.log(chalk.yellow(`Visual模式移动: ${direction}`));
  }

  private vimYankSelection(): void {
    console.log(chalk.green('已复制选择内容'));
    this.vimEnterNormalMode();
  }

  private vimDeleteSelection(): void {
    console.log(chalk.red('已删除选择内容'));
    this.vimEnterNormalMode();
  }

  private vimChangeSelection(): void {
    console.log(chalk.yellow('已修改选择内容'));
    this.vimEnterInsertMode();
  }

  private vimUndo(): void {
    // 简化实现：撤销功能需要更复杂的状态管理
    console.log(chalk.yellow('撤销功能 (简化实现)'));
  }

  private vimRedo(): void {
    // 简化实现
    console.log(chalk.yellow('重做功能 (简化实现)'));
  }

  private vimSearchNext(): void {
    console.log(chalk.yellow('搜索下一个'));
  }

  private vimSearchPrev(): void {
    console.log(chalk.yellow('搜索上一个'));
  }

  private vimRepeatLastCommand(): void {
    console.log(chalk.yellow('重复最后命令'));
  }

  private vimGoToLineEnd(): void {
    this.vimCursorPos = this.vimBuffer.length;
    this.redrawVimLine();
  }

  private vimGoToLineStart(): void {
    this.vimCursorPos = 0;
    this.redrawVimLine();
  }

  private redrawVimLine(): void {
    // 清除当前行并重新绘制
    process.stdout.write('\x1b[2K\r'); // 清除行
    const beforeCursor = this.vimBuffer.slice(0, this.vimCursorPos);
    const atCursor = this.vimBuffer[this.vimCursorPos] || ' ';
    const afterCursor = this.vimBuffer.slice(this.vimCursorPos + 1);

    // 在Vim模式下显示光标位置
    let cursor;
    if (this.vimModeType === 'normal') {
      cursor = chalk.bgBlue(atCursor);
    } else if (this.vimModeType === 'insert') {
      cursor = chalk.bgGreen(atCursor);
    } else if (this.vimModeType === 'visual') {
      cursor = chalk.bgYellow(atCursor);
    } else {
      cursor = atCursor;
    }

    // 只在非命令模式下显示完整提示符
    if (this.vimModeType === 'command') {
      // 命令模式不显示普通提示符
      process.stdout.write(chalk.blue(':') + chalk.white(this.vimCommandBuffer));
    } else {
      process.stdout.write(this.buildPrompt() + beforeCursor + cursor + afterCursor);
    }
  }

  private updateVimBufferFromReadline(): void {
    // 同步readline的输入到Vim buffer
    if (this.readline && this.readline.line !== undefined) {
      this.vimBuffer = this.readline.line || '';
      this.vimCursorPos = this.readline.cursor || 0;
    } else {
      // 如果没有readline输入，初始化为空
      this.vimBuffer = '';
      this.vimCursorPos = 0;
    }
  }
}