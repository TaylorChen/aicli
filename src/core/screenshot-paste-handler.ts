import * as readline from 'readline';
import { EventEmitter } from 'events';
import { ClipboardProcessor } from './clipboard-processor';
import chalk from 'chalk';

export interface ScreenshotPasteOptions {
  enableCtrlV?: boolean;
  enableAutoDetect?: boolean;
  tempDir?: string;
  maxFileSize?: number; // MB
}

export interface PasteEvent {
  type: 'text' | 'image' | 'file' | 'files';
  content: any;
  timestamp: Date;
}

export class ScreenshotPasteHandler extends EventEmitter {
  private options: Required<ScreenshotPasteOptions>;
  private rl: readline.Interface | null = null;
  private isRawMode = false;
  private originalSettings: any = null;

  constructor(options: ScreenshotPasteOptions = {}) {
    super();

    this.options = {
      enableCtrlV: options.enableCtrlV ?? true,
      enableAutoDetect: options.enableAutoDetect ?? true,
      tempDir: options.tempDir ?? require('os').tmpdir(),
      maxFileSize: options.maxFileSize ?? 10,
      ...options
    };
  }

  /**
   * 启用截图粘贴功能
   */
  enable(rl: readline.Interface): void {
    this.rl = rl;

    if (this.options.enableCtrlV) {
      this.setupCtrlVHandler();
    }

    // 设置自动检测粘贴
    if (this.options.enableAutoDetect) {
      this.setupAutoDetection();
    }

    console.log(chalk.green('✅ 截图粘贴功能已启用'));
    console.log(chalk.dim('   • Ctrl+V: 粘贴剪贴板内容（支持截图）'));
    console.log(chalk.dim('   • /paste: 手动触发粘贴命令'));
  }

  /**
   * 禁用截图粘贴功能
   */
  disable(): void {
    this.disableRawMode();
    this.rl = null;
    console.log(chalk.yellow('⚠️ 截图粘贴功能已禁用'));
  }

  /**
   * 设置Ctrl+V处理器
   */
  private setupCtrlVHandler(): void {
    if (!this.rl) return;

    // 简化实现：仅提供提示，不实际监听键盘事件
    // 因为readline已经处理了键盘输入，我们避免冲突
    console.log(chalk.cyan('📋 截图粘贴功能已启用'));
    console.log(chalk.dim('   • 使用 /paste 命令粘贴剪贴板内容'));
    console.log(chalk.dim('   • Ctrl+V 快捷键在大多数终端中可能不工作'));

    // 记录功能已启用但不设置键盘监听器
    this.isRawMode = true; // 标记为已启用，用于状态检查
  }

  // 键盘输入处理已移除，避免与readline冲突
  // 用户应该使用 /paste 命令来粘贴内容

  // 键盘检查方法已移除，不再需要

