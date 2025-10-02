import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { AttachmentManager, ManagedAttachment } from './attachment-manager';
import chalk from 'chalk';
import ora from 'ora';

export interface TerminalDragEvent {
  type: 'drag-start' | 'drag-progress' | 'drag-complete' | 'drag-error';
  files: DroppedFile[];
  message?: string;
}

export interface DroppedFile {
  originalPath: string;
  fileName: string;
  fileSize: number;
  fileType: 'image' | 'document' | 'text' | 'binary' | 'unknown';
  mimeType?: string;
  tempPath?: string;
  isProcessed: boolean;
  error?: string;
}

export interface TerminalDragOptions {
  enableFileWatcher?: boolean;
  enableTempDirectory?: boolean;
  watchDirectories?: string[];
  tempDirectory?: string;
  detectionWindow?: number; // 毫秒
  maxFileSize?: number;
  maxFiles?: number;
  showProgress?: boolean;
  enablePreview?: boolean;
}

export class TerminalDragDetector extends EventEmitter {
  private options: Required<TerminalDragOptions>;
  private attachmentManager: AttachmentManager;
  private isActive: boolean = false;
  private knownFiles: Map<string, number> = new Map(); // 文件路径 -> 发现时间
  private watchTimers: Map<string, NodeJS.Timeout> = new Map();
  private processingFiles: Set<string> = new Set();
  private dragStartTime: number = 0;
  private currentDragSession: string = '';

  constructor(
    attachmentManager: AttachmentManager,
    options: TerminalDragOptions = {}
  ) {
    super();

    this.attachmentManager = attachmentManager;
    this.options = {
      enableFileWatcher: options.enableFileWatcher !== false,
      enableTempDirectory: options.enableTempDirectory !== false,
      watchDirectories: options.watchDirectories || this.getDefaultWatchDirectories(),
      tempDirectory: options.tempDirectory || path.join(os.tmpdir(), 'aicli-drag-drop'),
      detectionWindow: options.detectionWindow || 3000, // 3秒
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
      maxFiles: options.maxFiles || 10,
      showProgress: options.showProgress !== false,
      enablePreview: options.enablePreview !== false
    };

    
    this.ensureTempDirectory();
  }

  private getDefaultWatchDirectories(): string[] {
    return [
      os.tmpdir(),
      path.join(os.tmpdir(), 'aicli-drag-drop'),
      path.join(process.cwd(), 'temp'),
      path.join(process.cwd(), 'dropped-files'),
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Desktop')
    ];
  }

