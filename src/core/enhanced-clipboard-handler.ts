import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import { FileAttachment } from './terminal-file-uploader';

export interface ClipboardHandlerOptions {
  enableImagePaste?: boolean;
  enableFilePathPaste?: boolean;
  tempDir?: string;
  maxImageSize?: number;
  supportedFormats?: string[];
}

export class EnhancedClipboardHandler extends EventEmitter {
  private options: Required<ClipboardHandlerOptions>;
  private tempDir: string;

  constructor(options: ClipboardHandlerOptions = {}) {
    super();

    this.options = {
      enableImagePaste: options.enableImagePaste !== false,
      enableFilePathPaste: options.enableFilePathPaste !== false,
      tempDir: options.tempDir || path.join(os.tmpdir(), 'aicli-clipboard'),
      maxImageSize: options.maxImageSize || 10 * 1024 * 1024, // 10MB
      supportedFormats: options.supportedFormats || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    };

    this.tempDir = this.options.tempDir;
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async handlePaste(): Promise<FileAttachment | null> {
    console.log(chalk.blue('📋 处理剪贴板内容...'));

    try {
      // 首先尝试获取图片
      if (this.options.enableImagePaste) {
        const imageAttachment = await this.handleImagePaste();
        if (imageAttachment) {
          return imageAttachment;
        }
      }

      // 然后尝试获取文件路径
      if (this.options.enableFilePathPaste) {
        const fileAttachment = await this.handleFilePathPaste();
        if (fileAttachment) {
          return fileAttachment;
        }
      }

      // 最后尝试获取文本
      const textAttachment = await this.handleTextPaste();
      if (textAttachment) {
        return textAttachment;
      }

      console.log(chalk.yellow('⚠ 剪贴板中没有可处理的内容'));
      return null;

    } catch (error) {
      console.log(chalk.red(`❌ 处理剪贴板失败: ${error instanceof Error ? error.message : '未知错误'}`));
      return null;
    }
  }

  private async handleImagePaste(): Promise<FileAttachment | null> {
    const platform = process.platform;

    try {
      let imagePath: string | null = null;

      if (platform === 'darwin') {
        // macOS
        imagePath = await this.getImageFromMacOS();
      } else if (platform === 'win32') {
        // Windows
        imagePath = await this.getImageFromWindows();
      } else if (platform === 'linux') {
        // Linux
        imagePath = await this.getImageFromLinux();
      }

      if (imagePath && fs.existsSync(imagePath)) {
        const stats = fs.statSync(imagePath);

        if (stats.size > this.options.maxImageSize) {
          console.log(chalk.yellow(`⚠ 图片太大 (${this.formatFileSize(stats.size)})，跳过处理`));
          return null;
        }

        const content = fs.readFileSync(imagePath);
        const filename = `clipboard-${Date.now()}.${this.getImageFormat(imagePath)}`;

        const attachment: FileAttachment = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          filename,
          originalPath: imagePath,
          size: stats.size,
          mimeType: this.getImageMimeType(imagePath),
          type: 'image',
          content
        };

        console.log(chalk.green(`✅ 已从剪贴板获取图片: ${filename}`));
        this.emit('imagePasted', attachment);

        return attachment;
      }

    } catch (error) {
      // 忽略图片获取错误，继续尝试其他方式
    }

    return null;
  }

  private async getImageFromMacOS(): Promise<string | null> {
    return new Promise((resolve) => {
      const tempPath = path.join(this.tempDir, `mac-paste-${Date.now()}.png`);

      const script = `
        tell application "System Events"
          set theClipboard to the clipboard as «class PNGf»
        end tell
        tell application "Finder"
          set theFile to (path to desktop as text) & "clipboard-image.png"
          write theClipboard to file theFile
        end tell
      `;

      exec(`osascript -e '${script}' && mv ~/Desktop/clipboard-image.png "${tempPath}"`, (error) => {
        if (error) {
          // 尝试另一种方法
          exec(`pngpaste "${tempPath}"`, (error2) => {
            if (error2) {
              resolve(null);
            } else {
              resolve(tempPath);
            }
          });
        } else {
          resolve(tempPath);
        }
      });
    });
  }

