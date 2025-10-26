/**
 * 完整的Vim模式实现
 * 支持中文、多行编辑、完整的vim命令
 */

import * as readline from 'readline';
import chalk from 'chalk';

export type VimMode = 'normal' | 'insert' | 'visual' | 'command';

export interface VimBuffer {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

export class FullVimMode {
  private mode: VimMode = 'normal';
  private buffer: string[] = [''];
  private cursorLine: number = 0;
  private cursorCol: number = 0;
  private commandBuffer: string = '';
  private visualStart: { line: number; col: number } | null = null;
  private yankRegister: string[] = [];
  private running: boolean = false;
  private saved: boolean = true;
  private filename: string = '';

  constructor(initialContent: string = '', filename: string = '') {
    if (initialContent) {
      this.buffer = initialContent.split('\n');
    }
    this.filename = filename;
  }

  /**
   * 启动Vim模式
   */
  async start(): Promise<string | null> {
    this.running = true;
    this.mode = 'normal';
    
    // 显示初始界面
    this.render();

    return new Promise((resolve) => {
      // 保存现有的data监听器
      const existingListeners = process.stdin.listeners('data').slice() as Array<(...args: any[]) => void>;
      
      // 移除所有现有的data监听器以避免冲突
      existingListeners.forEach((listener) => {
        process.stdin.removeListener('data', listener);
      });
      
      // 设置raw mode以捕获所有键盘输入
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (key: string) => {
        if (!this.running) {
          cleanup();
          return;
        }

        this.handleKey(key);
        
        if (!this.running) {
          cleanup();
          const result = this.buffer.join('\n');
          resolve(this.saved ? result : null);
        } else {
          this.render();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        // 清屏
        console.clear();
        
        // 恢复之前的监听器
        existingListeners.forEach((listener) => {
          process.stdin.on('data', listener);
        });
      };

      process.stdin.on('data', onData);
    });
  }

  /**
   * 处理键盘输入
   */
  private handleKey(key: string): void {
    // Ctrl+C - 强制退出
    if (key === '\u0003') {
      this.running = false;
      this.saved = false;
      return;
    }

    switch (this.mode) {
      case 'normal':
        this.handleNormalMode(key);
        break;
      case 'insert':
        this.handleInsertMode(key);
        break;
      case 'visual':
        this.handleVisualMode(key);
        break;
      case 'command':
        this.handleCommandMode(key);
        break;
    }
  }

  /**
   * Normal模式键处理
   */
  private handleNormalMode(key: string): void {
    switch (key) {
      // 进入Insert模式
      case 'i':
        this.mode = 'insert';
        break;
      case 'I':
        this.cursorCol = 0;
        this.mode = 'insert';
        break;
      case 'a':
        this.cursorCol = Math.min(this.cursorCol + 1, this.getCurrentLine().length);
        this.mode = 'insert';
        break;
      case 'A':
        this.cursorCol = this.getCurrentLine().length;
        this.mode = 'insert';
        break;
      case 'o':
        this.buffer.splice(this.cursorLine + 1, 0, '');
        this.cursorLine++;
        this.cursorCol = 0;
        this.mode = 'insert';
        this.saved = false;
        break;
      case 'O':
        this.buffer.splice(this.cursorLine, 0, '');
        this.cursorCol = 0;
        this.mode = 'insert';
        this.saved = false;
        break;

      // 移动
      case 'h':
        this.cursorCol = Math.max(0, this.cursorCol - 1);
        break;
      case 'j':
        if (this.cursorLine < this.buffer.length - 1) {
          this.cursorLine++;
          this.cursorCol = Math.min(this.cursorCol, this.getCurrentLine().length);
        }
        break;
      case 'k':
        if (this.cursorLine > 0) {
          this.cursorLine--;
          this.cursorCol = Math.min(this.cursorCol, this.getCurrentLine().length);
        }
        break;
      case 'l':
        this.cursorCol = Math.min(this.cursorCol + 1, this.getCurrentLine().length);
        break;
      case 'w':
        this.moveWordForward();
        break;
      case 'b':
        this.moveWordBackward();
        break;
      case '0':
        this.cursorCol = 0;
        break;
      case '$':
        this.cursorCol = this.getCurrentLine().length;
        break;
      case 'g':
        // gg - 跳到第一行
        this.cursorLine = 0;
        this.cursorCol = 0;
        break;
      case 'G':
        // G - 跳到最后一行
        this.cursorLine = this.buffer.length - 1;
        this.cursorCol = 0;
        break;

      // 删除
      case 'x':
        this.deleteChar();
        break;
      case 'd':
        // dd - 删除整行
        if (this.buffer.length > 1) {
          this.yankRegister = [this.buffer[this.cursorLine]];
          this.buffer.splice(this.cursorLine, 1);
          if (this.cursorLine >= this.buffer.length) {
            this.cursorLine = this.buffer.length - 1;
          }
          this.saved = false;
        }
        break;

      // 复制粘贴
      case 'y':
        // yy - 复制整行
        this.yankRegister = [this.buffer[this.cursorLine]];
        break;
      case 'p':
        // 粘贴
        if (this.yankRegister.length > 0) {
          this.buffer.splice(this.cursorLine + 1, 0, ...this.yankRegister);
          this.cursorLine++;
          this.saved = false;
        }
        break;
      case 'P':
        // 粘贴到前面
        if (this.yankRegister.length > 0) {
          this.buffer.splice(this.cursorLine, 0, ...this.yankRegister);
          this.saved = false;
        }
        break;

      // 撤销
      case 'u':
        // TODO: 实现撤销
        break;

      // 进入Visual模式
      case 'v':
        this.mode = 'visual';
        this.visualStart = { line: this.cursorLine, col: this.cursorCol };
        break;

      // 进入Command模式
      case ':':
        this.mode = 'command';
        this.commandBuffer = '';
        break;

      // 快捷保存退出
      case 'Z':
        // ZZ - 保存并退出
        this.saved = true;
        this.running = false;
        break;
    }
  }

  /**
   * Insert模式键处理 - 支持中文和多行
   */
  private handleInsertMode(key: string): void {
    // ESC - 返回Normal模式
    if (key === '\u001b') {
      this.mode = 'normal';
      // 光标左移一位
      if (this.cursorCol > 0) {
        this.cursorCol--;
      }
      return;
    }

    // Enter - 新行
    if (key === '\r' || key === '\n') {
      const currentLine = this.getCurrentLine();
      const beforeCursor = currentLine.substring(0, this.cursorCol);
      const afterCursor = currentLine.substring(this.cursorCol);
      
      this.buffer[this.cursorLine] = beforeCursor;
      this.buffer.splice(this.cursorLine + 1, 0, afterCursor);
      this.cursorLine++;
      this.cursorCol = 0;
      this.saved = false;
      return;
    }

    // Backspace
    if (key === '\u007f' || key === '\b') {
      if (this.cursorCol > 0) {
        const line = this.getCurrentLine();
        this.buffer[this.cursorLine] = line.substring(0, this.cursorCol - 1) + line.substring(this.cursorCol);
        this.cursorCol--;
        this.saved = false;
      } else if (this.cursorLine > 0) {
        // 合并到上一行
        const currentLine = this.buffer[this.cursorLine];
        const prevLine = this.buffer[this.cursorLine - 1];
        this.buffer[this.cursorLine - 1] = prevLine + currentLine;
        this.buffer.splice(this.cursorLine, 1);
        this.cursorLine--;
        this.cursorCol = prevLine.length;
        this.saved = false;
      }
      return;
    }

    // 方向键（在insert模式下）
    if (key === '\u001b[A') { // Up
      if (this.cursorLine > 0) {
        this.cursorLine--;
        this.cursorCol = Math.min(this.cursorCol, this.getCurrentLine().length);
      }
      return;
    }
    if (key === '\u001b[B') { // Down
      if (this.cursorLine < this.buffer.length - 1) {
        this.cursorLine++;
        this.cursorCol = Math.min(this.cursorCol, this.getCurrentLine().length);
      }
      return;
    }
    if (key === '\u001b[C') { // Right
      this.cursorCol = Math.min(this.cursorCol + 1, this.getCurrentLine().length);
      return;
    }
    if (key === '\u001b[D') { // Left
      if (this.cursorCol > 0) {
        this.cursorCol--;
      }
      return;
    }

    // 普通字符输入（包括中文）
    // 忽略其他控制字符
    if (key.charCodeAt(0) < 32 && key !== '\t') {
      return;
    }

    const line = this.getCurrentLine();
    this.buffer[this.cursorLine] = 
      line.substring(0, this.cursorCol) + 
      key + 
      line.substring(this.cursorCol);
    this.cursorCol += key.length; // 支持多字节字符（中文）
    this.saved = false;
  }

  /**
   * Visual模式键处理
   */
  private handleVisualMode(key: string): void {
    // ESC - 返回Normal模式
    if (key === '\u001b') {
      this.mode = 'normal';
      this.visualStart = null;
      return;
    }

    // 移动键与Normal模式相同
    switch (key) {
      case 'h':
      case 'j':
      case 'k':
      case 'l':
        this.handleNormalMode(key);
        break;
      case 'y':
        // 复制选中内容
        this.yankVisualSelection();
        this.mode = 'normal';
        this.visualStart = null;
        break;
      case 'd':
        // 删除选中内容
        this.yankVisualSelection();
        this.deleteVisualSelection();
        this.mode = 'normal';
        this.visualStart = null;
        this.saved = false;
        break;
    }
  }

  /**
   * Command模式键处理
   */
  private handleCommandMode(key: string): void {
    // ESC - 返回Normal模式
    if (key === '\u001b') {
      this.mode = 'normal';
      this.commandBuffer = '';
      return;
    }

    // Enter - 执行命令
    if (key === '\r' || key === '\n') {
      this.executeCommand(this.commandBuffer);
      this.commandBuffer = '';
      return;
    }

    // Backspace
    if (key === '\u007f' || key === '\b') {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      if (this.commandBuffer.length === 0) {
        this.mode = 'normal';
      }
      return;
    }

    // 添加字符到命令缓冲区
    if (key.charCodeAt(0) >= 32) {
      this.commandBuffer += key;
    }
  }

  /**
   * 执行命令
   */
  private executeCommand(cmd: string): void {
    const trimmed = cmd.trim();

    // :q - 退出（如果有未保存的修改则拒绝）
    if (trimmed === 'q') {
      if (!this.saved) {
        this.mode = 'normal';
        // 显示错误消息
        return;
      }
      this.saved = true;
      this.running = false;
      return;
    }

    // :q! - 强制退出
    if (trimmed === 'q!') {
      this.saved = false;
      this.running = false;
      return;
    }

    // :w - 保存
    if (trimmed === 'w') {
      this.saved = true;
      this.mode = 'normal';
      return;
    }

    // :wq 或 :x - 保存并退出
    if (trimmed === 'wq' || trimmed === 'x') {
      this.saved = true;
      this.running = false;
      return;
    }

    // :e - 放弃修改并重新编辑
    if (trimmed === 'e!') {
      // TODO: 重新加载
      this.mode = 'normal';
      return;
    }

    // 行号跳转
    const lineNum = parseInt(trimmed, 10);
    if (!isNaN(lineNum) && lineNum > 0 && lineNum <= this.buffer.length) {
      this.cursorLine = lineNum - 1;
      this.cursorCol = 0;
      this.mode = 'normal';
      return;
    }

    // 未知命令
    this.mode = 'normal';
  }

  /**
   * 渲染界面
   */
  private render(): void {
    // 清屏
    console.clear();

    // 渲染标题
    const title = this.filename || '[未命名]';
    const modifiedFlag = this.saved ? '' : ' [+]';
    console.log(chalk.bold.cyan(`Vim编辑器 - ${title}${modifiedFlag}`));
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 80)));

