import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { AttachmentManager, ManagedAttachment } from './attachment-manager';
import chalk from 'chalk';
import ora from 'ora';

export interface RealDragEvent {
  type: 'drag-enter' | 'drag-over' | 'drag-leave' | 'drop' | 'drag-error';
  files: RealDroppedFile[];
  position?: { x: number; y: number };
  message?: string;
}

export interface RealDroppedFile {
  originalPath: string;
  fileName: string;
  fileSize: number;
  fileType: 'image' | 'document' | 'text' | 'binary' | 'unknown';
  mimeType?: string;
  tempPath?: string;
  isProcessed: boolean;
  error?: string;
}

export interface RealDragOptions {
  enableAnsiDetection?: boolean;
  enableFileSystemFallback?: boolean;
  enableTerminalSpecific?: boolean;
  watchDirectories?: string[];
  detectionTimeout?: number;
  maxFileSize?: number;
  maxFiles?: number;
  showVisualFeedback?: boolean;
}

export class RealDragDetector extends EventEmitter {
  private options: Required<RealDragOptions>;
  private attachmentManager: AttachmentManager;
  private isActive: boolean = false;
  private isDragging: boolean = false;
  private dragPosition: { x: number; y: number } = { x: 0, y: 0 };
  private detectedFiles: RealDroppedFile[] = [];
  private terminalCapabilities: {
    isITerm2: boolean;
    isMacTerminal: boolean;
    supportsMouse: boolean;
    supports256Color: boolean;
  };

  constructor(
    attachmentManager: AttachmentManager,
    options: RealDragOptions = {}
  ) {
    super();

    this.attachmentManager = attachmentManager;
    this.options = {
      enableAnsiDetection: options.enableAnsiDetection !== false,
      enableFileSystemFallback: options.enableFileSystemFallback !== false,
      enableTerminalSpecific: options.enableTerminalSpecific !== false,
      watchDirectories: options.watchDirectories || this.getDefaultWatchDirectories(),
      detectionTimeout: options.detectionTimeout || 5000,
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
      maxFiles: options.maxFiles || 10,
      showVisualFeedback: options.showVisualFeedback !== false
    };

    this.terminalCapabilities = this.detectTerminalCapabilities();
  }

  private detectTerminalCapabilities() {
    const term = process.env.TERM_PROGRAM;
    const termType = process.env.TERM;

    return {
      isITerm2: term === 'iTerm.app',
      isMacTerminal: term === 'Apple_Terminal',
      supportsMouse: termType?.includes('xterm') || false,
      supports256Color: process.env.COLORTERM === 'truecolor' || process.env.TERM === 'xterm-256color'
    };
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

  public enable(): void {
    if (this.isActive) return;

    this.isActive = true;

    console.log(chalk.green('🎯 增强拖拽检测已启用'));
    console.log(chalk.cyan('💡 现在支持直接拖拽文件到终端输入框区域'));

    if (this.options.showVisualFeedback) {
      console.log(chalk.gray('   📋 拖拽时会在输入框附近显示视觉反馈'));
    }

    this.setupAnsiDetection();
    this.setupFileSystemFallback();
    this.setupTerminalSpecificDetection();
  }

  public disable(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.removeAllListeners();
    console.log(chalk.gray('📴 增强拖拽检测已禁用'));
  }

  private setupAnsiDetection(): void {
    if (!this.options.enableAnsiDetection) return;

    try {
      // 检查stdin是否支持setRawMode
      if (typeof process.stdin.setRawMode !== 'function') {
        console.warn(chalk.yellow('⚠️ 终端不支持原始模式，ANSI拖拽检测被禁用'));
        return;
      }

      // 启用原始鼠标追踪
      if (this.terminalCapabilities.supportsMouse) {
        process.stdout.write('\x1b[?1003h'); // 启用所有鼠标事件追踪
        process.stdout.write('\x1b[?1006h'); // 启用SGR模式
      }

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (data: string) => {
        this.handleRawInput(data);
      });

      process.stdout.write('\x1b[?1000h'); // 启用鼠标追踪

    } catch (error) {
      console.warn(chalk.yellow('⚠️ ANSI拖拽检测初始化失败:', error instanceof Error ? error.message : '未知错误'));
    }
  }

  private handleRawInput(data: string): void {
    if (!this.isActive) return;

    // 检测ANSI鼠标序列
    const mouseMatch = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouseMatch) {
      const [, button, x, y, action] = mouseMatch;
      this.handleMouseEvent(parseInt(button), parseInt(x), parseInt(y), action);
      return;
    }