  private async getImageFromWindows(): Promise<string | null> {
    return new Promise((resolve) => {
      const tempPath = path.join(this.tempDir, `win-paste-${Date.now()}.png`);

      // 使用 PowerShell 获取剪贴板图片
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          $image = [System.Windows.Forms.Clipboard]::GetImage()
          $image.Save("${tempPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
          Write-Output "SUCCESS"
        }
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout) => {
        if (!error && stdout.trim() === 'SUCCESS') {
          resolve(tempPath);
        } else {
          resolve(null);
        }
      });
    });
  }

  private async getImageFromLinux(): Promise<string | null> {
    return new Promise((resolve) => {
      const tempPath = path.join(this.tempDir, `linux-paste-${Date.now()}.png`);

      // 尝试使用 xclip
      exec(`xclip -selection clipboard -t image/png -o > "${tempPath}"`, (error) => {
        if (!error && fs.existsSync(tempPath)) {
          const stats = fs.statSync(tempPath);
          if (stats.size > 0) {
            resolve(tempPath);
            return;
          }
        }

        // 尝试使用 wl-paste (Wayland)
        exec(`wl-paste --type image/png > "${tempPath}"`, (error2) => {
          if (!error2 && fs.existsSync(tempPath)) {
            const stats = fs.statSync(tempPath);
            if (stats.size > 0) {
              resolve(tempPath);
              return;
            }
          }

          resolve(null);
        });
      });
    });
  }

  private async handleFilePathPaste(): Promise<FileAttachment | null> {
    return new Promise((resolve) => {
      const platform = process.platform;

      let command = '';
      if (platform === 'darwin') {
        command = 'pbpaste';
      } else if (platform === 'win32') {
        command = 'powershell -command "Get-Clipboard"';
      } else {
        command = 'xclip -selection clipboard -o';
      }

      exec(command, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const text = stdout.trim();
        const filePaths = this.extractFilePaths(text);

        if (filePaths.length > 0) {
          // 处理第一个有效文件路径
          const filePath = filePaths[0];

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            try {
              const stats = fs.statSync(filePath);
              const content = fs.readFileSync(filePath);

              const attachment: FileAttachment = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                filename: path.basename(filePath),
                originalPath: filePath,
                size: stats.size,
                mimeType: this.getMimeType(filePath),
                type: this.getFileType(filePath),
                content
              };

              console.log(chalk.green(`✅ 已从剪贴板获取文件: ${attachment.filename}`));
              this.emit('filePasted', attachment);
              resolve(attachment);
              return;
            } catch (fileError) {
              // 忽略文件读取错误
            }
          }
        }

        resolve(null);
      });
    });
  }

  private extractFilePaths(text: string): string[] {
    const filePaths: string[] = [];

    // 匹配各种文件路径格式
    const patterns = [
      // Unix/Linux/Mac 路径
      /(?:^|\s)(\/[^\s]+)/g,
      // Windows 路径
      /(?:^|\s)([A-Za-z]:[\\\/][^\s]+)/g,
      // file:// 协议
      /file:\/\/([^\s]+)/g,
      // 相对路径 (包含文件扩展名)
      /(?:^|\s)(\.[^\s]*\.[a-zA-Z0-9]+)/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const filePath = match[1] || match[0];
        const cleanPath = filePath.trim();

        if (cleanPath && !filePaths.includes(cleanPath)) {
          filePaths.push(cleanPath);
        }
      }
    }

    return filePaths;
  }

  private async handleTextPaste(): Promise<FileAttachment | null> {
    return new Promise((resolve) => {
      const platform = process.platform;

      let command = '';
      if (platform === 'darwin') {
        command = 'pbpaste';
      } else if (platform === 'win32') {
        command = 'powershell -command "Get-Clipboard"';
      } else {
        command = 'xclip -selection clipboard -o';
      }

      exec(command, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const text = stdout.trim();

        if (text && text.length > 0 && text.length < 100000) { // 限制文本长度
          const attachment: FileAttachment = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filename: `clipboard-${Date.now()}.txt`,
            originalPath: 'clipboard://text',
            size: Buffer.byteLength(text, 'utf8'),
            mimeType: 'text/plain',
            type: 'text',
            content: Buffer.from(text, 'utf8')
          };

          console.log(chalk.green(`✅ 已从剪贴板获取文本 (${text.length} 字符)`));
          this.emit('textPasted', attachment);
          resolve(attachment);
        } else {
          resolve(null);
        }
      });
    });
  }

  private getImageFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return ext.slice(1) || 'png';
  }

  private getImageMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/png';
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private getFileType(filePath: string): FileAttachment['type'] {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
    const textExts = ['.txt', '.md', '.js', '.ts', '.json', '.xml'];
    const documentExts = ['.pdf', '.doc', '.docx'];

    if (imageExts.includes(ext)) return 'image';
    if (textExts.includes(ext)) return 'text';
    if (documentExts.includes(ext)) return 'document';
    return 'binary';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  public cleanup(): void {
    // 清理临时文件
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            // 忽略删除错误
          }
        }
      }
    } catch (error) {
      // 忽略清理错误
    }
  }
}