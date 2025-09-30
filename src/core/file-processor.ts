import * as fs from 'fs';
import * as path from 'path';
import * as mimeTypes from 'mime-types';
import chalk from 'chalk';
import { FileAttachment } from '../types';

export class FileProcessor {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly SUPPORTED_IMAGE_FORMATS = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml'
  ];

  static async processFile(filePath: string): Promise<FileAttachment> {
    try {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const stats = fs.statSync(resolvedPath);
      const fileSize = stats.size;

      if (fileSize > this.MAX_FILE_SIZE) {
        throw new Error(`文件太大 (${(fileSize / 1024 / 1024).toFixed(2)}MB)，最大支持 ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      const content = fs.readFileSync(resolvedPath);
      const filename = path.basename(resolvedPath);
      const mimeTypesValue = mimeTypes.lookup(filename) || 'application/octet-stream';

      return {
        type: 'file',
        filename,
        content,
        mimeType: mimeTypesValue,
        size: fileSize
      };
    } catch (error) {
      throw new Error(`处理文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  static async processImage(filePath: string): Promise<FileAttachment> {
    try {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`图片不存在: ${filePath}`);
      }

      const stats = fs.statSync(resolvedPath);
      const fileSize = stats.size;

      if (fileSize > this.MAX_IMAGE_SIZE) {
        throw new Error(`图片太大 (${(fileSize / 1024 / 1024).toFixed(2)}MB)，最大支持 ${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      }

      const content = fs.readFileSync(resolvedPath);
      const filename = path.basename(resolvedPath);
      const mimeTypesValue = mimeTypes.lookup(filename) || 'application/octet-stream';

      if (!mimeTypesValue.startsWith('image/')) {
        throw new Error(`文件不是图片格式: ${mimeTypesValue}`);
      }

      if (!this.SUPPORTED_IMAGE_FORMATS.includes(mimeTypesValue)) {
        throw new Error(`不支持的图片格式: ${mimeTypesValue}`);
      }

      return {
        type: 'image',
        filename,
        content,
        mimeType: mimeTypesValue,
        size: fileSize
      };
    } catch (error) {
      throw new Error(`处理图片失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  static formatFileInfo(attachment: FileAttachment): string {
    const sizeStr = attachment.size ? `${(attachment.size / 1024).toFixed(1)}KB` : '未知大小';
    const typeIcon = attachment.type === 'image' ? '🖼️' : '📄';

    return `${typeIcon} ${attachment.filename} (${sizeStr})`;
  }

  static getFilePreview(content: string | Buffer, maxLength: number = 500): string {
    let text: string;

    if (Buffer.isBuffer(content)) {
      // 尝试检测是否为文本文件
      try {
        text = content.toString('utf-8');
        // 如果包含太多非ASCII字符，可能是二进制文件
        const nonAsciiRatio = (text.match(/[^\x00-\x7F]/g) || []).length / text.length;
        if (nonAsciiRatio > 0.3) {
          return '[二进制文件内容]';
        }
      } catch {
        return '[二进制文件内容]';
      }
    } else {
      text = content;
    }

    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '...\n[文件内容已截断]';
  }

  static validateFilePath(filePath: string): boolean {
    try {
      const resolvedPath = path.resolve(filePath);
      return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
    } catch {
      return false;
    }
  }

  static getImageBase64(content: Buffer): string {
    return content.toString('base64');
  }

  static async extractTextFromFile(filePath: string): Promise<string> {
    try {
      const attachment = await this.processFile(filePath);
      return this.getFilePreview(attachment.content, 2000);
    } catch (error) {
      return `无法读取文件内容: ${error instanceof Error ? error.message : '未知错误'}`;
    }
  }
}