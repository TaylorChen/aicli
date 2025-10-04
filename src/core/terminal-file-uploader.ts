import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

export interface FileAttachment {
  id: string;
  filename: string;
  originalPath: string;
  size: number;
  mimeType: string;
  type: 'image' | 'document' | 'text' | 'binary' | 'unknown';
  content?: Buffer;
  uploaded?: boolean;
  uploadUrl?: string;
  error?: string;
}

export interface UploadProgress {
  current: number;
  total: number;
  filename: string;
  progress: number;
}

export interface TerminalUploaderOptions {
  maxFileSize?: number;
  maxFiles?: number;
  allowedTypes?: string[];
  autoUpload?: boolean;
  uploadEndpoint?: string;
  enableDragDrop?: boolean;
  enableClipboard?: boolean;
}

export class TerminalFileUploader extends EventEmitter {
  private options: Required<TerminalUploaderOptions>;
  private attachments: FileAttachment[] = [];
  private isProcessing = false;
  private dragDetector: FileDragDetector;

  constructor(options: TerminalUploaderOptions = {}) {
    super();

    this.options = {
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
      maxFiles: options.maxFiles || 20,
      allowedTypes: options.allowedTypes || [
        'image/*',
        'application/pdf',
        'text/*',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.*'
      ],
      autoUpload: options.autoUpload || false,
      uploadEndpoint: options.uploadEndpoint || '',
      enableDragDrop: options.enableDragDrop !== false,
      enableClipboard: options.enableClipboard !== false
    };

    this.dragDetector = new FileDragDetector();
    this.setupDragDetection();
  }

  public async initialize(): Promise<void> {
    console.log(chalk.cyan('🚀 AICLI 文件上传系统已启动'));
    console.log(chalk.gray('💡 支持拖拽文件、粘贴路径、手动输入'));

    if (this.options.enableDragDrop) {
      console.log(chalk.gray('   • 拖拽文件到终端窗口'));
    }

    if (this.options.enableClipboard) {
      console.log(chalk.gray('   • 粘贴文件路径或截图'));
    }

    console.log(chalk.gray('   • 手动输入文件路径'));
    console.log('');

    // 不再设置独立的readline，由外部CLI接口控制
    this.showAttachmentList();
  }

  public async initializeSilent(): Promise<void> {
    // 静默初始化，不输出任何信息以避免干扰界面
    // 拖拽检测已经在构造函数中设置，这里不需要做任何操作

    // 不调用 showAttachmentList() 避免额外输出
  }

  // 供外部接口调用来处理可能的文件路径输入
  public async processInput(input: string): Promise<boolean> {
    const trimmedInput = input.trim();
    if (!trimmedInput) return false;

    // 使用更智能的文件路径识别
    if (this.looksLikeFilePath(trimmedInput)) {
      const filePaths = this.parseFilePaths(trimmedInput);
      let addedFiles = 0;

      for (const filePath of filePaths) {
        if (await this.addFile(filePath)) {
          addedFiles++;
        }
      }

      if (addedFiles > 0) {
        this.showAttachmentList();
        return true;
      }
    }

    return false;
  }

  // 判断输入是否看起来像文件路径
  private looksLikeFilePath(input: string): boolean {
    // 如果包含文件扩展名，很可能是文件路径
    const hasExtension = /\.(txt|md|js|ts|json|pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|py|java|cpp|c|go|rs|html|css|vue|jsx|tsx|xml|yaml|yml|env|ini|conf|cfg)$/i.test(input);

    // 如果包含路径分隔符，很可能是文件路径
    const hasPathSeparators = input.includes('/') || input.includes('\\');

    // 如果是常见的文件路径模式
    const startsWithCommonPath = /^(\.|~|\/|[a-zA-Z]:)/.test(input);

    // 如果是已知的文件名模式
    const knownFilePatterns = /\.(png|jpg|jpeg|gif|pdf|txt|md|json|js|ts)$/i.test(input);

    return hasExtension || (hasPathSeparators && input.length > 3) || startsWithCommonPath || knownFilePatterns;
  }

