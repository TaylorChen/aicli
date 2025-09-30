import chalk from 'chalk';
import { FileProcessor } from './file-processor';
import { FileAttachment } from '../types';

export interface ParsedInput {
  text: string;
  attachments: FileAttachment[];
}

export class InputProcessor {
  private static readonly FILE_PATTERN = /@file\(([^)]+)\)/g;
  private static readonly IMAGE_PATTERN = /@image\(([^)]+)\)/g;
  private static readonly DRAG_DROP_PATTERN = /@([^(]+\.[^)\s]+)/g;
  private static readonly FILE_PATH_PATTERN = /\b([a-zA-Z]:\\[^\\|'"<>\s]+|\/[^\\|'"<>\s]+|\.\.?\/[^\\|'"<>\s]+|[^\\|'"<>\s]+\.[a-zA-Z0-9]+)\b/g;

  static async parseInput(input: string): Promise<ParsedInput> {
    const attachments: FileAttachment[] = [];
    let processedText = input;

    // 处理 @file() 语法
    processedText = await this.replacePattern(
      processedText,
      this.FILE_PATTERN,
      async (filePath) => {
        try {
          const attachment = await FileProcessor.processFile(filePath);
          attachments.push(attachment);
          return `\n\n📎 文件: ${attachment.filename}\n${FileProcessor.getFilePreview(attachment.content)}`;
        } catch (error) {
          return `\n\n❌ 文件处理失败: ${filePath} - ${error instanceof Error ? error.message : '未知错误'}`;
        }
      }
    );

    // 处理 @image() 语法
    processedText = await this.replacePattern(
      processedText,
      this.IMAGE_PATTERN,
      async (filePath) => {
        try {
          const attachment = await FileProcessor.processImage(filePath);
          attachments.push(attachment);
          return `\n\n🖼️ 图片: ${attachment.filename} (${(attachment.size! / 1024).toFixed(1)}KB)`;
        } catch (error) {
          return `\n\n❌ 图片处理失败: ${filePath} - ${error instanceof Error ? error.message : '未知错误'}`;
        }
      }
    );

    // 处理简化的拖拽语法 @filename.ext
    processedText = await this.replacePattern(
      processedText,
      this.DRAG_DROP_PATTERN,
      async (filePath) => {
        try {
          // 检查是否为图片文件
          if (this.isImageFile(filePath)) {
            const attachment = await FileProcessor.processImage(filePath);
            attachments.push(attachment);
            return `\n\n🖼️ 图片: ${attachment.filename} (${(attachment.size! / 1024).toFixed(1)}KB)`;
          } else {
            const attachment = await FileProcessor.processFile(filePath);
            attachments.push(attachment);
            return `\n\n📎 文件: ${attachment.filename}\n${FileProcessor.getFilePreview(attachment.content)}`;
          }
        } catch (error) {
          return `\n\n❌ 文件处理失败: ${filePath} - ${error instanceof Error ? error.message : '未知错误'}`;
        }
      }
    );

    // 处理直接粘贴的文件路径（只处理没有特殊语法的纯文件路径）
    processedText = await this.replacePattern(
      processedText,
      this.FILE_PATH_PATTERN,
      async (filePath) => {
        try {
          // 检查文件是否存在
          const fileExists = await FileProcessor.validateFilePath(filePath);
          if (fileExists) {
            // 检查是否已经被前面的语法处理过了（避免重复处理）
            const isAlreadyProcessed =
              processedText.includes(`@file(${filePath})`) ||
              processedText.includes(`@image(${filePath})`) ||
              processedText.includes(`@${filePath}`) ||
              this.looksLikeSpecialFileSyntax(processedText, filePath);

            if (!isAlreadyProcessed) {
              // 检查是否为图片文件
              if (this.isImageFile(filePath)) {
                const attachment = await FileProcessor.processImage(filePath);
                attachments.push(attachment);
                return `\n\n🖼️ 粘贴的图片: ${attachment.filename} (${(attachment.size! / 1024).toFixed(1)}KB)`;
              } else {
                const attachment = await FileProcessor.processFile(filePath);
                attachments.push(attachment);
                return `\n\n📎 粘贴的文件: ${attachment.filename}\n${FileProcessor.getFilePreview(attachment.content)}`;
              }
            }
          }
          return filePath; // 文件不存在或已处理，返回原路径
        } catch (error) {
          return filePath; // 处理失败，返回原路径
        }
      }
    );

    return {
      text: processedText.trim(),
      attachments
    };
  }

  private static looksLikeSpecialFileSyntax(text: string, filePath: string): boolean {
    // 检查文本中是否包含特殊文件语法
    const specialPatterns = [
      `@file(${filePath})`,
      `@image(${filePath})`,
      `@${filePath}`,
      `📎 文件: ${filePath}`,
      `🖼️ 图片: ${filePath}`,
      `📎 粘贴的文件: ${filePath}`,
      `🖼️ 粘贴的图片: ${filePath}`
    ];
    return specialPatterns.some(pattern => text.includes(pattern));
  }

  private static async replacePattern(
    text: string,
    pattern: RegExp,
    replacer: (match: string) => Promise<string>
  ): Promise<string> {
    const promises: Promise<{ match: string; replacement: string }>[] = [];
    const matches = [...text.matchAll(pattern)];

    for (const match of matches) {
      const filePath = match[1];
      promises.push(
        replacer(filePath).then(replacement => ({
          match: match[0],
          replacement
        }))
      );
    }

    const results = await Promise.all(promises);
    let result = text;

    for (const { match, replacement } of results) {
      result = result.replace(match, replacement);
    }

    return result;
  }

  private static isImageFile(filePath: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  }

  static showHelp(): void {
    console.log(chalk.cyan('\n📎 文件和图片输入帮助:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white('支持的语法:'));
    console.log(chalk.yellow('  @file(path/to/file.txt)     - 添加文件'));
    console.log(chalk.yellow('  @image(path/to/image.jpg)  - 添加图片'));
    console.log(chalk.yellow('  @filename.ext              - 快速添加文件/图片'));
    console.log('');
    console.log(chalk.white('示例:'));
    console.log(chalk.gray('  请分析这个文件: @file(src/app.js)'));
    console.log(chalk.gray('  这张图片有什么问题? @image(screenshot.png)'));
    console.log(chalk.gray('  查看 @package.json 的依赖配置'));
    console.log('');
    console.log(chalk.white('支持的文件格式:'));
    console.log(chalk.gray('  • 文本文件: .txt, .js, .ts, .py, .json, .md, .yaml, .xml 等'));
    console.log(chalk.gray('  • 图片文件: .jpg, .jpeg, .png, .gif, .webp, .bmp, .svg'));
    console.log('');
    console.log(chalk.white('限制:'));
    console.log(chalk.gray('  • 文件大小: 最大 10MB'));
    console.log(chalk.gray('  • 图片大小: 最大 5MB'));
    console.log('');
  }

  static validateInput(input: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查文件语法
    const fileMatches = input.match(this.FILE_PATTERN);
    if (fileMatches) {
      for (const match of fileMatches) {
        const filePath = match.match(/\(([^)]+)\)/)?.[1];
        if (filePath && !FileProcessor.validateFilePath(filePath)) {
          errors.push(`文件不存在: ${filePath}`);
        }
      }
    }

    // 检查图片语法
    const imageMatches = input.match(this.IMAGE_PATTERN);
    if (imageMatches) {
      for (const match of imageMatches) {
        const filePath = match.match(/\(([^)]+)\)/)?.[1];
        if (filePath && !FileProcessor.validateFilePath(filePath)) {
          errors.push(`图片不存在: ${filePath}`);
        }
      }
    }

    // 检查拖拽语法
    const dragMatches = input.match(this.DRAG_DROP_PATTERN);
    if (dragMatches) {
      for (const match of dragMatches) {
        const filePath = match.substring(1); // 移除 @ 符号
        if (!FileProcessor.validateFilePath(filePath)) {
          errors.push(`文件不存在: ${filePath}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}