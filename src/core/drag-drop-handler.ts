import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { AttachmentManager } from './attachment-manager';
import chalk from 'chalk';
import ora from 'ora';

export interface DragDropEvent {
  type: 'drag-enter' | 'drag-leave' | 'drop';
  files?: string[];
  position?: { x: number; y: number };
}

export interface DragDropOptions {
  enabled?: boolean;
  showHints?: boolean;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
}

export class DragDropHandler extends EventEmitter {
  private options: Required<DragDropOptions>;
  private isEnabled: boolean = false;
  private isDragging: boolean = false;
  private watchedPaths: Set<string> = new Set();
  private attachmentManager: AttachmentManager;

  constructor(
    attachmentManager: AttachmentManager,
    options: DragDropOptions = {}
  ) {
    super();

    this.attachmentManager = attachmentManager;
    this.options = {
      enabled: options.enabled !== false,
      showHints: options.showHints !== false,
      maxFiles: options.maxFiles || 10,
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024 // 10MB
    };

    this.setupTerminalMonitoring();
  }

  enable(): void {
    if (!this.options.enabled) {
      console.log(chalk.yellow('⚠️ 拖拽功能未启用'));
      return;
    }

    this.isEnabled = true;
    console.log(chalk.green('✅ 拖拽功能已启用'));
    console.log(chalk.cyan('💡 提示: 您可以将文件拖拽到终端窗口中'));
  }

  disable(): void {
    this.isEnabled = false;
    this.isDragging = false;
    console.log(chalk.gray('📴 拖拽功能已禁用'));
  }

