import * as path from 'path';
import chalk from 'chalk';
import { DroppedFile } from './terminal-drag-detector';

export interface DragDisplayOptions {
  showFileIcons?: boolean;
  showFileSize?: boolean;
  showFileType?: boolean;
  showProgress?: boolean;
  maxPreviewLength?: number;
  colorScheme?: 'default' | 'blue' | 'green' | 'purple';
  compact?: boolean;
}

export class DragDisplay {
  private options: Required<DragDisplayOptions>;

  constructor(options: DragDisplayOptions = {}) {
    this.options = {
      showFileIcons: options.showFileIcons !== false,
      showFileSize: options.showFileSize !== false,
      showFileType: options.showFileType !== false,
      showProgress: options.showProgress !== false,
      maxPreviewLength: options.maxPreviewLength || 50,
      colorScheme: options.colorScheme || 'default',
      compact: options.compact || false
    };
  }

  public renderDragStart(files: DroppedFile[]): string {
    if (files.length === 0) return '';

    const lines: string[] = [];

    if (!this.options.compact) {
      lines.push('');
      lines.push(chalk.gray('┌' + '─'.repeat(60) + '┐'));
      lines.push(chalk.gray('│') + chalk.cyan.bold(' 📋 检测到文件拖入 ') + ' '.repeat(42) + chalk.gray('│'));
      lines.push(chalk.gray('├' + '─'.repeat(60) + '┤'));
    }

    files.forEach((file, index) => {
      const fileIcon = this.getFileIcon(file.fileType);
      const fileName = this.truncateFileName(file.fileName);
      const fileSize = this.options.showFileSize ? ` (${this.formatFileSize(file.fileSize)})` : '';
      const fileType = this.options.showFileType ? ` ${this.getFileTypeLabel(file.fileType)}` : '';

      let line = '';
      if (!this.options.compact) {
        line = chalk.gray('│') + ` ${fileIcon} ${chalk.white(fileName)}${chalk.gray(fileSize)}${chalk.cyan(fileType)}`;
        // 填充到固定宽度
        const remaining = 60 - this.stripAnsi(line).length - 1;
        line += ' '.repeat(Math.max(0, remaining)) + chalk.gray('│');
      } else {
        line = `${fileIcon} ${chalk.white(fileName)}${chalk.gray(fileSize)}${chalk.cyan(fileType)}`;
      }

      lines.push(line);
    });

    if (!this.options.compact) {
      lines.push(chalk.gray('└' + '─'.repeat(60) + '┘'));
      lines.push('');
    }

    return lines.join('\n');
  }

  public renderDragProgress(current: number, total: number, currentFile?: string): string {
    if (!this.options.showProgress) return '';

    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage, 30);

    let message = `\n📁 处理拖拽文件 ${current}/${total}`;
    if (currentFile) {
      message += `: ${chalk.cyan(this.truncateFileName(currentFile, 40))}`;
    }
    message += `\n   ${progressBar} ${percentage}%\n`;

