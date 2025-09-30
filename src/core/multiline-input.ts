import { EventEmitter } from 'events';
import * as readline from 'readline';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export interface MultilineInputOptions {
  enableFileDrop?: boolean;
  maxLines?: number;
  indentSize?: number;
  enableSyntaxHighlight?: boolean;
  editorPrompt?: string;
}

export interface InputSession {
  id: string;
  content: string;
  lines: string[];
  startTime: Date;
  isComplete: boolean;
}

export interface FileDrop {
  filePath: string;
  content: string;
  size: number;
  mimeType: string;
  timestamp: Date;
}

export class MultilineInputProcessor extends EventEmitter {
  private options: Required<MultilineInputOptions>;
  private isEditing = false;
  private currentSession: InputSession | null = null;
  private inputHistory: InputSession[] = [];
  private fileDropEnabled = false;

  constructor(options: MultilineInputOptions = {}) {
    super();

    this.options = {
      enableFileDrop: options.enableFileDrop ?? true,
      maxLines: options.maxLines ?? 1000,
      indentSize: options.indentSize ?? 2,
      enableSyntaxHighlight: options.enableSyntaxHighlight ?? true,
      editorPrompt: options.editorPrompt || '✏️  编辑模式',
      ...options
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 处理窗口大小变化
    process.stdout.on('resize', () => {
      if (this.isEditing) {
        this.renderEditor();
      }
    });
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async startEditor(): Promise<string> {
    if (this.isEditing) {
      throw new Error('已经在编辑模式中');
    }

    this.isEditing = true;
    this.currentSession = {
      id: this.generateSessionId(),
      content: '',
      lines: [],
      startTime: new Date(),
      isComplete: false
    };

    return new Promise((resolve, reject) => {
      this.setupEditorInterface(resolve);
    });
  }

  private setupEditorInterface(resolve: Function): void {
    // 清屏并显示编辑器界面
    this.renderEditor();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    rl.prompt();

    rl.on('line', (input) => {
      this.handleEditorInput(input, rl, resolve);
    });

    rl.on('SIGINT', () => {
      this.cancelEditor(rl, resolve);
    });

    // 存储 readline 实例以便后续使用
    (this as any).editorRl = rl;
  }

  private renderEditor(): void {
    if (!this.isEditing || !this.currentSession) return;

    // 清屏
    process.stdout.write('\x1b[2J\x1b[H');

    // 获取终端尺寸
    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 24;

    // 显示编辑器标题栏（带渐变效果）
    const title = chalk.bold.blue(`📝 ${this.options.editorPrompt}`);
    const sessionInfo = chalk.gray(`会话: ${this.currentSession.id.slice(-8)}`);
    const timeInfo = chalk.gray(new Date().toLocaleTimeString('zh-CN'));
    const modeInfo = this.currentSession.lines.length > 0 ? chalk.yellow('编辑中') : chalk.green('就绪');

    // 创建动态标题栏
    const titlePadding = Math.max(0, terminalWidth - title.length - sessionInfo.length - timeInfo.length - modeInfo.length - 6);
    const titleBar = title + ' '.repeat(titlePadding) + sessionInfo + ' ' + timeInfo + ' ' + modeInfo;

    process.stdout.write(titleBar + '\n');
    process.stdout.write(chalk.blue('═'.repeat(terminalWidth)) + '\n');

    // 显示快捷键帮助（顶部）- 更现代的设计
    const shortcuts = [
      chalk.cyan.bold('Esc'),
      chalk.gray('退出'),
      chalk.cyan.bold('Ctrl+S'),
      chalk.gray('提交'),
      chalk.cyan.bold('Ctrl+C'),
      chalk.gray('取消'),
      chalk.cyan.bold('"""'),
      chalk.gray('结束'),
      chalk.cyan.bold('/help'),
      chalk.gray('帮助')
    ];

    const shortcutsText = shortcuts.join(' ');
    const shortcutsPadding = Math.max(0, terminalWidth - shortcutsText.length - 4);
    process.stdout.write(chalk.gray('│ ') + shortcutsText + ' '.repeat(shortcutsPadding) + chalk.gray(' │') + '\n');
    process.stdout.write(chalk.blue('─'.repeat(terminalWidth)) + '\n\n');

    // 显示当前内容区域（带语法高亮）
    const contentHeight = Math.max(10, terminalHeight - 8);
    const displayLines = this.currentSession.lines.slice(-contentHeight);

    if (displayLines.length > 0) {
      const contentTitle = chalk.blue.bold(`📄 编辑内容 (${this.currentSession.lines.length} 行):`);
      process.stdout.write(contentTitle + '\n');
      process.stdout.write(chalk.blue('─'.repeat(terminalWidth)) + '\n');

      displayLines.forEach((line, index) => {
        const actualLineNumber = this.currentSession!.lines.length - displayLines.length + index + 1;
        const lineNumber = chalk.gray(String(actualLineNumber).padStart(4, ' '));

        // 简单的语法高亮
        const highlightedContent = this.highlightSyntax(line);
        const content = highlightedContent || ' '; // 确保空行也显示

        process.stdout.write(lineNumber + chalk.gray('│ ') + content + '\n');
      });

      process.stdout.write(chalk.blue('─'.repeat(terminalWidth)) + '\n');
    } else {
      const welcomeText = chalk.blue('💡 开始输入内容...');
      const hintText = chalk.gray('支持拖拽文件、输入文本、使用快捷命令');

      process.stdout.write(welcomeText + '\n');
      process.stdout.write(hintText + '\n');
      process.stdout.write(chalk.blue('─'.repeat(terminalWidth)) + '\n');
    }

    // 显示增强状态栏
    const lineCount = this.currentSession.lines.length;
    const charCount = this.currentSession.content.length;
    const fileType = this.detectFileType();

    const statusInfo = [
      chalk.gray(`行数: ${lineCount}`),
      chalk.gray(`字符: ${charCount}`),
      fileType ? chalk.gray(`类型: ${fileType}`) : '',
      chalk.gray('拖拽文件或输入文本')
    ].filter(Boolean);

    const statusText = statusInfo.join('  ');
    const statusPadding = Math.max(0, terminalWidth - statusText.length - 4);
    process.stdout.write('\n' + chalk.gray('│ ') + statusText + ' '.repeat(statusPadding) + chalk.gray(' │') + '\n');
    process.stdout.write(chalk.blue('═'.repeat(terminalWidth)) + '\n');

    // 显示增强的输入提示
    const prompt = this.isEditing && this.currentSession && this.currentSession.lines.length > 0
      ? chalk.green(`[${lineCount}]> `)
      : chalk.green('> ');
    process.stdout.write(prompt);
  }

  private highlightSyntax(line: string): string {
    // 简单的语法高亮
    if (line.trim().startsWith('#')) {
      return chalk.cyan(line); // 注释
    }

    if (line.trim().startsWith('//')) {
      return chalk.gray(line); // 单行注释
    }

    if (line.trim().startsWith('/*') || line.trim().endsWith('*/')) {
      return chalk.gray(line); // 多行注释
    }

    // 关键字高亮
    const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export'];
    let highlightedLine = line;

    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      highlightedLine = highlightedLine.replace(regex, chalk.yellow(keyword));
    });

    // 字符串高亮
    highlightedLine = highlightedLine.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, chalk.green('$&'));