  private ensureTempDirectory(): void {
    try {
      if (!fs.existsSync(this.options.tempDirectory)) {
        fs.mkdirSync(this.options.tempDirectory, { recursive: true });
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ 无法创建临时目录: ${this.options.tempDirectory}`));
    }
  }

  public enable(): void {
    if (this.isActive) {
      console.log(chalk.yellow('📴 终端拖拽检测已启用'));
      return;
    }

    this.isActive = true;
    this.startFileWatching();

    console.log(chalk.green('✅ 终端拖拽检测已启用'));
    console.log(chalk.cyan('💡 现在支持拖拽文件和图片到终端'));

    if (this.options.enablePreview) {
      console.log(chalk.gray('   📋 拖拽后将在下方显示文件预览'));
    }
  }

  public disable(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.stopFileWatching();
    this.clearAllTimers();

    console.log(chalk.gray('📴 终端拖拽检测已禁用'));
  }

  private startFileWatching(): void {
    if (!this.options.enableFileWatcher) return;

    // 设置定时检查
    const checkInterval = setInterval(() => {
      if (this.isActive) {
        this.checkForNewFiles();
      } else {
        clearInterval(checkInterval);
      }
    }, 500);

    // 立即检查一次
    this.checkForNewFiles();
  }

  private stopFileWatching(): void {
    this.clearAllTimers();
  }

  private clearAllTimers(): void {
    for (const [path, timer] of this.watchTimers) {
      clearTimeout(timer);
    }
    this.watchTimers.clear();
  }

  private async checkForNewFiles(): Promise<void> {
    if (!this.isActive) return;

    const currentTime = Date.now();
    const newFiles: DroppedFile[] = [];

    for (const directory of this.options.watchDirectories) {
      try {
        if (!fs.existsSync(directory)) continue;

        const files = fs.readdirSync(directory, { withFileTypes: true });

        
        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(directory, file.name);
            await this.processPotentialFile(filePath, currentTime, newFiles);
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
      }
    }

    if (newFiles.length > 0) {
      await this.handleNewFiles(newFiles);
    }

    // 清理过期的已知文件记录
    this.cleanupKnownFiles(currentTime);
  }

  private async processPotentialFile(
    filePath: string,
    currentTime: number,
    newFiles: DroppedFile[]
  ): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const stats = fs.lstatSync(filePath);
      const fileModifiedTime = stats.mtimeMs;

      // 过滤系统临时文件和无意义文件
      if (this.shouldIgnoreFile(fileName, filePath)) {
        return;
      }

      // 检查是否是新文件（在检测窗口内修改的）
      const timeDiff = currentTime - fileModifiedTime;
      if (timeDiff > this.options.detectionWindow) {
        return; // 文件太老了，不是新拖拽的
      }

      
      // 检查是否已经在处理中
      if (this.processingFiles.has(filePath) || this.knownFiles.has(filePath)) {
        return;
      }

      // 检查文件大小
      if (stats.size > this.options.maxFileSize) {
        console.warn(chalk.yellow(`⚠️ 文件过大: ${fileName} (${this.formatFileSize(stats.size)})`));
        return;
      }

      // 检查文件类型
      const fileType = this.detectFileType(filePath, stats);

      // 添加到新文件列表
      const droppedFile: DroppedFile = {
        originalPath: filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        fileType,
        mimeType: this.getMimeType(filePath),
        isProcessed: false
      };

      newFiles.push(droppedFile);
      this.knownFiles.set(filePath, currentTime);
      this.processingFiles.add(filePath);

      // 设置延迟处理，避免文件还未完全写入
      const timer = setTimeout(() => {
        this.processFileAfterDelay(droppedFile);
      }, 1000);

      this.watchTimers.set(filePath, timer);

    } catch (error) {
      // 忽略无法处理的文件
    }
  }

  private async processFileAfterDelay(droppedFile: DroppedFile): Promise<void> {
    try {
      // 再次检查文件是否存在和完整
      if (!fs.existsSync(droppedFile.originalPath)) {
        this.processingFiles.delete(droppedFile.originalPath);
        return;
      }

      const stats = fs.lstatSync(droppedFile.originalPath);

      // 如果文件还在写入中（大小变化），等待更长时间
      const initialSize = droppedFile.fileSize;
      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentStats = fs.lstatSync(droppedFile.originalPath);
      if (currentStats.size !== initialSize) {
        // 文件还在写入，重新设置定时器
        droppedFile.fileSize = currentStats.size;
        const timer = setTimeout(() => {
          this.processFileAfterDelay(droppedFile);
        }, 3000);
        this.watchTimers.set(droppedFile.originalPath, timer);
        return;
      }

      // 文件已经稳定，可以处理
      droppedFile.isProcessed = true;

      // 创建临时副本（如果需要）
      if (this.options.enableTempDirectory) {
        droppedFile.tempPath = await this.createTempCopy(droppedFile.originalPath);
      }

      this.processingFiles.delete(droppedFile.originalPath);

    } catch (error) {
      droppedFile.error = error instanceof Error ? error.message : '未知错误';
      this.processingFiles.delete(droppedFile.originalPath);
    }
  }

  private async createTempCopy(originalPath: string): Promise<string> {
    const fileName = path.basename(originalPath);
    const timestamp = Date.now();
    const tempFileName = `${timestamp}-${fileName}`;
    const tempPath = path.join(this.options.tempDirectory, tempFileName);

    try {
      fs.copyFileSync(originalPath, tempPath);
      return tempPath;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ 无法创建临时副本: ${fileName}`));
      return originalPath;
    }
  }

  private async handleNewFiles(files: DroppedFile[]): Promise<void> {
    if (files.length === 0) return;

    // 开始新的拖拽会话
    this.dragStartTime = Date.now();
    this.currentDragSession = `session-${this.dragStartTime}`;

    // 发送拖拽开始事件
    this.emit('drag-start', {
      type: 'drag-start',
      files,
      message: `检测到 ${files.length} 个文件拖入`
    });

    if (this.options.showProgress) {
      const spinner = ora({
        text: `处理拖拽文件 (0/${files.length})`,
        color: 'blue'
      }).start();

      // 处理文件
      const processedFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        spinner.text = `处理文件 (${i + 1}/${files.length}): ${file.fileName}`;

        try {
          if (file.isProcessed) {
            const attachment = await this.attachmentManager.addFromFile(
              file.tempPath || file.originalPath
            );

            if (attachment) {
              processedFiles.push(attachment);
              file.isProcessed = true;
            } else {
              file.error = '无法添加为附件';
            }
          }
        } catch (error) {
          file.error = error instanceof Error ? error.message : '处理失败';
        }

        // 发送进度事件
        this.emit('drag-progress', {
          type: 'drag-progress',
          files: [file],
          message: `已处理 ${i + 1}/${files.length} 个文件`
        });
      }

      spinner.stop();

      // 发送完成事件
      this.emit('drag-complete', {
        type: 'drag-complete',
        files: processedFiles.map(f => ({
          originalPath: f.source.originalPath || '',
          fileName: f.filename,
          fileSize: f.size || 0,
          fileType: f.type as any,
          mimeType: f.mimeType,
          tempPath: f.tempPath,
          isProcessed: true
        })),
        message: `成功处理 ${processedFiles.length} 个文件`
      });

    } else {
      // 不显示进度条，直接处理
      const processedFiles = [];
      for (const file of files) {
        if (file.isProcessed) {
          try {
            const attachment = await this.attachmentManager.addFromFile(
              file.tempPath || file.originalPath
            );
            if (attachment) {
              processedFiles.push(attachment);
            }
          } catch (error) {
            file.error = error instanceof Error ? error.message : '处理失败';
          }
        }
      }

      this.emit('drag-complete', {
        type: 'drag-complete',
        files: processedFiles.map(f => ({
          originalPath: f.source.originalPath || '',
          fileName: f.filename,
          fileSize: f.size || 0,
          fileType: f.type as any,
          mimeType: f.mimeType,
          tempPath: f.tempPath,
          isProcessed: true
        })),
        message: `成功处理 ${processedFiles.length} 个文件`
      });
    }
  }

  private detectFileType(filePath: string, stats: fs.Stats): DroppedFile['fileType'] {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // 图片类型
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'];
    if (imageExts.includes(ext)) {
      return 'image';
    }

    // 文档类型
    const documentExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'];
    if (documentExts.includes(ext)) {
      return 'document';
    }

    // 文本类型
    const textExts = ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.log', '.csv'];
    if (textExts.includes(ext) || fileName.includes('readme')) {
      return 'text';
    }

    // 二进制类型
    const binaryExts = ['.exe', '.dmg', '.pkg', '.deb', '.rpm', '.zip', '.tar', '.gz'];
    if (binaryExts.includes(ext)) {
      return 'binary';
    }

    return 'unknown';
  }

  private getMimeType(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml'
    };

    return mimeTypes[ext];
  }

  private cleanupKnownFiles(currentTime: number): void {
    const maxAge = this.options.detectionWindow * 2; // 保留时间为检测窗口的2倍

    for (const [filePath, timestamp] of this.knownFiles) {
      if (currentTime - timestamp > maxAge) {
        this.knownFiles.delete(filePath);
        this.processingFiles.delete(filePath);

        const timer = this.watchTimers.get(filePath);
        if (timer) {
          clearTimeout(timer);
          this.watchTimers.delete(filePath);
        }
      }
    }
  }

  private shouldIgnoreFile(fileName: string, filePath: string): boolean {
    // 忽略无扩展名或扩展名异常的系统文件
    const ext = path.extname(fileName).toLowerCase();

    // 1. 忽略无扩展名的文件
    if (!ext && fileName.length > 20) {
      return true;
    }

    // 2. 忽略看起来像系统临时文件的文件
    if (fileName.includes('claude-') ||
        fileName.includes('cwd') ||
        fileName.match(/^\d{13}-/) || // 时间戳开头的长文件名
        fileName.includes('temp') ||
        fileName.includes('tmp')) {
      return true;
    }

    // 3. 忽略隐藏文件
    if (fileName.startsWith('.')) {
      return true;
    }

    // 4. 忽略常见的系统临时文件模式
    if (fileName.match(/^[a-f0-9]{8,}-/)) { // 十六进制开头的文件
      return true;
    }

    // 5. 忽略过短的文件名（可能是系统生成的）
    if (fileName.length < 3 && !ext) {
      return true;
    }

    return false;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // 公共方法
  public getStats(): {
    isActive: boolean;
    knownFilesCount: number;
    processingFilesCount: number;
    currentSession: string;
  } {
    return {
      isActive: this.isActive,
      knownFilesCount: this.knownFiles.size,
      processingFilesCount: this.processingFiles.size,
      currentSession: this.currentDragSession
    };
  }

  public cleanup(): void {
    this.disable();
    this.removeAllListeners();

    // 清理临时文件
    if (this.options.enableTempDirectory && fs.existsSync(this.options.tempDirectory)) {
      try {
        const files = fs.readdirSync(this.options.tempDirectory);
        for (const file of files) {
          const filePath = path.join(this.options.tempDirectory, file);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // 忽略删除失败
          }
        }
      } catch {
        // 忽略清理错误
      }
    }
  }
}