    return message;
  }

  public renderDragComplete(files: DroppedFile[], errors: string[] = []): string {
    const lines: string[] = [];

    if (!this.options.compact) {
      lines.push('');
      lines.push(chalk.gray('┌' + '─'.repeat(60) + '┐'));
    }

    const successCount = files.filter(f => !f.error).length;
    const errorCount = files.filter(f => f.error).length;

    let summaryLine = '';
    if (!this.options.compact) {
      summaryLine = chalk.gray('│') + ' ';
    }

    if (errorCount === 0) {
      summaryLine += chalk.green.bold(`✅ 成功添加 ${successCount} 个文件`);
    } else if (successCount > 0) {
      summaryLine += chalk.yellow.bold(`⚠️ 添加了 ${successCount} 个文件，${errorCount} 个失败`);
    } else {
      summaryLine += chalk.red.bold(`❌ 所有 ${errorCount} 个文件都添加失败`);
    }

    if (!this.options.compact) {
      summaryLine += ' '.repeat(60 - this.stripAnsi(summaryLine).length - 1) + chalk.gray('│');
      lines.push(summaryLine);
      lines.push(chalk.gray('├' + '─'.repeat(60) + '┤'));
    } else {
      lines.push(summaryLine);
    }

    // 显示文件详情
    files.forEach((file, index) => {
      if (file.error) {
        let errorLine = '';
        if (!this.options.compact) {
          errorLine = chalk.gray('│') + `   ❌ ${chalk.red(file.fileName)}: ${chalk.gray(file.error)}`;
          const remaining = 60 - this.stripAnsi(errorLine).length - 1;
          errorLine += ' '.repeat(Math.max(0, remaining)) + chalk.gray('│');
        } else {
          errorLine = `   ❌ ${chalk.red(file.fileName)}: ${chalk.gray(file.error)}`;
        }
        lines.push(errorLine);
      } else {
        const fileIcon = this.getFileIcon(file.fileType);
        const fileName = this.truncateFileName(file.fileName);
        const fileSize = this.options.showFileSize ? ` (${this.formatFileSize(file.fileSize)})` : '';

        let successLine = '';
        if (!this.options.compact) {
          successLine = chalk.gray('│') + `   ${fileIcon} ${chalk.green(fileName)}${chalk.gray(fileSize)}`;
          const remaining = 60 - this.stripAnsi(successLine).length - 1;
          successLine += ' '.repeat(Math.max(0, remaining)) + chalk.gray('│');
        } else {
          successLine = `   ${fileIcon} ${chalk.green(fileName)}${chalk.gray(fileSize)}`;
        }
        lines.push(successLine);
      }
    });

    if (!this.options.compact) {
      lines.push(chalk.gray('└' + '─'.repeat(60) + '┘'));
    }

    // 显示提示信息
    if (successCount > 0) {
      lines.push('');
      lines.push(chalk.cyan(`💡 当前共有 ${successCount} 个附件，输入 /attachments 查看`));
    }

    return lines.join('\n');
  }

  public renderFilePreview(file: DroppedFile): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.gray('┌' + '─'.repeat(70) + '┐'));
    lines.push(chalk.gray('│') + chalk.cyan.bold(' 📄 文件预览 ') + ' '.repeat(55) + chalk.gray('│'));
    lines.push(chalk.gray('├' + '─'.repeat(70) + '┤'));

    // 文件基本信息
    const fileIcon = this.getFileIcon(file.fileType);
    lines.push(chalk.gray('│') + ` ${fileIcon} ${chalk.white.bold(file.fileName)}`);
    lines.push(chalk.gray('│') + ` 📊 大小: ${chalk.cyan(this.formatFileSize(file.fileSize))}`);
    lines.push(chalk.gray('│') + ` 📁 类型: ${chalk.cyan(this.getFileTypeLabel(file.fileType))}`);

    if (file.mimeType) {
      lines.push(chalk.gray('│') + ` 🏷️  MIME: ${chalk.cyan(file.mimeType)}`);
    }

    if (file.originalPath !== file.fileName) {
      lines.push(chalk.gray('│') + ` 📍 路径: ${chalk.gray(file.originalPath)}`);
    }

    lines.push(chalk.gray('├' + '─'.repeat(70) + '┤'));

    // 文件状态
    if (file.error) {
      lines.push(chalk.gray('│') + ` ❌ 状态: ${chalk.red(file.error)}`);
    } else if (file.isProcessed) {
      lines.push(chalk.gray('│') + ` ✅ 状态: ${chalk.green('已处理并添加到附件列表')}`);
    } else {
      lines.push(chalk.gray('│') + ` ⏳ 状态: ${chalk.yellow('正在处理...')}`);
    }

    lines.push(chalk.gray('└' + '─'.repeat(70) + '┘'));

    return lines.join('\n');
  }

  public renderAttachmentSummary(totalFiles: number, totalSize: number): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.gray('┌' + '─'.repeat(50) + '┐'));
    lines.push(chalk.gray('│') + chalk.cyan.bold(' 📎 附件总览 ') + ' '.repeat(36) + chalk.gray('│'));
    lines.push(chalk.gray('├' + '─'.repeat(50) + '┤'));
    lines.push(chalk.gray('│') + ` 📁 文件数量: ${chalk.white.bold(totalFiles.toString())}` + ' '.repeat(28) + chalk.gray('│'));
    lines.push(chalk.gray('│') + ` 💾 总大小: ${chalk.white.bold(this.formatFileSize(totalSize))}` + ' '.repeat(31) + chalk.gray('│'));
    lines.push(chalk.gray('└' + '─'.repeat(50) + '┘'));

    return lines.join('\n');
  }

  private getFileIcon(fileType: DroppedFile['fileType']): string {
    const icons = {
      image: '🖼️',
      document: '📄',
      text: '📝',
      binary: '💾',
      unknown: '📎'
    };

    return icons[fileType] || icons.unknown;
  }

  private getFileTypeLabel(fileType: DroppedFile['fileType']): string {
    const labels = {
      image: '图片',
      document: '文档',
      text: '文本',
      binary: '二进制',
      unknown: '未知'
    };

    return labels[fileType] || labels.unknown;
  }

  private truncateFileName(fileName: string, maxLength: number = 45): string {
    if (fileName.length <= maxLength) {
      return fileName;
    }

    const ext = path.extname(fileName);
    const nameWithoutExt = path.basename(fileName, ext);
    const maxNameLength = maxLength - ext.length - 3; // 3 for "..."

    if (nameWithoutExt.length <= maxNameLength) {
      return fileName;
    }

    return nameWithoutExt.substring(0, maxNameLength) + '...' + ext;
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

  private createProgressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    let progressBar = '';
    for (let i = 0; i < filled; i++) {
      progressBar += '█';
    }
    for (let i = 0; i < empty; i++) {
      progressBar += '░';
    }

    return progressBar;
  }

  private stripAnsi(text: string): string {
    // 移除 ANSI 颜色代码，用于计算显示宽度
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // 设置方法
  public setOptions(options: Partial<DragDisplayOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public getOptions(): DragDisplayOptions {
    return { ...this.options };
  }
}