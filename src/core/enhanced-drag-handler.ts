import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { AttachmentManager, ManagedAttachment } from './attachment-manager';
import { ClipboardProcessor } from './clipboard-processor';
import chalk from 'chalk';
import ora from 'ora';

export interface DragState {
  isDragging: boolean;
  dragCount: number;
  lastDragTime: number;
  hoveredFiles: string[];
  previewMode: boolean;
}

export interface DragDropFeedback {
  type: 'enter' | 'over' | 'leave' | 'drop' | 'error';
  message: string;
  files?: string[];
  progress?: number;
}

export interface EnhancedDragOptions {
  enableRealTimeFeedback?: boolean;
  enableFilePreview?: boolean;
  enableHoverEffects?: boolean;
  dragTimeout?: number;
  maxConcurrentFiles?: number;
  showProgressIndicators?: boolean;
}

export class EnhancedDragHandler extends EventEmitter {
  private attachmentManager: AttachmentManager;
  private options: Required<EnhancedDragOptions>;
  private dragState: DragState;
  private feedbackSpinner: any = null;
  private originalPrompt: string = '';
  private isListening: boolean = false;
  private dragCheckInterval: NodeJS.Timeout | null = null;
  private knownFiles: Set<string> = new Set();

  constructor(
    attachmentManager: AttachmentManager,
    options: EnhancedDragOptions = {}
  ) {
    super();

    this.attachmentManager = attachmentManager;
    this.options = {
      enableRealTimeFeedback: options.enableRealTimeFeedback !== false,
      enableFilePreview: options.enableFilePreview !== false,
      enableHoverEffects: options.enableHoverEffects !== false,
      dragTimeout: options.dragTimeout || 5000,
      maxConcurrentFiles: options.maxConcurrentFiles || 10,
      showProgressIndicators: options.showProgressIndicators !== false
    };

    this.dragState = {
      isDragging: false,
      dragCount: 0,
      lastDragTime: 0,
      hoveredFiles: [],
      previewMode: false
    };

    this.setupEnhancedMonitoring();
  }