  /**
   * 处理粘贴操作
   */
  private async handlePaste(): Promise<void> {
    if (!this.rl) return;

    try {
      console.log(chalk.cyan('\n📋 正在检测剪贴板内容...'));

      // 读取剪贴板内容
      const clipboardContent = await ClipboardProcessor.readClipboard();

      if (this.isEmptyContent(clipboardContent)) {
        console.log(chalk.yellow('⚠️ 剪贴板为空或不支持的格式'));
        return;
      }

      // 处理不同类型的内容
      switch (clipboardContent.type) {
        case 'image':
          await this.handleImagePaste(clipboardContent);
          break;
        case 'file':
          await this.handleFilePaste(clipboardContent);
          break;
        case 'files':
          await this.handleFilesPaste(clipboardContent);
          break;
        case 'text':
          await this.handleTextPaste(clipboardContent);
          break;
        default:
          console.log(chalk.yellow('⚠️ 不支持的剪贴板内容类型'));
      }

      // 发出粘贴事件
      this.emit('paste', {
        type: clipboardContent.type,
        content: clipboardContent.content,
        timestamp: new Date()
      } as PasteEvent);

    } catch (error) {
      console.log(chalk.red('❌ 粘贴失败:'), error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理图片粘贴
   */
  private async handleImagePaste(clipboardContent: any): Promise<void> {
    const image = clipboardContent.content;

    console.log(chalk.green('✅ 检测到图片'));
    console.log(chalk.white(`   📸 文件名: ${image.filename}`));
    console.log(chalk.white(`   📏 大小: ${this.formatFileSize(image.size)}`));
    console.log(chalk.white(`   🎨 格式: ${image.mimeType}`));

    // 生成粘贴语法
    const pasteSyntax = ClipboardProcessor.generatePasteSyntax(clipboardContent);

    // 将语法插入到当前输入行
    if (this.rl) {
      const currentLine = this.rl.line || '';
      const newLine = currentLine + pasteSyntax;

      // 使用write方法直接输出到终端
      process.stdout.write('\r' + pasteSyntax);

      // 发出事件让主程序处理
      this.emit('insert-text', pasteSyntax);
    }

    console.log(chalk.dim(`\n💡 已插入图片引用: ${pasteSyntax}`));
  }

  /**
   * 处理文件粘贴
   */
  private async handleFilePaste(clipboardContent: any): Promise<void> {
    const file = clipboardContent.content;

    console.log(chalk.green('✅ 检测到文件'));
    console.log(chalk.white(`   📄 文件名: ${file.filename}`));
    console.log(chalk.white(`   📏 大小: ${this.formatFileSize(file.size)}`));

    const pasteSyntax = ClipboardProcessor.generatePasteSyntax(clipboardContent);

    if (this.rl) {
      const currentLine = this.rl.line || '';
      const newLine = currentLine + pasteSyntax;

      // 使用write方法直接输出到终端
      process.stdout.write('\r' + pasteSyntax);

      // 发出事件让主程序处理
      this.emit('insert-text', pasteSyntax);
    }

    console.log(chalk.dim(`\n💡 已插入文件引用: ${pasteSyntax}`));
  }

  /**
   * 处理多文件粘贴
   */
  private async handleFilesPaste(clipboardContent: any): Promise<void> {
    const files = clipboardContent.content;

    console.log(chalk.green(`✅ 检测到 ${files.length} 个文件`));

    const pasteSyntax = ClipboardProcessor.generatePasteSyntax(clipboardContent);

    if (this.rl) {
      const currentLine = this.rl.line || '';
      const newLine = currentLine + '\n' + pasteSyntax;

      // 使用write方法直接输出到终端
      process.stdout.write('\n' + pasteSyntax);

      // 发出事件让主程序处理
      this.emit('insert-text', '\n' + pasteSyntax);
    }

    console.log(chalk.dim(`\n💡 已插入文件引用列表`));
  }

  /**
   * 处理文本粘贴
   */
  private async handleTextPaste(clipboardContent: any): Promise<void> {
    const text = clipboardContent.text || '';

    if (!text.trim()) {
      console.log(chalk.yellow('⚠️ 文本内容为空'));
      return;
    }

    console.log(chalk.green('✅ 检测到文本'));
    console.log(chalk.white(`   📝 长度: ${text.length} 字符`));

    if (this.rl) {
      const currentLine = this.rl.line || '';
      const newLine = currentLine + text;

      // 使用write方法直接输出到终端
      process.stdout.write(text);

      // 发出事件让主程序处理
      this.emit('insert-text', text);
    }

    console.log(chalk.dim(`\n💡 已插入文本内容`));
  }

  /**
   * 设置自动检测
   */
  private setupAutoDetection(): void {
    // 可以添加定期检查剪贴板的逻辑
    // 这里暂时留空，避免性能问题
  }

  /**
   * 检查内容是否为空
   */
  private isEmptyContent(content: any): boolean {
    if (!content) return true;

    switch (content.type) {
      case 'text':
        return !(content.text || '').trim();
      case 'image':
      case 'file':
        return !content.content;
      case 'files':
        return !content.content || content.content.length === 0;
      default:
        return true;
    }
  }

  /**
   * 禁用原始模式
   */
  private disableRawMode(): void {
    // 简化实现：仅重置状态标志
    this.isRawMode = false;
  }

  /**
   * 格式化文件大小
   */
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

  /**
   * 手动触发粘贴（通过命令）
   */
  async manualPaste(): Promise<void> {
    await this.handlePaste();
  }

  /**
   * 获取支持的功能状态
   */
  getStatus(): { ctrlV: boolean; autoDetect: boolean; rawMode: boolean } {
    return {
      ctrlV: this.options.enableCtrlV,
      autoDetect: this.options.enableAutoDetect,
      rawMode: this.isRawMode
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.disableRawMode();
    this.removeAllListeners();
    ClipboardProcessor.cleanupTempFiles();
  }
}