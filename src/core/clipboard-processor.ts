import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import clipboard from 'clipboardy';
import { FileAttachment } from '../types';
import { FileProcessor } from './file-processor';
import chalk from 'chalk';

export interface ClipboardContent {
  type: 'text' | 'file' | 'image' | 'files' | 'unknown';
  content: string | FileAttachment | FileAttachment[];
  text?: string;
}

export class ClipboardProcessor {
  private static readonly SUPPORTED_IMAGE_FORMATS = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp'
  ];

  private static readonly MAX_CLIPBOARD_SIZE = 10 * 1024 * 1024; // 10MB

  static async readClipboard(): Promise<ClipboardContent> {
    try {
      const clipboardContent = await (clipboard as any).read();

      // 清理内容：去除首尾空白字符
      const cleanedContent = clipboardContent.trim();

      // 首先尝试解析为图片（检查是否为base64图片数据）
      const imageResult = await this.tryParseAsImage(cleanedContent);
      if (imageResult) {
        return imageResult;
      }

      // 然后尝试解析为文件路径（可能是复制粘贴的文件路径）
      const fileResult = await this.tryParseAsFile(cleanedContent);
      if (fileResult) {
        return fileResult;
      }

      // 尝试解析为多个文件（检查是否为多行文件路径）
      const filesResult = await this.tryParseAsFiles(cleanedContent);
      if (filesResult) {
        return filesResult;
      }

      // 默认作为文本处理
      return {
        type: 'text',
        content: cleanedContent,
        text: cleanedContent
      };

    } catch (error) {
      console.warn(chalk.yellow('⚠️ 读取剪贴板失败:', error instanceof Error ? error.message : '未知错误'));
      return {
        type: 'text',
        content: '',
        text: ''
      };
    }
  }

  private static async tryParseAsFile(content: string): Promise<ClipboardContent | null> {
    // 清理内容并检查是否为文件路径
    const cleanedContent = content.trim().replace(/['"]/g, '');

    // 检查是否为绝对路径或相对路径
    if (this.looksLikeFilePath(cleanedContent)) {
      try {
        const attachment = await FileProcessor.processFile(cleanedContent);
        return {
          type: 'file',
          content: attachment,
          text: `📎 粘贴的文件: ${attachment.filename}`
        };
      } catch (error) {
        // 不是有效文件，继续尝试其他类型
      }
    }
    return null;
  }

  private static async tryParseAsImage(content: string): Promise<ClipboardContent | null> {
    // 检查是否为base64图片数据
    const base64ImagePattern = /^data:image\/([a-zA-Z+]+);base64,([A-Za-z0-9+/=]+)$/;
    const match = content.match(base64ImagePattern);

    if (match) {
      const mimeType = `image/${match[1]}`;
      const base64Data = match[2];

      if (this.SUPPORTED_IMAGE_FORMATS.includes(mimeType)) {
        try {
          // 创建临时文件
          const tempDir = path.join(os.tmpdir(), 'aicli-clipboard');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const extension = this.getImageExtension(mimeType);
          const tempFileName = `pasted-image-${Date.now()}${extension}`;
          const tempFilePath = path.join(tempDir, tempFileName);

          // 解码base64并保存到临时文件
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(tempFilePath, buffer);

          const attachment: FileAttachment = {
            type: 'image',
            filename: tempFileName,
            content: buffer,
            mimeType: mimeType,
            size: buffer.length
          };

          return {
            type: 'image',
            content: attachment,
            text: `🖼️ 粘贴的图片: ${tempFileName}`
          };
        } catch (error) {
          console.warn(chalk.yellow('⚠️ 处理图片数据失败:', error instanceof Error ? error.message : '未知错误'));
        }
      }
    }
    return null;
  }

  private static async tryParseAsFiles(content: string): Promise<ClipboardContent | null> {
    // 尝试按行分割，检查是否为多个文件路径
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length > 1) {
      const attachments: FileAttachment[] = [];
      let validFilesCount = 0;

      for (const line of lines) {
        const cleanedLine = line.trim().replace(/['"]/g, '');
        if (this.looksLikeFilePath(cleanedLine)) {
          try {
            const attachment = await FileProcessor.processFile(cleanedLine);
            attachments.push(attachment);
            validFilesCount++;
          } catch (error) {
            // 忽略无效文件
          }
        }
      }

      if (validFilesCount > 1) {
        return {
          type: 'files',
          content: attachments,
          text: `📎 粘贴了 ${validFilesCount} 个文件`
        };
      }
    }
    return null;
  }

  private static looksLikeFilePath(content: string): boolean {
    // 检查是否看起来像文件路径
    const patterns = [
      /^[a-zA-Z]:\\/, // Windows路径
      /^\/[^\/]/, // Unix绝对路径
      /^[^\/\\]+\.[a-zA-Z0-9]+$/, // 相对路径文件名
      /^\.\.?[\/\\]/, // 相对路径
      /^[^\/\\]+[\/\\][^\/\\]+/ // 包含路径分隔符
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  private static getImageExtension(mimeType: string): string {
    const extensions: { [key: string]: string } = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp'
    };

    return extensions[mimeType] || '.png';
  }

  static async handlePasteCommand(): Promise<ClipboardContent | null> {
    console.log(chalk.cyan('📋 正在读取剪贴板内容...'));

    const content = await this.readClipboard();

    switch (content.type) {
      case 'file':
        console.log(chalk.green('✅ 检测到文件粘贴'));
        console.log(chalk.white(`📄 文件名: ${(content.content as FileAttachment).filename}`));
        break;
      case 'image':
        console.log(chalk.green('✅ 检测到图片粘贴'));
        console.log(chalk.white(`🖼️ 图片: ${(content.content as FileAttachment).filename}`));
        break;
      case 'files':
        console.log(chalk.green('✅ 检测到多个文件粘贴'));
        console.log(chalk.white(`📎 文件数量: ${(content.content as FileAttachment[]).length}`));
        break;
      case 'text':
        if ((content.text || '').trim()) {
          console.log(chalk.green('✅ 检测到文本粘贴'));
          console.log(chalk.white(`📝 文本长度: ${(content.text || '').length} 字符`));
        } else {
          console.log(chalk.yellow('⚠️ 剪贴板为空或内容不支持'));
          return null;
        }
        break;
    }

    return content;
  }

  static generatePasteSyntax(content: ClipboardContent): string {
    switch (content.type) {
      case 'file':
        const fileAttachment = content.content as FileAttachment;
        return `@file(${fileAttachment.filename})`;

      case 'image':
        const imageAttachment = content.content as FileAttachment;
        return `@image(${imageAttachment.filename})`;

      case 'files':
        const fileAttachments = content.content as FileAttachment[];
        return fileAttachments.map(att => `@file(${att.filename})`).join('\n');

      case 'text':
        return content.text || '';

      default:
        return '';
    }
  }

  static cleanupTempFiles(): void {
    try {
      // tempy会在适当的时候自动清理临时文件
      // 这里可以添加额外的清理逻辑如果需要
    } catch (error) {
      console.warn(chalk.yellow('⚠️ 清理临时文件失败:', error instanceof Error ? error.message : '未知错误'));
    }
  }
}