    // 渲染内容（显示最多20行）
    const startLine = Math.max(0, this.cursorLine - 10);
    const endLine = Math.min(this.buffer.length, startLine + 20);

    for (let i = startLine; i < endLine; i++) {
      const lineNum = chalk.gray(`${(i + 1).toString().padStart(4)} │ `);
      const line = this.buffer[i] || '';
      
      if (i === this.cursorLine) {
        // 当前行高亮
        const before = line.substring(0, this.cursorCol);
        const cursor = line[this.cursorCol] || ' ';
        const after = line.substring(this.cursorCol + 1);
        
        console.log(lineNum + chalk.bgWhite.black(before + chalk.inverse(cursor) + after));
      } else if (this.mode === 'visual' && this.visualStart && this.isLineInVisualSelection(i)) {
        // Visual模式选中的行
        console.log(lineNum + chalk.bgBlue.white(line));
      } else {
        console.log(lineNum + line);
      }
    }

    // 底部状态栏
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 80)));
    
    if (this.mode === 'command') {
      console.log(chalk.yellow(':' + this.commandBuffer + '█'));
    } else {
      const modeText = {
        normal: chalk.green('-- NORMAL --'),
        insert: chalk.blue('-- INSERT --'),
        visual: chalk.magenta('-- VISUAL --'),
        command: chalk.yellow('-- COMMAND --')
      }[this.mode];
      
      const position = chalk.gray(`${this.cursorLine + 1}:${this.cursorCol + 1}`);
      const lines = chalk.gray(`${this.buffer.length} lines`);
      
      console.log(`${modeText}  ${position}  ${lines}`);
    }

    // 帮助提示
    if (this.mode === 'normal') {
      console.log(chalk.gray('i=插入 :wq=保存退出 :q!=放弃退出 ZZ=保存退出 Ctrl+C=强制退出'));
    } else if (this.mode === 'insert') {
      console.log(chalk.gray('ESC=返回普通模式 Enter=新行 支持中文输入'));
    }
  }

  // 辅助方法
  private getCurrentLine(): string {
    return this.buffer[this.cursorLine] || '';
  }

  private deleteChar(): void {
    const line = this.getCurrentLine();
    if (this.cursorCol < line.length) {
      this.buffer[this.cursorLine] = line.substring(0, this.cursorCol) + line.substring(this.cursorCol + 1);
      this.saved = false;
    }
  }

  private moveWordForward(): void {
    const line = this.getCurrentLine();
    const words = line.split(/\s+/);
    let pos = 0;
    for (const word of words) {
      pos += word.length + 1;
      if (pos > this.cursorCol) {
        this.cursorCol = Math.min(pos - 1, line.length);
        break;
      }
    }
  }

  private moveWordBackward(): void {
    const line = this.getCurrentLine();
    const words = line.split(/\s+/);
    let pos = 0;
    let lastPos = 0;
    for (const word of words) {
      if (pos >= this.cursorCol) {
        this.cursorCol = lastPos;
        break;
      }
      lastPos = pos;
      pos += word.length + 1;
    }
  }

  private isLineInVisualSelection(line: number): boolean {
    if (!this.visualStart) return false;
    const start = Math.min(this.visualStart.line, this.cursorLine);
    const end = Math.max(this.visualStart.line, this.cursorLine);
    return line >= start && line <= end;
  }

  private yankVisualSelection(): void {
    if (!this.visualStart) return;
    const start = Math.min(this.visualStart.line, this.cursorLine);
    const end = Math.max(this.visualStart.line, this.cursorLine);
    this.yankRegister = this.buffer.slice(start, end + 1);
  }

  private deleteVisualSelection(): void {
    if (!this.visualStart) return;
    const start = Math.min(this.visualStart.line, this.cursorLine);
    const end = Math.max(this.visualStart.line, this.cursorLine);
    this.buffer.splice(start, end - start + 1, '');
    if (this.buffer.length === 0) {
      this.buffer = [''];
    }
    this.cursorLine = start;
    this.cursorCol = 0;
  }
}