    // 检测iTerm2文件拖拽序列
    const iterm2Match = data.match(/\x1b\]1337;File=([=:]+)([^:]+):([a-f0-9]+)\x07/);
    if (iterm2Match) {
      this.handleITerm2FileDrop(iterm2Match);
      return;
    }

    // 检测文件URL
    const fileUrlMatch = data.match(/file:\/\/([^\s\x00]+)/g);
    if (fileUrlMatch) {
      this.handleFileUrls(fileUrlMatch);
      return;
    }

    // 检测Ctrl+C (退出)
    if (data === '\x03') {
      this.cleanup();
    }
  }

  private handleMouseEvent(button: number, x: number, y: number, action: string): void {
    this.dragPosition = { x, y };

    // 左键按下 (button 0, action M)
    if (button === 0 && action === 'M') {
      if (!this.isDragging) {
        this.isDragging = true;
        this.emit('drag-enter', {
          type: 'drag-enter',
          files: [],
          position: { x, y },
          message: '检测到拖拽开始'
        });
        this.showDragFeedback(x, y);
      } else {
        this.emit('drag-over', {
          type: 'drag-over',
          files: [],
          position: { x, y },
          message: '拖拽悬停'
        });
      }
    }

    // 左键释放 (button 0, action m)
    if (button === 0 && action === 'm') {
      if (this.isDragging) {
        this.isDragging = false;
        this.hideDragFeedback();
        this.checkForFilesAtPosition(x, y);
      }
    }

    // 右键或其他按钮 (取消拖拽)
    if (button !== 0) {
      if (this.isDragging) {
        this.isDragging = false;
        this.hideDragFeedback();
        this.emit('drag-leave', {
          type: 'drag-leave',
          files: [],
          position: { x, y },
          message: '拖拽已取消'
        });
      }
    }
  }

  private handleITerm2FileDrop(match: RegExpMatchArray): void {
    const [, action, fileName, content] = match;

    if (action === '1') { // 文件拖拽
      const tempPath = path.join(os.tmpdir(), `iterm-drop-${Date.now()}-${fileName}`);

      try {
        // 解码base64内容并写入临时文件
        const fileContent = Buffer.from(content, 'base64');
        fs.writeFileSync(tempPath, fileContent);

        const droppedFile: RealDroppedFile = {
          originalPath: fileName,
          fileName: path.basename(fileName),
          fileSize: fileContent.length,
          fileType: this.detectFileType(fileName),
          tempPath,
          isProcessed: false
        };

        this.detectedFiles = [droppedFile];
        this.processDroppedFiles();
      } catch (error) {
        this.emit('drag-error', {
          type: 'drag-error',
          files: [],
          message: `处理iTerm2拖拽失败: ${error instanceof Error ? error.message : '未知错误'}`
        });
      }
    }
  }

  private handleFileUrls(fileUrls: string[]): void {
    const files: RealDroppedFile[] = [];

    for (const fileUrl of fileUrls) {
      try {
        const filePath = this.normalizeFilePath(fileUrl);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);

          const droppedFile: RealDroppedFile = {
            originalPath: filePath,
            fileName: path.basename(filePath),
            fileSize: stats.size,
            fileType: this.detectFileType(filePath),
            isProcessed: false
          };

          files.push(droppedFile);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ 无法处理文件URL: ${fileUrl}`));
      }
    }

    if (files.length > 0) {
      this.detectedFiles = files;
      this.processDroppedFiles();
    }
  }

  private normalizeFilePath(fileUrl: string): string {
    return fileUrl
      .replace(/^file:\/\//, '')
      .replace(/^~/, os.homedir())
      .replace(/\\/g, '/');
  }

  private detectFileType(filePath: string): RealDroppedFile['fileType'] {
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
    const textExts = ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.log', '.csv', '.js', '.ts', '.py', '.java', '.cpp'];
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

  private showDragFeedback(x: number, y: number): void {
    if (!this.options.showVisualFeedback) return;

    // 保存当前光标位置
    process.stdout.write('\x1b[s');

    // 在拖拽位置显示视觉反馈
    process.stdout.write(`\x1b[${y};${x - 5}H`);
    process.stdout.write(chalk.cyan('📁 [拖拽区]'));

    // 恢复光标位置
    process.stdout.write('\x1b[u');
  }

  private hideDragFeedback(): void {
    if (!this.options.showVisualFeedback) return;

    // 清除拖拽反馈
    process.stdout.write(`\x1b[${this.dragPosition.y};${this.dragPosition.x - 5}H`);
    process.stdout.write('           ');
    process.stdout.write(`\x1b[${this.dragPosition.y};${this.dragPosition.x}H`);
  }

  private checkForFilesAtPosition(x: number, y: number): void {
    // 检查最近在监控目录中创建的文件
    this.checkRecentFiles();
  }

  private setupFileSystemFallback(): void {
    if (!this.options.enableFileSystemFallback) return;

    // 文件系统监控作为后备方案
    const checkInterval = setInterval(() => {
      if (this.isActive) {
        this.checkRecentFiles();
      } else {
        clearInterval(checkInterval);
      }
    }, 1000);
  }

  private checkRecentFiles(): void {
    const currentTime = Date.now();
    const timeWindow = this.options.detectionTimeout;
    const newFiles: RealDroppedFile[] = [];

    for (const directory of this.options.watchDirectories) {
      try {
        if (!fs.existsSync(directory)) continue;

        const files = fs.readdirSync(directory, { withFileTypes: true });

        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(directory, file.name);
            const stats = fs.statSync(filePath);
            const timeDiff = currentTime - stats.mtimeMs;

            // 检查是否是最近创建的文件
            if (timeDiff <= timeWindow && timeDiff >= 0) {
              // 过滤系统文件
              if (this.shouldIgnoreFile(file.name)) continue;

              const droppedFile: RealDroppedFile = {
                originalPath: filePath,
                fileName: file.name,
                fileSize: stats.size,
                fileType: this.detectFileType(filePath),
                isProcessed: false
              };

              newFiles.push(droppedFile);
            }
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
      }
    }

    if (newFiles.length > 0) {
      this.detectedFiles = newFiles;
      this.processDroppedFiles();
    }
  }

  private shouldIgnoreFile(fileName: string): boolean {
    // 过滤系统临时文件
    if (fileName.includes('claude-') ||
        fileName.includes('cwd') ||
        fileName.match(/^\d{13}-/) ||
        fileName.includes('temp') ||
        fileName.includes('tmp')) {
      return true;
    }

    // 过滤隐藏文件
    if (fileName.startsWith('.')) {
      return true;
    }

    return false;
  }

  private setupTerminalSpecificDetection(): void {
    if (!this.options.enableTerminalSpecific) return;

    // iTerm2特定设置
    if (this.terminalCapabilities.isITerm2) {
      // 启用iTerm2的Shell Integration
      process.stdout.write('\x1b]1337;SetUserVar=DRAG_DETECTION=1\x07');
    }
  }

  private async processDroppedFiles(): Promise<void> {
    if (this.detectedFiles.length === 0) return;

    this.emit('drop', {
      type: 'drop',
      files: this.detectedFiles,
      message: `检测到 ${this.detectedFiles.length} 个文件拖入`
    });

    // 处理文件附件
    const processedFiles = [];
    const spinner = ora({
      text: `处理拖拽文件 (0/${this.detectedFiles.length})`,
      color: 'blue'
    }).start();

    for (let i = 0; i < this.detectedFiles.length; i++) {
      const file = this.detectedFiles[i];
      spinner.text = `处理文件 (${i + 1}/${this.detectedFiles.length}): ${file.fileName}`;

      try {
        const filePath = file.tempPath || file.originalPath;

        // 调试信息
        console.log(chalk.magenta(`🔍 处理文件: ${filePath}`));
        console.log(chalk.magenta(`📊 文件大小: ${file.fileSize} bytes`));

        const attachment = await this.attachmentManager.addFromFile(filePath);

        if (attachment) {
          processedFiles.push(attachment);
          file.isProcessed = true;
          console.log(chalk.green(`✅ 成功添加附件: ${attachment.filename}`));
        } else {
          file.error = '无法添加为附件';
          console.log(chalk.red(`❌ 附件管理器返回null: ${file.fileName}`));
        }
      } catch (error) {
        file.error = error instanceof Error ? error.message : '处理失败';
        console.log(chalk.red(`❌ 处理文件失败: ${file.fileName}, 错误: ${file.error}`));
      }
    }

    spinner.stop();

    // 显示处理结果
    const successCount = processedFiles.length;
    const failCount = this.detectedFiles.length - successCount;

    console.log(chalk.green(`\n✅ 成功处理 ${successCount} 个文件`));
    if (failCount > 0) {
      console.log(chalk.yellow(`⚠️ ${failCount} 个文件处理失败`));
    }

    // 如果有文件成功处理，发出附件更新事件
    if (processedFiles.length > 0) {
      this.emit('attachments-updated', {
        type: 'attachments-updated',
        attachments: processedFiles,
        message: `成功添加 ${processedFiles.length} 个附件`
      });
    }

    // 清理临时文件
    for (const file of this.detectedFiles) {
      if (file.tempPath && file.tempPath !== file.originalPath) {
        try {
          fs.unlinkSync(file.tempPath);
        } catch (error) {
          // 忽略清理错误
        }
      }
    }

    // 清空检测的文件列表
    this.detectedFiles = [];
  }

  private cleanup(): void {
    try {
      // 禁用鼠标追踪
      if (this.terminalCapabilities.supportsMouse) {
        process.stdout.write('\x1b[?1003l');
        process.stdout.write('\x1b[?1006l');
        process.stdout.write('\x1b[?1000l');
      }

      // 恢复stdin设置
      if (typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
    } catch (error) {
      // 忽略清理错误
    }
  }

  public getStats(): {
    isActive: boolean;
    isDragging: boolean;
    detectedFilesCount: number;
    terminalCapabilities: any;
  } {
    return {
      isActive: this.isActive,
      isDragging: this.isDragging,
      detectedFilesCount: this.detectedFiles.length,
      terminalCapabilities: this.terminalCapabilities
    };
  }
}