  private setupEnhancedMonitoring(): void {
    // 不在全局设置raw mode，而是通过其他方式监听拖拽事件
    // 监听终端焦点变化
    process.stdout.on('resize', () => {
      if (this.dragState.isDragging) {
        this.updateDragFeedback();
      }
    });

    // 设置信号处理
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  private handleRawInput(data: Buffer): void {
    const str = data.toString();

    // 检测各种拖拽相关的序列
    if (this.detectDragStart(str)) {
      this.handleDragStart();
    } else if (this.detectDragOver(str)) {
      this.handleDragOver(str);
    } else if (this.detectDragEnd(str)) {
      this.handleDragEnd();
    } else if (this.detectFileDrop(str)) {
      this.handleFileDrop(str);
    }
  }

  private detectDragStart(data: string): boolean {
    // 检测拖拽开始的各种模式
    const patterns = [
      /\x1b\[<24;(\d+);(\d+)M/, // 鼠标左键按下（可能是拖拽开始）
      /\x1b\[<\d+;\d+;\d+M.*\x1b\[<\d+;\d+;\d+m/, // 按下+移动序列
      /file:\/\/[^\s]+/, // 文件URL（某些终端的拖拽格式）
      /data:text\/plain,[^\s]+/, // 文本数据拖拽
    ];

    return patterns.some(pattern => pattern.test(data)) && !this.dragState.isDragging;
  }

  private detectDragOver(data: string): boolean {
    // 检测拖拽悬停
    const patterns = [
      /\x1b\[<\d+;\d+;\d+m/, // 鼠标移动事件
      /\x1b\[M[\x20-\x2f]/, // X10 鼠标编码
    ];

    return patterns.some(pattern => pattern.test(data)) && this.dragState.isDragging;
  }

  private detectDragEnd(data: string): boolean {
    // 检测拖拽结束
    const patterns = [
      /\x1b\[<24;\d+;\d+m/, // 鼠标释放
      /\x1b\[M\x23/, // X10 鼠标释放
      /dragend/i, // 某些终端的文本标识
    ];

    return patterns.some(pattern => pattern.test(data)) && this.dragState.isDragging;
  }

  private detectFileDrop(data: string): boolean {
    // 检测文件放下
    const patterns = [
      /file:\/\/([^\s\x00]+)/g, // 文件URL
      /([a-zA-Z]:[\\\/][^\s\x00]+)/g, // Windows路径
      /(\/[^\s\x00]+)/g, // Unix路径
      /(\.\/[^\s\x00]+)/g, // 相对路径
    ];

    const matches = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        const filePath = match[1] || match[0];
        if (filePath && this.looksLikeFilePath(filePath)) {
          matches.push(filePath);
        }
      }
    }

    if (matches.length > 0) {
      this.handleFileDropFromPaths(matches);
      return true;
    }

    return false;
  }

  private looksLikeFilePath(content: string): boolean {
    const trimmed = content.trim();

    // 更严格的文件路径检测
    const patterns = [
      /^[a-zA-Z]:\\/, // Windows绝对路径
      /^\/[^\/\s]/, // Unix绝对路径
      /^\.\.?[\/\\]/, // 相对路径
      /^[^\/\\]+\.[a-zA-Z0-9]+$/, // 文件名.扩展名
      /^[^\/\\]+[\/\\][^\/\\]+/ // 包含路径分隔符
    ];

    // 额外检查：是否包含文件扩展名
    const hasExtension = /\.[a-zA-Z0-9]{2,}$/.test(trimmed);

    return patterns.some(pattern => pattern.test(trimmed)) || hasExtension;
  }

  private async handleDragStart(): Promise<void> {
    if (this.dragState.isDragging) return;

    this.dragState.isDragging = true;
    this.dragState.dragCount++;
    this.dragState.lastDragTime = Date.now();

    this.showFeedback({
      type: 'enter',
      message: '🎯 检测到文件拖拽...'
    });

    this.emit('dragStart', {
      timestamp: new Date(),
      dragCount: this.dragState.dragCount
    });

    // 设置拖拽超时
    setTimeout(() => {
      if (this.dragState.isDragging) {
        this.handleDragTimeout();
      }
    }, this.options.dragTimeout);
  }

  private handleDragOver(data: string): void {
    if (!this.dragState.isDragging) return;

    // 更新拖拽位置信息
    this.updateDragFeedback();

    // 尝试从数据中提取文件信息进行预览
    if (this.options.enableFilePreview) {
      this.extractFilePreview(data);
    }
  }

  private handleDragEnd(): void {
    if (!this.dragState.isDragging) return;

    this.showFeedback({
      type: 'leave',
      message: '📴 拖拽已取消'
    });

    this.resetDragState();

    this.emit('dragEnd', {
      timestamp: new Date(),
      duration: Date.now() - this.dragState.lastDragTime
    });
  }

  private async handleFileDrop(data: string): Promise<void> {
    if (!this.dragState.isDragging) return;

    this.showFeedback({
      type: 'drop',
      message: '📥 处理拖拽的文件...'
    });

    try {
      // 提取文件路径
      const filePaths = await this.extractFilePathsFromData(data);

      if (filePaths.length > 0) {
        await this.processDroppedFiles(filePaths);
      } else {
        this.showFeedback({
          type: 'error',
          message: '❌ 未检测到有效的文件'
        });
      }
    } catch (error) {
      this.showFeedback({
        type: 'error',
        message: `❌ 处理拖拽文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    this.resetDragState();
  }

  private async handleFileDropFromPaths(filePaths: string[]): Promise<void> {
    this.showFeedback({
      type: 'drop',
      message: `📥 检测到 ${filePaths.length} 个文件`
    });

    await this.processDroppedFiles(filePaths);
    this.resetDragState();
  }

  private async extractFilePathsFromData(data: string): Promise<string[]> {
    const filePaths: string[] = [];

    // 多种提取策略
    const strategies = [
      () => this.extractFromFileUrls(data),
      () => this.extractFromPaths(data),
      () => this.extractFromClipboard(),
      () => this.extractFromTempDirectory()
    ];

    for (const strategy of strategies) {
      try {
        const paths = await strategy();
        filePaths.push(...paths);
      } catch (error) {
        // 忽略单个策略的错误
      }
    }

    // 去重并验证
    const uniquePaths = [...new Set(filePaths)].filter(path => {
      try {
        return fs.existsSync(path) && fs.lstatSync(path).isFile();
      } catch {
        return false;
      }
    });

    return uniquePaths.slice(0, this.options.maxConcurrentFiles);
  }

  private extractFromFileUrls(data: string): string[] {
    const fileUrlPattern = /file:\/\/([^\s\x00]+)/g;
    const paths: string[] = [];
    let match;

    while ((match = fileUrlPattern.exec(data)) !== null) {
      const filePath = decodeURIComponent(match[1]);
      if (this.looksLikeFilePath(filePath)) {
        paths.push(filePath);
      }
    }

    return paths;
  }

  private extractFromPaths(data: string): string[] {
    const pathPatterns = [
      /([a-zA-Z]:[\\\/][^\s\x00]+)/g, // Windows
      /(\/[^\s\x00]+)/g, // Unix绝对路径
      /(\.\/[^\s\x00]+)/g, // 相对路径
    ];

    const paths: string[] = [];

    for (const pattern of pathPatterns) {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        const filePath = match[1];
        if (this.looksLikeFilePath(filePath)) {
          paths.push(filePath);
        }
      }
    }

    return paths;
  }

  private async extractFromClipboard(): Promise<string[]> {
    try {
      const clipboard = require('clipboardy');
      const content = await clipboard.read();
      return this.extractFromPaths(content);
    } catch {
      return [];
    }
  }

  private async extractFromTempDirectory(): Promise<string[]> {
    const tempDirs = [
      path.join(os.tmpdir(), 'aicli-drag-drop'),
      path.join(os.tmpdir()),
      path.join(process.cwd(), 'temp'),
      path.join(process.cwd(), 'dropped-files')
    ];

    const recentFiles: string[] = [];
    const now = Date.now();
    const timeWindow = 30000; // 30秒内的文件

    for (const tempDir of tempDirs) {
      try {
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = fs.lstatSync(filePath);

            if (stats.isFile() && (now - stats.mtimeMs) <= timeWindow) {
              recentFiles.push(filePath);
            }
          }
        }
      } catch {
        // 忽略目录访问错误
      }
    }

    return recentFiles;
  }

  private async processDroppedFiles(filePaths: string[]): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    if (this.options.showProgressIndicators) {
      this.feedbackSpinner = ora({
        text: `处理文件 (0/${filePaths.length})`,
        color: 'blue'
      }).start();
    }

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      if (this.feedbackSpinner) {
        this.feedbackSpinner.text = `处理文件 (${i + 1}/${filePaths.length}): ${path.basename(filePath)}`;
      }

      try {
        // 检查文件大小
        const stats = fs.lstatSync(filePath);
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (stats.size > maxSize) {
          console.warn(chalk.yellow(`⚠️ 文件过大: ${path.basename(filePath)} (${this.formatFileSize(stats.size)})`));
          failCount++;
          continue;
        }

        // 添加到附件管理器
        const attachment = await this.attachmentManager.addFromFile(filePath);
        if (attachment) {
          successCount++;

          if (this.options.enableRealTimeFeedback) {
            console.log(chalk.green(`✅ 已添加: ${attachment.filename}`));
          }
        } else {
          failCount++;
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ 处理文件失败 ${path.basename(filePath)}: ${error instanceof Error ? error.message : '未知错误'}`));
        failCount++;
      }
    }

    if (this.feedbackSpinner) {
      this.feedbackSpinner.stop();
      this.feedbackSpinner = null;
    }

    // 显示最终结果
    if (successCount > 0) {
      console.log(chalk.green(`\n✅ 成功添加 ${successCount} 个文件`));

      // 显示附件管理提示
      const totalAttachments = this.attachmentManager.getStats().count;
      console.log(chalk.cyan(`💡 当前共有 ${totalAttachments} 个附件，输入 /attachments 查看`));

      this.emit('filesProcessed', {
        successCount,
        failCount,
        totalCount: filePaths.length
      });
    }

    if (failCount > 0) {
      console.log(chalk.yellow(`⚠️ ${failCount} 个文件处理失败`));
    }
  }

  private extractFilePreview(data: string): void {
    // 简单的文件预览逻辑
    const previewMatch = data.match(/file:\/\/([^\s]+)/);
    if (previewMatch) {
      const filePath = decodeURIComponent(previewMatch[1]);
      if (fs.existsSync(filePath)) {
        const stats = fs.lstatSync(filePath);
        const fileName = path.basename(filePath);
        const fileSize = this.formatFileSize(stats.size);

        this.dragState.hoveredFiles = [filePath];

        // 显示预览信息
        this.showFeedback({
          type: 'over',
          message: `📄 ${fileName} (${fileSize})`,
          files: [fileName]
        });
      }
    }
  }

  private updateDragFeedback(): void {
    if (!this.options.enableRealTimeFeedback || !this.dragState.isDragging) return;

    // 可以在这里添加更复杂的视觉反馈
    const elapsed = Date.now() - this.dragState.lastDragTime;
    const message = `🎯 拖拽中... (${Math.floor(elapsed / 1000)}s)`;

    this.showFeedback({
      type: 'over',
      message
    });
  }

  private handleDragTimeout(): void {
    if (this.dragState.isDragging) {
      this.showFeedback({
        type: 'error',
        message: '⏰ 拖拽超时，请重试'
      });

      this.resetDragState();
    }
  }

  private showFeedback(feedback: DragDropFeedback): void {
    // 清除之前的反馈
    if (this.feedbackSpinner) {
      this.feedbackSpinner.stop();
    }

    // 显示新的反馈
    switch (feedback.type) {
      case 'enter':
        console.log(chalk.cyan(feedback.message));
        break;
      case 'over':
        if (feedback.files && feedback.files.length > 0) {
          console.log(chalk.blue(`${feedback.message}`));
          feedback.files.forEach(file => {
            console.log(chalk.gray(`   📄 ${file}`));
          });
        } else {
          // 简单的覆盖显示，避免过多输出
          process.stdout.write(`\r${chalk.blue(feedback.message)}   `);
        }
        break;
      case 'leave':
        console.log(chalk.gray(feedback.message));
        break;
      case 'drop':
        console.log(chalk.magenta(feedback.message));
        break;
      case 'error':
        console.log(chalk.red(feedback.message));
        break;
    }

    this.emit('feedback', feedback);
  }

  private resetDragState(): void {
    this.dragState.isDragging = false;
    this.dragState.hoveredFiles = [];
    this.dragState.previewMode = false;

    if (this.feedbackSpinner) {
      this.feedbackSpinner.stop();
      this.feedbackSpinner = null;
    }
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
  public enable(): void {
    this.isListening = true;
    // 使用替代的拖拽检测方式，不干扰readline
    this.setupAlternativeDragDetection();
    console.log(chalk.green('✅ 增强拖拽功能已启用'));
    console.log(chalk.cyan('💡 提示: 直接拖拽文件到输入框中即可添加附件'));
  }

  public disable(): void {
    this.isListening = false;
    this.resetDragState();
    this.cleanupAlternativeDragDetection();
    console.log(chalk.gray('📴 增强拖拽功能已禁用'));
  }

  public getDragState(): DragState {
    return { ...this.dragState };
  }

  public setPrompt(prompt: string): void {
    this.originalPrompt = prompt;
  }

  private setupAlternativeDragDetection(): void {
    // 简化实现：不使用主动检测，而是依赖其他组件的拖拽检测
    // 这样避免与readline发生冲突
    console.log(chalk.cyan('🎯 增强拖拽检测已启用（被动模式）'));
  }

  private cleanupAlternativeDragDetection(): void {
    // 清理资源
    this.knownFiles.clear();
  }

  public cleanup(): void {
    this.isListening = false;
    this.resetDragState();
    this.cleanupAlternativeDragDetection();
    this.removeAllListeners();
  }
}