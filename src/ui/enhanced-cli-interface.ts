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
    this.displayWelcome();

    // 验证API配置
    await this.validateConfiguration();

    // 设置事件监听
    this.setupEventListeners();

    // 初始化文件上传器
    await this.uploader.initialize();

    // 设置命令行界面
    this.setupReadline();
  }

  private displayWelcome(): void {
    console.clear();

    // 显示标题
    console.log(chalk.cyan(
      figlet.textSync('AICLI', { font: 'Small', horizontalLayout: 'default' })
    ));

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan('🚀 增强版 AI 命令行工具 - 支持文件拖拽和图片粘贴'));
    console.log(chalk.gray('─'.repeat(60)));

    // 显示配置信息
    const modelInfo = this.aiService.getModelInfo();
    console.log(chalk.white(`🤖 当前模型: ${modelInfo.model} (${modelInfo.provider})`));
    console.log(chalk.gray(`   功能: ${modelInfo.capabilities.join(', ')}`));

    console.log('');
    console.log(chalk.blue('💡 支持的功能:'));
    console.log(chalk.gray('   📁 拖拽文件到终端窗口'));
    console.log(chalk.gray('   📋 粘贴图片或文件路径'));
    console.log(chalk.gray('   📝 手动输入文件路径'));
    console.log(chalk.gray('   🎤 与AI进行对话交流'));

    console.log('');
  }

  private async validateConfiguration(): Promise<void> {
    if (!this.options.apiKey) {
      console.log(chalk.yellow('⚠️ 未配置API密钥'));
      console.log(chalk.gray('请设置环境变量:'));
      console.log(chalk.gray('  export DEEPSEEK_API_KEY="your_api_key"'));
      console.log(chalk.gray('  export OPENAI_API_KEY="your_api_key"'));
      console.log('');
      console.log(chalk.cyan('继续使用仅限本地功能（文件管理）...'));
      console.log('');
      return;
    }

    console.log(chalk.blue('🔑 验证API配置...'));
    const isValid = await this.aiService.validateApiKey();

    if (isValid) {
      console.log(chalk.green('✅ API配置验证成功'));
    } else {
      console.log(chalk.red('❌ API配置验证失败'));
      console.log(chalk.gray('请检查API密钥是否正确'));
    }

    console.log('');
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

    // 移除所有按键监听，只依赖默认的行输入模式
    console.log(chalk.gray('💡 提示：使用 Ctrl+C 退出程序'));
    console.log(chalk.gray('💡 鼠标事件已禁用，避免控制字符干扰'));

    this.readline.prompt();
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

      // 重置终端状态
      process.stdout.write('\x1b[?25h');    // 显示光标
      process.stdout.write('\x1bc');        // 重置终端
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
    console.log(chalk.cyan('📎 当前附件列表:'));
    console.log(chalk.gray('─'.repeat(50)));

    if (this.currentAttachments.length === 0) {
      console.log(chalk.gray('   暂无附件'));
    } else {
      this.currentAttachments.forEach((attachment, index) => {
        const icon = this.getFileIcon(attachment.type);
        const size = this.formatFileSize(attachment.size);
        console.log(chalk.gray(`   ${index + 1}. ${icon} ${attachment.filename} (${size})`));
      });
    }

    console.log(chalk.gray('─'.repeat(50)));
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
    const modelInfo = this.aiService.getModelInfo();
    console.log(chalk.cyan('📊 系统状态:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white(`模型: ${modelInfo.model}`));
    console.log(chalk.white(`提供商: ${modelInfo.provider}`));
    console.log(chalk.white(`附件数量: ${this.currentAttachments.length}`));
    console.log(chalk.white(`流式响应: ${this.options.enableStreaming ? '启用' : '禁用'}`));
    console.log(chalk.gray('─'.repeat(40)));
  }

  private handleHelp(): void {
    console.log(chalk.cyan('📝 可用命令:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white('  /paste, /p         - 粘贴剪贴板内容'));
    console.log(chalk.white('  /attachments, /att - 查看附件列表'));
    console.log(chalk.white('  /clear, /c        - 清空附件列表'));
    console.log(chalk.white('  /remove <n>, /rm <n> - 删除第 n 个附件'));
    console.log(chalk.white('  /upload [path]    - 上传文件或查看状态'));
    console.log(chalk.white('  /status, /st      - 查看系统状态'));
    console.log(chalk.white('  /help, /h         - 显示帮助'));
    console.log(chalk.white('  /quit, /q         - 退出程序'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.gray('💡 直接输入消息与AI对话'));
    console.log(chalk.gray('💡 直接输入文件路径自动添加附件（如: /path/to/file.png）'));
    console.log(chalk.gray('💡 拖拽文件到终端自动添加附件'));
    console.log(chalk.gray('💡 支持图片、文档、代码等文件类型'));
    console.log(chalk.gray('💡 AI对话完成后会自动清除附件'));
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
    const count = this.currentAttachments.length;
    if (count > 0) {
      console.log(chalk.cyan(`\n📎 当前附件: ${count} 个文件`));
    }
    // 延迟更新prompt以避免输入重复问题
    setTimeout(() => {
      if (this.readline) {
        this.readline.setPrompt(this.buildPrompt());
      }
    }, 10);
  }

  private showAttachmentAddedPrompt(): void {
    if (this.currentAttachments.length > 0) {
      console.log(chalk.green('\n💡 附件已添加！现在可以输入消息发送给AI进行分析...'));
      console.log(chalk.gray('   例如：请分析这些文件的内容'));
    }
  }

  private clearAttachmentsAfterConversation(): void {
    if (this.options.autoClearAttachments && this.currentAttachments.length > 0) {
      const count = this.currentAttachments.length;
      this.currentAttachments = [];
      this.uploader.clearAttachments();

      console.log(chalk.cyan(`\n🧹 已自动清除 ${count} 个附件，准备新的对话...`));
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