  private async handleFilePath(input: string): Promise<void> {
    // 解析多个文件路径
    const filePaths = this.parseFilePaths(input);

    for (const filePath of filePaths) {
      if (await this.addFile(filePath)) {
        console.log(chalk.green(`✓ 已添加: ${path.basename(filePath)}`));
      }
    }

    if (filePaths.length > 0) {
      this.showAttachmentList();
    }
  }

  private parseFilePaths(input: string): string[] {
    // 处理引号包围的路径
    const paths: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          paths.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      paths.push(current.trim());
    }

    return paths;
  }

  public async addFile(filePath: string): Promise<boolean> {
    try {
      const resolvedPath = this.resolvePath(filePath);

      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.red(`✗ 文件不存在: ${filePath}`));
        return false;
      }

      const stats = fs.statSync(resolvedPath);

      if (!stats.isFile()) {
        console.log(chalk.red(`✗ 不是文件: ${filePath}`));
        return false;
      }

      if (stats.size > this.options.maxFileSize) {
        console.log(chalk.red(`✗ 文件太大: ${path.basename(filePath)} (${this.formatFileSize(stats.size)})`));
        return false;
      }

      if (this.attachments.length >= this.options.maxFiles) {
        console.log(chalk.red(`✗ 附件数量已达上限 (${this.options.maxFiles})`));
        return false;
      }

      // 检查是否已存在
      if (this.attachments.some(att => att.originalPath === resolvedPath)) {
        console.log(chalk.yellow(`⚠ 文件已存在: ${path.basename(filePath)}`));
        return false;
      }

      const content = fs.readFileSync(resolvedPath);
      const mimeType = this.detectMimeType(resolvedPath);
      const fileType = this.detectFileType(mimeType);

      const attachment: FileAttachment = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        filename: path.basename(resolvedPath),
        originalPath: resolvedPath,
        size: stats.size,
        mimeType,
        type: fileType,
        content
      };

      this.attachments.push(attachment);
      this.emit('fileAdded', attachment);

      return true;

    } catch (error) {
      console.log(chalk.red(`✗ 处理文件失败: ${filePath} - ${error instanceof Error ? error.message : '未知错误'}`));
      return false;
    }
  }

  private resolvePath(filePath: string): string {
    // 处理各种路径格式
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }

    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    return path.resolve(process.cwd(), filePath);
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  private detectFileType(mimeType: string): FileAttachment['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return 'text';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('sheet')) return 'document';
    return 'binary';
  }

  private async handleSend(): Promise<void> {
    if (this.attachments.length === 0) {
      console.log(chalk.yellow('⚠ 没有附件可发送'));
      return;
    }

    console.log(chalk.blue('⏳ 开始处理附件...'));

    const spinner = ora('准备上传').start();

    try {
      if (this.options.autoUpload && this.options.uploadEndpoint) {
        await this.uploadFiles();
      } else {
        // 准备附件供AI模型使用
        await this.prepareForAI();
      }

      spinner.succeed('附件处理完成');
      this.emit('filesProcessed', this.attachments);

    } catch (error) {
      spinner.fail('处理失败');
      console.log(chalk.red(`✗ ${error instanceof Error ? error.message : '未知错误'}`));
    }
  }

  private async uploadFiles(): Promise<void> {
    const results = await Promise.allSettled(
      this.attachments.map(attachment => this.uploadSingleFile(attachment))
    );

    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(chalk.green(`\n📊 上传完成:`));
    console.log(chalk.green(`  ✓ 成功: ${success}`));

    if (failed > 0) {
      console.log(chalk.red(`  ✗ 失败: ${failed}`));
    }
  }

  private async uploadSingleFile(attachment: FileAttachment): Promise<void> {
    const FormData = require('form-data');
    const form = new FormData();

    form.append('file', attachment.content, {
      filename: attachment.filename,
      contentType: attachment.mimeType
    });

    const response = await fetch(this.options.uploadEndpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`);
    }

    attachment.uploaded = true;
    attachment.uploadUrl = await response.text();
  }

  private async prepareForAI(): Promise<void> {
    console.log(chalk.blue('\n📋 附件已准备就绪，可发送给AI模型:'));

    for (let i = 0; i < this.attachments.length; i++) {
      const attachment = this.attachments[i];
      const icon = this.getFileIcon(attachment.type);

      console.log(chalk.gray(`  [${i + 1}] ${icon} ${attachment.filename} (${this.formatFileSize(attachment.size)})`));

      // 准备附件内容供AI使用
      if (attachment.type === 'text' || attachment.type === 'document') {
        try {
          const textContent = attachment.content?.toString('utf8');
          if (textContent && textContent.length < 10000) { // 限制文本长度
            attachment.content = Buffer.from(textContent);
          }
        } catch (error) {
          // 忽略编码错误
        }
      }
    }

    console.log(chalk.green('\n✅ 附件已集成到对话上下文'));
    console.log(chalk.cyan('💡 现在可以输入消息，附件会自动包含在发送中'));
  }

  private getFileIcon(type: FileAttachment['type']): string {
    const icons = {
      image: '🖼️',
      document: '📄',
      text: '📝',
      binary: '💾',
      unknown: '📎'
    };
    return icons[type] || icons.unknown;
  }

  // 由外部CLI接口处理命令，这里保持简洁

  private showAttachmentList(): void {
    console.log(chalk.gray('─'.repeat(60)));

    if (this.attachments.length === 0) {
      console.log(chalk.gray('📭 暂无附件'));
    } else {
      console.log(chalk.cyan(`📎 附件列表 (${this.attachments.length}/${this.options.maxFiles}):`));

      this.attachments.forEach((attachment, index) => {
        const icon = this.getFileIcon(attachment.type);
        const status = attachment.uploaded ? chalk.green('✓') : chalk.gray('○');
        const size = this.formatFileSize(attachment.size);

        console.log(chalk.gray(`  ${index + 1}. ${icon} ${attachment.filename} (${size}) ${status}`));
      });
    }

    console.log(chalk.gray('─'.repeat(60)));
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private setupDragDetection(): void {
    if (!this.options.enableDragDrop) return;

    this.dragDetector.on('fileDropped', async (filePath: string) => {
      console.log(chalk.blue(`\n🎯 检测到拖拽文件: ${path.basename(filePath)}`));

      if (await this.addFile(filePath)) {
        console.log(chalk.green(`✓ 已添加: ${path.basename(filePath)}`));
        this.showAttachmentList();
      }

      // 不再需要重新显示提示符，由外部CLI接口控制
    });
  }

  public getAttachments(): FileAttachment[] {
    return [...this.attachments];
  }

  public clearAttachments(): void {
    this.attachments = [];
  }

  public async addAttachmentsFromPaths(filePaths: string[]): Promise<FileAttachment[]> {
    const added: FileAttachment[] = [];

    for (const filePath of filePaths) {
      if (await this.addFile(filePath)) {
        const addedAttachment = this.attachments[this.attachments.length - 1];
        added.push(addedAttachment);
      }
    }

    if (added.length > 0) {
      this.showAttachmentList();
    }

    return added;
  }
}

// 文件拖拽检测器
class FileDragDetector extends EventEmitter {
  private watcher: any = null;
  private watchDir: string;

  constructor() {
    super();
    this.watchDir = path.join(os.tmpdir(), 'aicli-drag-drop');
    this.ensureWatchDir();
    this.startWatching();
  }

  private ensureWatchDir(): void {
    if (!fs.existsSync(this.watchDir)) {
      fs.mkdirSync(this.watchDir, { recursive: true });
    }
  }

  private startWatching(): void {
    try {
      const chokidar = require('chokidar');

      this.watcher = chokidar.watch(this.watchDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true
      });

      this.watcher.on('add', (filePath: string) => {
        // 延迟处理，确保文件完全写入
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            this.emit('fileDropped', filePath);

            // 处理完后删除文件
            try {
              fs.unlinkSync(filePath);
            } catch (error) {
              // 忽略删除错误
            }
          }
        }, 500);
      });

    } catch (error) {
      // 如果 chokidar 不可用，使用 fs.watch
      this.setupFallbackWatcher();
    }
  }

  private setupFallbackWatcher(): void {
    fs.watch(this.watchDir, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const filePath = path.join(this.watchDir, filename);

        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            this.emit('fileDropped', filePath);

            try {
              fs.unlinkSync(filePath);
            } catch (error) {
              // 忽略删除错误
            }
          }
        }, 500);
      }
    });
  }

  public cleanup(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}