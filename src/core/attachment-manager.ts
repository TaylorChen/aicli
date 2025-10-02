import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileAttachment } from '../types';
import { FileProcessor } from './file-processor';
import { ClipboardProcessor, ClipboardContent } from './clipboard-processor';
import chalk from 'chalk';

export interface AttachmentSource {
  type: 'paste' | 'drag' | 'upload' | 'file';
  originalPath?: string;
  timestamp: Date;
}

export interface ManagedAttachment extends FileAttachment {
  id: string;
  source: AttachmentSource;
  tempPath?: string;
  isTempFile: boolean;
}

export interface AttachmentManagerOptions {
  maxAttachments?: number;
  maxTotalSize?: number; // in bytes
  tempDir?: string;
  autoCleanup?: boolean;
}

export class AttachmentManager {
  private attachments: Map<string, ManagedAttachment> = new Map();
  private options: Required<AttachmentManagerOptions>;
  private tempDir: string;

  constructor(options: AttachmentManagerOptions = {}) {
    this.options = {
      maxAttachments: options.maxAttachments || 10,
      maxTotalSize: options.maxTotalSize || 50 * 1024 * 1024, // 50MB
      tempDir: options.tempDir || path.join(os.tmpdir(), 'aicli-attachments'),
      autoCleanup: options.autoCleanup !== false
    };

    this.tempDir = this.options.tempDir;
    this.ensureTempDir();

    // 设置自动清理
    if (this.options.autoCleanup) {
      this.setupAutoCleanup();
    }
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private setupAutoCleanup(): void {
    // 程序退出时自动清理临时文件
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  private generateAttachmentId(): string {
    return `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async createTempAttachment(
    fileAttachment: FileAttachment,
    source: AttachmentSource
  ): Promise<ManagedAttachment> {
    const id = this.generateAttachmentId();
    let tempPath: string | undefined;
    let isTempFile = false;

    // 如果是Buffer内容（如截图），需要创建临时文件
    if (Buffer.isBuffer(fileAttachment.content)) {
      tempPath = path.join(this.tempDir, fileAttachment.filename);
      fs.writeFileSync(tempPath, fileAttachment.content);
      isTempFile = true;
    }

    const managedAttachment: ManagedAttachment = {
      ...fileAttachment,
      id,
      source,
      tempPath,
      isTempFile,
      content: Buffer.isBuffer(fileAttachment.content) ? fileAttachment.content.toString('base64') : fileAttachment.content
    };

    this.attachments.set(id, managedAttachment);
    return managedAttachment;
  }

  async addFromClipboard(): Promise<ManagedAttachment[]> {
    const clipboardContent = await ClipboardProcessor.handlePasteCommand();
    if (!clipboardContent) {
      return [];
    }

    const source: AttachmentSource = {
      type: 'paste',
      timestamp: new Date()
    };

    const newAttachments: ManagedAttachment[] = [];

    switch (clipboardContent.type) {
      case 'file':
      case 'image':
        const attachment = await this.createTempAttachment(
          clipboardContent.content as FileAttachment,
          source
        );
        newAttachments.push(attachment);
        break;

      case 'files':
        const attachments = clipboardContent.content as FileAttachment[];
        for (const att of attachments) {
          const managedAtt = await this.createTempAttachment(att, source);
          newAttachments.push(managedAtt);
        }
        break;

      case 'text':
        // 文本内容不作为附件处理
        console.log(chalk.yellow('📝 检测到文本内容，已直接插入到输入框'));
        break;
    }

    return newAttachments;
  }

  async addFromFile(filePath: string): Promise<ManagedAttachment | null> {
    try {
      const fileAttachment = await FileProcessor.processFile(filePath);

      const source: AttachmentSource = {
        type: 'file',
        originalPath: filePath,
        timestamp: new Date()
      };

      return await this.createTempAttachment(fileAttachment, source);
    } catch (error) {
      console.error(chalk.red(`❌ 添加文件失败: ${error instanceof Error ? error.message : '未知错误'}`));
      return null;
    }
  }

  async addFromDragDrop(filePaths: string[]): Promise<ManagedAttachment[]> {
    const newAttachments: ManagedAttachment[] = [];

    console.log(chalk.cyan(`📁 处理拖拽的 ${filePaths.length} 个文件...`));

    for (const filePath of filePaths) {
      try {
        const attachment = await this.addFromFile(filePath);
        if (attachment) {
          newAttachments.push(attachment);
          console.log(chalk.green(`✅ 已添加: ${attachment.filename}`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ 跳过文件 ${filePath}: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    }

    return newAttachments;
  }

  async addFromBuffer(buffer: Buffer, filename: string, mimeType?: string): Promise<ManagedAttachment> {
    const fileAttachment: FileAttachment = {
      type: mimeType?.startsWith('image/') ? 'image' : 'file',
      filename,
      content: buffer,
      mimeType: mimeType || this.getMimeTypeFromFilename(filename),
      size: buffer.length
    };

    const source: AttachmentSource = {
      type: 'upload',
      timestamp: new Date()
    };

    return await this.createTempAttachment(fileAttachment, source);
  }

  private getMimeTypeFromFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++',
      '.c': 'text/x-c',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.php': 'text/x-php',
      '.rb': 'text/x-ruby',
      '.swift': 'text/x-swift',
      '.kt': 'text/x-kotlin',
      '.scala': 'text/x-scala',
      '.sql': 'text/x-sql',
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  getAttachment(id: string): ManagedAttachment | undefined {
    return this.attachments.get(id);
  }

  getAllAttachments(): ManagedAttachment[] {
    return Array.from(this.attachments.values());
  }

  getAttachmentsByType(type: 'file' | 'image'): ManagedAttachment[] {
    return this.getAllAttachments().filter(att => att.type === type);
  }

  getTotalSize(): number {
    return this.getAllAttachments().reduce((total, att) => total + (att.size || 0), 0);
  }

  canAddAttachment(size: number): boolean {
    return this.attachments.size < this.options.maxAttachments &&
           this.getTotalSize() + size <= this.options.maxTotalSize;
  }

  removeAttachment(id: string): boolean {
    const attachment = this.attachments.get(id);
    if (!attachment) {
      return false;
    }

    // 删除临时文件
    if (attachment.isTempFile && attachment.tempPath && fs.existsSync(attachment.tempPath)) {
      try {
        fs.unlinkSync(attachment.tempPath);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ 删除临时文件失败: ${attachment.tempPath}`));
      }
    }

    this.attachments.delete(id);
    return true;
  }

  clearAttachments(): void {
    for (const attachment of this.attachments.values()) {
      if (attachment.isTempFile && attachment.tempPath && fs.existsSync(attachment.tempPath)) {
        try {
          fs.unlinkSync(attachment.tempPath);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ 删除临时文件失败: ${attachment.tempPath}`));
        }
      }
    }
    this.attachments.clear();
  }

  cleanup(): void {
    this.clearAttachments();

    // 清理空的临时目录
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        if (files.length === 0) {
          fs.rmdirSync(this.tempDir);
        }
      }
    } catch (error) {
      // 忽略清理目录的错误
    }
  }

  getStats(): {
    count: number;
    totalSize: number;
    fileCount: number;
    imageCount: number;
    tempFiles: number;
  } {
    const attachments = this.getAllAttachments();
    return {
      count: attachments.length,
      totalSize: this.getTotalSize(),
      fileCount: attachments.filter(att => att.type === 'file').length,
      imageCount: attachments.filter(att => att.type === 'image').length,
      tempFiles: attachments.filter(att => att.isTempFile).length
    };
  }

  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  displayAttachments(): void {
    const attachments = this.getAllAttachments();

    if (attachments.length === 0) {
      console.log(chalk.gray('📎 暂无附件'));
      return;
    }

    console.log(chalk.cyan(`\n📎 附件列表 (${attachments.length})`));
    console.log(chalk.gray('─'.repeat(50)));

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

    const stats = this.getStats();
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan(`总计: ${stats.count} 个文件 (${this.formatFileSize(stats.totalSize)})`));
    console.log(chalk.gray(`📄 文件: ${stats.fileCount} | 🖼️ 图片: ${stats.imageCount} | 🗂️ 临时文件: ${stats.tempFiles}`));
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

  private getSourceDescription(source: AttachmentSource): string {
    const descriptions = {
      'paste': '剪贴板粘贴',
      'drag': '拖拽添加',
      'upload': '文件上传',
      'file': '文件路径'
    };
    return descriptions[source.type as keyof typeof descriptions] || '未知来源';
  }
}