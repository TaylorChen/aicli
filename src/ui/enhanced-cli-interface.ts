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
      historySize: 1000
    });

    // 设置键盘快捷键
    this.setupKeyboardShortcuts();

    // 设置终端为非原始模式，确保不捕获鼠标事件
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    this.readline.on('line', async (input: string) => {
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
    // Ctrl+D 退出
    process.stdin.on('data', (key) => {
      if (key.toString() === '\u0004') { // Ctrl+D
        console.log(chalk.yellow('\n👋 再见！'));
        process.exit(0);
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

    // 更简洁的对话式提示符
    return `${attachmentIndicator}${chalk.blue('❯ ')}`;
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return;

    // 优先处理命令
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      return;
    }

    // 然后尝试让上传器处理可能的文件路径
    if (await this.uploader.processInput(input)) {
      // 如果成功识别为文件路径，就不发送给AI
      return;
    }

    // 处理AI对话 - ChatGPT风格
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
    console.log(chalk.gray('  上/下箭头              - 命令历史导航'));
    console.log(chalk.gray('  Tab                   - 命令自动补全 (未来版本)'));
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
}