import * as readline from 'readline';
import * as path from 'path';
import chalk from 'chalk';
import * as figlet from 'figlet';
import { TerminalFileUploader, FileAttachment } from '../core/terminal-file-uploader';
import { EnhancedClipboardHandler } from '../core/enhanced-clipboard-handler';
import { DeepSeekIntegration, DeepSeekConfig } from '../services/deepseek-integration';

export interface EnhancedCLIOptions {
  provider: 'deepseek' | 'openai' | 'claude';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxFiles?: number;
  maxFileSize?: number;
  enableStreaming?: boolean;
  autoClearAttachments?: boolean;
}

export class EnhancedCLIInterface {
  private uploader: TerminalFileUploader;
  private clipboardHandler: EnhancedClipboardHandler;
  private aiService: DeepSeekIntegration;
  private readline!: readline.Interface;
  private currentAttachments: FileAttachment[] = [];
  private isStreaming = false;

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

    // 强制显示完整界面，不管终端尺寸
    // 因为在实际测试中发现终端尺寸检测可能不准确
    this.displayHeader();
    this.displaySidebar();
    this.displayMainContent();
    this.displayStatusBar();
    this.displayInputArea();
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
    const modelInfo = this.aiService.getModelInfo();

    // Adaptive status bar based on terminal width
    let statusBar: string;

    if (width < 60) {
      // Very small terminal - minimal info
      const files = `📁${this.currentAttachments.length}`;
      const status = this.isStreaming ? '🔄' : '✅';
      statusBar = `${files} ${status}`;
    } else if (width < 80) {
      // Small terminal - essential info only
      const files = `📁 ${this.currentAttachments.length} files`;
      const model = modelInfo.model.length > 10 ? modelInfo.model.substring(0, 8) + '..' : modelInfo.model;
      const streaming = this.isStreaming ? '🔄 Streaming' : '✅ Ready';
      statusBar = `${files} | ${model} | ${streaming}`;
    } else {
      // Full terminal - all components
      const files = `📁 ${this.currentAttachments.length} files`;
      const model = `🤖 ${modelInfo.model}`;
      const provider = `🏷️ ${modelInfo.provider}`;
      const streaming = this.isStreaming ? '🔄 Streaming' : '✅ Ready';

      // Calculate spacing
      const components = [files, model, provider, streaming];
      const totalText = components.join(' ');
      const spacing = Math.max(1, Math.floor((width - totalText.length) / (components.length - 1)));

      // Build status bar
      statusBar = components[0];
      for (let i = 1; i < components.length; i++) {
        statusBar += ' '.repeat(spacing) + components[i];
      }
    }

    console.log('');
    console.log(chalk.gray('─'.repeat(width)));
    console.log(chalk.cyan(statusBar));
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
      terminal: true
    });

    // 设置终端为非原始模式，确保不捕获鼠标事件
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    this.readline.on('line', async (input: string) => {
      const trimmedInput = input.trim();
      if (trimmedInput) {
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
    return `${attachmentIndicator}${chalk.green('> ')}`;
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return;

    // 优先处理命令
    if (input.startsWith('/')) {
      // 检查是否是已知命令
      const [cmd] = input.slice(1).toLowerCase().split(' ');
      const knownCommands = ['paste', 'p', 'attachments', 'att', 'clear', 'c', 'remove', 'rm',
                           'upload', 'up', 'status', 'st', 'help', 'h', 'quit', 'q', 'exit'];

      if (knownCommands.includes(cmd)) {
        await this.handleCommand(input);
        return;
      }
    }

    // 然后尝试让上传器处理可能的文件路径
    if (await this.uploader.processInput(input)) {
      // 如果成功识别为文件路径，就不发送给AI
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

    switch (cmd) {
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
    // Clear and redisplay interface with help content
    console.clear();
    this.displayHeader();
    this.displaySidebar();
    this.displayHelpContent();
    this.displayStatusBar();
    this.displayInputArea();
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

    console.log(chalk.blue('🤖 AI回复:'));
    console.log(chalk.gray('─'.repeat(60)));

    let fullResponse = '';

    await this.aiService.sendMessageWithAttachmentsStream(
      message,
      this.currentAttachments,
      (chunk: string) => {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
    );

    console.log(chalk.gray('─'.repeat(60)));
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
}