  private setupTerminalMonitoring(): void {
    // 监听标准输入，检测特殊序列
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', (data: Buffer) => {
      if (!this.isEnabled) return;

      const str = data.toString();

      // 检测拖拽相关的转义序列
      if (this.detectDragEnter(str)) {
        this.handleDragEnter();
      } else if (this.detectDragLeave(str)) {
        this.handleDragLeave();
      } else if (this.detectDrop(str)) {
        this.handleDrop();
      }
    });

      }

  private detectDragEnter(data: string): boolean {
    // 不同的终端有不同的拖拽序列
    const patterns = [
      /\x1b\[<\d+;\d+;\d+M/, // 通用鼠标按下事件
      /\x1b\[<\d+;\d+;\d+m/, // 通用鼠标移动事件
      /file:\/\//, // 文件路径
      /drag/i // 包含 drag 关键字
    ];

    return patterns.some(pattern => pattern.test(data));
  }

  private detectDragLeave(data: string): boolean {
    // 检测拖拽离开事件
    const patterns = [
      /\x1b\[<\d+;\d+;\d+m/, // 鼠标移动事件
      /leave/i, // 包含 leave 关键字
      /exit/i // 包含 exit 关键字
    ];

    return patterns.some(pattern => pattern.test(data)) && this.isDragging;
  }

  private detectDrop(data: string): boolean {
    // 检测放下事件
    const patterns = [
      /\x1b\[<\d+;\d+;\d+M/, // 鼠标释放事件
      /drop/i, // 包含 drop 关键字
      /file:\/\//, // 文件路径
      /\/[\w\-\.]+\.[\w]+/ // 文件路径模式
    ];

    return patterns.some(pattern => pattern.test(data)) && this.isDragging;
  }

  private handleDragEnter(): void {
    if (this.isDragging) return;

    this.isDragging = true;
    console.log(chalk.cyan('🎯 检测到文件拖拽...'));

    this.emit('drag-enter', {
      type: 'drag-enter'
    } as DragDropEvent);

    if (this.options.showHints) {
      console.log(chalk.gray('💡 释放鼠标以添加文件到附件列表'));
    }
  }

  private handleDragLeave(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    console.log(chalk.gray('📴 文件拖拽已取消'));

    this.emit('drag-leave', {
      type: 'drag-leave'
    } as DragDropEvent);
  }

  private handleDrop(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    console.log(chalk.cyan('📥 处理拖拽的文件...'));

    // 尝试从剪贴板或环境变量获取文件路径
    this.extractDroppedFiles()
      .then(files => {
        if (files.length > 0) {
          console.log(chalk.green(`✅ 检测到 ${files.length} 个文件`));
          this.emit('drop', {
            type: 'drop',
            files
          } as DragDropEvent);

          // 自动添加到附件管理器
          this.addFilesToAttachmentManager(files);
        } else {
          console.log(chalk.yellow('⚠️ 未检测到有效的文件'));
        }
      })
      .catch(error => {
        console.error(chalk.red(`❌ 处理拖拽文件失败: ${error.message}`));
      });
  }

  private async extractDroppedFiles(): Promise<string[]> {
    const files: string[] = [];

    try {
      // 方法1: 尝试从剪贴板读取文件路径
      const clipboard = require('clipboardy');
      const clipboardContent = await clipboard.read();

      const potentialFiles = this.extractFilePathsFromText(clipboardContent);
      files.push(...potentialFiles);
    } catch (error) {
      // 忽略剪贴板读取错误
    }

    // 方法2: 检查常见拖拽目录
    const commonDropPaths = [
      path.join(process.cwd(), 'dropped-files'),
      path.join(process.cwd(), 'temp'),
      path.join(process.cwd(), 'attachments'),
      os.tmpdir()
    ];

    for (const dropPath of commonDropPaths) {
      if (fs.existsSync(dropPath)) {
        const recentFiles = await this.getRecentFiles(dropPath);
        files.push(...recentFiles);
      }
    }

    // 方法3: 检查命令行参数
    if (process.argv.length > 2) {
      const argFiles = process.argv.slice(2).filter(arg =>
        fs.existsSync(arg) && fs.lstatSync(arg).isFile()
      );
      files.push(...argFiles);
    }

    // 去重并验证文件
    const uniqueFiles = [...new Set(files)].filter(file => {
      try {
        return fs.existsSync(file) && fs.lstatSync(file).isFile();
      } catch {
        return false;
      }
    });

    return uniqueFiles.slice(0, this.options.maxFiles);
  }

  private extractFilePathsFromText(text: string): string[] {
    const filePaths: string[] = [];

    // 匹配各种文件路径格式
    const patterns = [
      // Unix 绝对路径
      /(^|\n|\s)(\/[^\s\n]+)/g,
      // Windows 绝对路径
      /(^|\n|\s)([A-Za-z]:[\\\/][^\s\n]+)/g,
      // 相对路径
      /(^|\n|\s)(\.\.?[\/\\][^\s\n]+)/g,
      // 文件名（包含扩展名）
      /(^|\n|\s)([^\s\n\/\\]+\.[a-zA-Z0-9]+)/g,
      // file:// 协议
      /file:\/\/([^\s\n]+)/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const filePath = match[2] || match[1];
        if (filePath && !filePaths.includes(filePath)) {
          filePaths.push(filePath.trim());
        }
      }
    }

    return filePaths;
  }

  private async getRecentFiles(dirPath: string, maxAge: number = 30000): Promise<string[]> {
    const files: string[] = [];
    const now = Date.now();

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(dirPath, entry.name);
          const stats = fs.lstatSync(fullPath);

          // 只包含最近修改的文件（30秒内）
          if (now - stats.mtimeMs <= maxAge) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // 忽略目录读取错误
    }

    return files;
  }

  private async addFilesToAttachmentManager(filePaths: string[]): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    for (const filePath of filePaths) {
      try {
        // 检查文件大小
        const stats = fs.lstatSync(filePath);
        if (stats.size > this.options.maxFileSize) {
          console.warn(chalk.yellow(`⚠️ 文件过大: ${path.basename(filePath)} (${this.formatFileSize(stats.size)})`));
          failCount++;
          continue;
        }

        const attachment = await this.attachmentManager.addFromFile(filePath);
        if (attachment) {
          console.log(chalk.green(`✅ 已添加: ${attachment.filename}`));
          successCount++;
        } else {
          console.warn(chalk.yellow(`⚠️ 添加失败: ${path.basename(filePath)}`));
          failCount++;
        }
      } catch (error) {
        console.error(chalk.red(`❌ 处理文件失败 ${path.basename(filePath)}: ${error instanceof Error ? error.message : '未知错误'}`));
        failCount++;
      }
    }

    console.log(chalk.cyan(`📊 处理完成: ${successCount} 个成功, ${failCount} 个失败`));
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

  // 手动触发文件检测（用于调试或特殊情况）
  async manualFileDetection(): Promise<void> {
    if (!this.isEnabled) {
      console.log(chalk.yellow('⚠️ 拖拽功能未启用'));
      return;
    }

    console.log(chalk.cyan('🔍 手动检测文件...'));

    const files = await this.extractDroppedFiles();
    if (files.length > 0) {
      console.log(chalk.green(`✅ 发现 ${files.length} 个文件`));
      await this.addFilesToAttachmentManager(files);
    } else {
      console.log(chalk.gray('📭 未发现文件'));
    }
  }

  // 监听特定目录的文件变化
  watchDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      console.warn(chalk.yellow(`⚠️ 目录不存在: ${dirPath}`));
      return;
    }

    if (this.watchedPaths.has(dirPath)) {
      console.warn(chalk.yellow(`⚠️ 目录已在监听中: ${dirPath}`));
      return;
    }

    this.watchedPaths.add(dirPath);

    fs.watch(dirPath, (eventType, filename) => {
      if (!this.isEnabled || !filename) return;

      const fullPath = path.join(dirPath, filename);

      try {
        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
          console.log(chalk.cyan(`📁 检测到新文件: ${filename}`));

          // 自动添加到附件管理器
          this.attachmentManager.addFromFile(fullPath)
            .then(attachment => {
              if (attachment) {
                console.log(chalk.green(`✅ 自动添加: ${attachment.filename}`));
              }
            })
            .catch(error => {
              console.warn(chalk.yellow(`⚠️ 自动添加失败: ${error instanceof Error ? error.message : '未知错误'}`));
            });
        }
      } catch (error) {
        // 忽略错误
      }
    });

    console.log(chalk.green(`✅ 开始监听目录: ${dirPath}`));
  }

  stopWatchingDirectory(dirPath: string): void {
    if (this.watchedPaths.has(dirPath)) {
      this.watchedPaths.delete(dirPath);
      console.log(chalk.gray(`📴 停止监听目录: ${dirPath}`));
    }
  }

  getStatus(): {
    enabled: boolean;
    isDragging: boolean;
    watchedPaths: string[];
    options: DragDropOptions;
  } {
    return {
      enabled: this.isEnabled,
      isDragging: this.isDragging,
      watchedPaths: Array.from(this.watchedPaths),
      options: this.options
    };
  }

  cleanup(): void {
    this.isEnabled = false;
    this.isDragging = false;
    this.watchedPaths.clear();
    this.removeAllListeners();
  }
}