    // 数字高亮
    highlightedLine = highlightedLine.replace(/\b\d+\b/g, chalk.magenta('$&'));

    return highlightedLine;
  }

  private detectFileType(): string {
    if (!this.currentSession || this.currentSession.lines.length === 0) return '';

    const firstLine = this.currentSession.lines[0].trim();
    if (firstLine.startsWith('# 文件:')) {
      const fileName = firstLine.replace('# 文件:', '').trim();
      const ext = path.extname(fileName).toLowerCase();
      const fileTypes: Record<string, string> = {
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.py': 'Python',
        '.java': 'Java',
        '.cpp': 'C++',
        '.c': 'C',
        '.go': 'Go',
        '.rs': 'Rust',
        '.md': 'Markdown',
        '.json': 'JSON',
        '.yaml': 'YAML',
        '.yml': 'YAML',
        '.xml': 'XML',
        '.html': 'HTML',
        '.css': 'CSS',
        '.sh': 'Shell',
        '.sql': 'SQL'
      };
      return fileTypes[ext] || '文本';
    }

    // 检测编程语言模式
    const content = this.currentSession.content;
    if (content.includes('function') || content.includes('const') || content.includes('let')) {
      return 'JavaScript';
    }
    if (content.includes('def ') || content.includes('import ')) {
      return 'Python';
    }
    if (content.includes('public class') || content.includes('private ')) {
      return 'Java';
    }

    return '文本';
  }

  private handleEditorInput(input: string, rl: readline.Interface, resolve: Function): void {
    if (!this.currentSession) return;

    const trimmed = input.trim();

    // 处理特殊命令和快捷键
    if (trimmed === '"""' || trimmed === '```' || trimmed === '/submit' || trimmed === 'exit' || trimmed === 'quit') {
      this.submitEditor(rl, resolve);
      return;
    }

    if (trimmed === '/cancel' || trimmed === 'abort') {
      this.cancelEditor(rl, resolve);
      return;
    }

    if (trimmed === '/help' || trimmed === '?') {
      this.showEditorHelp();
      return;
    }

    if (trimmed === '/clear' || trimmed === '/reset') {
      this.clearEditor();
      return;
    }

    // 处理文件拖拽
    if (trimmed.startsWith('/') && trimmed.length > 1) {
      this.handleSpecialCommand(trimmed);
      return;
    }

    // 添加内容行
    this.currentSession.lines.push(input);
    this.currentSession.content = this.currentSession.lines.join('\n');

    // 重新渲染编辑器
    this.renderEditor();
  }

  private showEditorHelp(): void {
    if (!this.isEditing || !this.currentSession) return;

    const helpContent = [
      '',
      chalk.blue.bold('📖 编辑器帮助'),
      chalk.gray('─'.repeat(process.stdout.columns)),
      '',
      chalk.yellow('基本操作:'),
      chalk.white('  • 直接输入文本进行编辑'),
      chalk.white('  • 输入 """ 或 ``` 结束编辑并提交'),
      chalk.white('  • 输入 /submit 提交内容'),
      chalk.white('  • 输入 /cancel 取消编辑'),
      '',
      chalk.yellow('快捷命令:'),
      chalk.white('  • /help 或 ? - 显示此帮助'),
      chalk.white('  • /clear 或 /reset - 清空内容'),
      chalk.white('  • /file <path> - 插入文件内容'),
      chalk.white('  • /lines - 显示当前行数统计'),
      '',
      chalk.yellow('快捷键:'),
      chalk.white('  • Ctrl+C - 取消编辑'),
      chalk.white('  • Esc - 退出编辑器'),
      chalk.white('  • Ctrl+S - 提交内容'),
      '',
      chalk.gray('按任意键继续编辑...')
    ];

    helpContent.forEach(line => process.stdout.write(line + '\n'));

    // 等待用户按键后恢复编辑
    setTimeout(() => {
      this.renderEditor();
    }, 1000);
  }

  private clearEditor(): void {
    if (!this.currentSession) return;

    this.currentSession.lines = [];
    this.currentSession.content = '';
    this.renderEditor();
  }

  private handleSpecialCommand(command: string): void {
    if (command.startsWith('/file ') && command.length > 6) {
      const filePath = command.substring(6).trim();
      this.insertFileContent(filePath);
    } else if (command === '/lines') {
      this.showLineStats();
    } else {
      // 未知命令，显示提示
      process.stdout.write(chalk.red(`❌ 未知命令: ${command}`) + '\n');
      setTimeout(() => this.renderEditor(), 1000);
    }
  }

  private async insertFileContent(filePath: string): Promise<void> {
    if (!this.currentSession) return;

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);
        const lines = content.split('\n');

        // 添加文件头信息
        this.currentSession.lines.push(`# 文件: ${filePath}`);
        this.currentSession.lines.push(`# 大小: ${this.formatFileSize(stats.size)}`);
        this.currentSession.lines.push(`# 行数: ${lines.length}`);
        this.currentSession.lines.push('');

        // 添加文件内容
        lines.forEach(line => {
          this.currentSession!.lines.push(line);
        });

        this.currentSession.content = this.currentSession.lines.join('\n');
        this.renderEditor();
      } else {
        process.stdout.write(chalk.red(`❌ 文件不存在: ${filePath}`) + '\n');
        setTimeout(() => this.renderEditor(), 1500);
      }
    } catch (error) {
      process.stdout.write(chalk.red(`❌ 读取文件失败: ${error instanceof Error ? error.message : error}`) + '\n');
      setTimeout(() => this.renderEditor(), 1500);
    }
  }

  private showLineStats(): void {
    if (!this.currentSession) return;

    const lines = this.currentSession.lines;
    const totalChars = this.currentSession.content.length;
    const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
    const avgCharsPerLine = lines.length > 0 ? Math.round(totalChars / lines.length) : 0;

    const stats = [
      '',
      chalk.blue.bold('📊 编辑统计'),
      chalk.gray('─'.repeat(process.stdout.columns)),
      chalk.white(`总行数: ${lines.length}`),
      chalk.white(`非空行: ${nonEmptyLines}`),
      chalk.white(`总字符: ${totalChars}`),
      chalk.white(`平均行长度: ${avgCharsPerLine}`),
      chalk.gray('─'.repeat(process.stdout.columns)),
      chalk.gray('按任意键继续...')
    ];

    stats.forEach(line => process.stdout.write(line + '\n'));

    setTimeout(() => {
      this.renderEditor();
    }, 1000);
  }

  private submitEditor(rl: readline.Interface, resolve: Function): void {
    if (!this.currentSession) return;

    this.isEditing = false;
    this.currentSession.isComplete = true;

    // 添加到历史记录
    this.inputHistory.push(this.currentSession);

    const content = this.currentSession.content;
    const lines = this.currentSession.lines.length;
    const sessionTime = Date.now() - this.currentSession.startTime.getTime();
    this.currentSession = null;

    // 关闭 readline
    rl.close();

    // 显示提交成功信息
    process.stdout.write('\x1b[2J\x1b[H');

    const successMessage = [
      chalk.green.bold('🎉 编辑完成！'),
      chalk.gray('─'.repeat(process.stdout.columns)),
      '',
      chalk.white(`📊 提交内容:`),
      chalk.white(`  • 行数: ${lines}`),
      chalk.white(`  • 字符: ${content.length}`),
      chalk.white(`  • 编辑时长: ${Math.round(sessionTime / 1000)}秒`),
      '',
      chalk.green('✅ 内容已提交，返回主界面...'),
      ''
    ];

    successMessage.forEach(line => process.stdout.write(line + '\n'));

    this.emit('inputComplete', content);
    resolve(content);
  }

  private cancelEditor(rl: readline.Interface, resolve: Function): void {
    this.isEditing = false;
    this.currentSession = null;

    // 关闭 readline
    rl.close();

    // 显示取消信息
    process.stdout.write('\x1b[2J\x1b[H');

    const cancelMessage = [
      chalk.yellow.bold('⚠️  编辑已取消'),
      chalk.gray('─'.repeat(process.stdout.columns)),
      '',
      chalk.white('📝 编辑会话已结束'),
      chalk.white('• 所有输入内容已丢弃'),
      chalk.white('• 返回主界面'),
      '',
      chalk.yellow('💡 可以再次输入 """ 启动编辑器'),
      ''
    ];

    cancelMessage.forEach(line => process.stdout.write(line + '\n'));

    this.emit('inputCancelled');
    resolve('');
  }

  // 增强的文件拖拽处理
  private async tryHandleFileDrop(filePath: string): Promise<void> {
    try {
      const cleanPath = filePath.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

      if (!fs.existsSync(cleanPath)) {
        if (this.isEditing && this.currentSession) {
          this.showTemporaryMessage(chalk.red(`❌ 文件不存在: ${cleanPath}`));
        }
        return;
      }

      const stats = fs.statSync(cleanPath);

      if (!stats.isFile()) {
        if (this.isEditing && this.currentSession) {
          this.showTemporaryMessage(chalk.red(`❌ 不是文件: ${cleanPath}`));
        }
        return;
      }

      if (stats.size > 1024 * 1024) {
        if (this.isEditing && this.currentSession) {
          this.showTemporaryMessage(chalk.red(`❌ 文件过大 (${this.formatFileSize(stats.size)}): ${cleanPath}`));
        }
        return;
      }

      const content = fs.readFileSync(cleanPath, 'utf-8');
      const mimeType = this.getMimeType(cleanPath);

      const fileDrop: FileDrop = {
        filePath: cleanPath,
        content,
        size: stats.size,
        mimeType,
        timestamp: new Date()
      };

      this.emit('fileDrop', fileDrop);

      // 如果在编辑模式，插入内容
      if (this.isEditing && this.currentSession) {
        await this.insertFileToEditor(cleanPath, stats, content, mimeType);
      }
    } catch (error) {
      if (this.isEditing && this.currentSession) {
        this.showTemporaryMessage(chalk.red(`❌ 文件处理错误: ${error instanceof Error ? error.message : error}`));
      }
    }
  }

  private async insertFileToEditor(filePath: string, stats: any, content: string, mimeType: string): Promise<void> {
    if (!this.currentSession) return;

    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const lines = content.split('\n');

    // 添加文件头部信息
    const headerLines = [
      `# 文件: ${fileName}`,
      `# 路径: ${filePath}`,
      `# 大小: ${this.formatFileSize(stats.size)}`,
      `# 类型: ${mimeType}`,
      `# 行数: ${lines.length}`,
      `# 插入时间: ${new Date().toLocaleString('zh-CN')}`,
      ''
    ];

    // 根据文件类型添加语法高亮提示
    let syntaxComment = '';
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs'].includes(fileExt)) {
      syntaxComment = '# 代码文件 - 已加载';
    } else if (['.md', '.txt', '.json', '.yaml', '.yml', '.xml'].includes(fileExt)) {
      syntaxComment = '# 文本文件 - 已加载';
    } else {
      syntaxComment = '# 文件内容 - 已加载';
    }

    headerLines.splice(5, 0, syntaxComment);

    // 插入头部信息
    headerLines.forEach(line => {
      this.currentSession!.lines.push(line);
    });

    // 插入文件内容
    lines.forEach(line => {
      this.currentSession!.lines.push(line);
    });

    // 添加文件结束标记
    this.currentSession!.lines.push('');
    this.currentSession!.lines.push(`# 文件 ${fileName} 结束`);
    this.currentSession!.lines.push('');

    // 更新内容
    this.currentSession.content = this.currentSession.lines.join('\n');

    // 显示成功消息
    this.showTemporaryMessage(chalk.green(`✅ 已加载文件: ${fileName} (${lines.length} 行)`));

    // 重新渲染编辑器
    this.renderEditor();
  }

  private showTemporaryMessage(message: string): void {
    if (!this.isEditing || !this.currentSession) return;

    // 临时保存当前光标位置
    process.stdout.write('\x1b[s'); // 保存光标位置
    process.stdout.write('\x1b[1;1H'); // 移动到第一行第一列

    // 显示消息
    process.stdout.write(message + '\n');

    // 恢复光标位置
    setTimeout(() => {
      process.stdout.write('\x1b[u'); // 恢复光标位置
      this.renderEditor();
    }, 2000);
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.sh': 'application/x-sh',
      '.bash': 'application/x-sh',
      '.zsh': 'application/x-sh',
      '.sql': 'application/sql',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.rb': 'text/x-ruby',
      '.php': 'text/x-php',
      '.swift': 'text/x-swift'
    };
    return mimeTypes[ext] || 'text/plain';
  }

  public getCurrentContent(): string {
    return this.currentSession ? this.currentSession.content : '';
  }

  public getLineCount(): number {
    return this.currentSession ? this.currentSession.lines.length : 0;
  }

  public isActive(): boolean {
    return this.isEditing;
  }

  public stop(): void {
    this.isEditing = false;
    this.currentSession = null;

    // 关闭编辑器 readline
    if ((this as any).editorRl) {
      try {
        (this as any).editorRl.close();
      } catch (error) {
        // 忽略关闭错误
      }
      (this as any).editorRl = null;
    }

    // 清理事件监听器
    process.stdout.removeAllListeners('resize');
  }
}