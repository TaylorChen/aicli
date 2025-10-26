/**
 * 增强的Vim模式实现
 * 提供完整的Vim操作体验：Normal, Insert, Visual, Command模式
 */

import * as readline from 'readline';
import chalk from 'chalk';

export type VimMode = 'normal' | 'insert' | 'visual' | 'command';

export interface VimState {
  mode: VimMode;
  buffer: string[];
  cursorLine: number;
  cursorCol: number;
  visualStart?: { line: number; col: number };
  register: string;
  lastCommand: string;
  message: string;
}

export class EnhancedVimMode {
  private state: VimState;
  private onSubmit: (text: string) => void;
  private onCancel: () => void;
  private rl: readline.Interface | null = null;

  constructor(
    onSubmit: (text: string) => void,
    onCancel: () => void
  ) {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.state = {
      mode: 'normal',
      buffer: [''],
      cursorLine: 0,
      cursorCol: 0,
      register: '',
      lastCommand: '',
      message: '',
    };
  }

  /**
   * 启动Vim模式
   */
  public start(initialText: string = ''): void {
    if (initialText) {
      this.state.buffer = initialText.split('\n');
    }
    
    this.setupReadline();
    this.render();
    this.enterMode('normal');
  }

  /**
   * 停止Vim模式
   */
  public stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * 获取当前缓冲区内容
   */
  public getBuffer(): string {
    return this.state.buffer.join('\n');
  }

  /**
   * 设置缓冲区内容
   */
  public setBuffer(text: string): void {
    this.state.buffer = text.split('\n');
    this.state.cursorLine = Math.min(this.state.cursorLine, this.state.buffer.length - 1);
    this.state.cursorCol = Math.min(this.state.cursorCol, this.getCurrentLine().length);
  }

  /**
   * 切换模式
   */
  private enterMode(mode: VimMode): void {
    this.state.mode = mode;
    this.state.message = this.getModeMessage();
    this.render();
  }

  /**
   * 获取模式提示信息
   */
  private getModeMessage(): string {
    switch (this.state.mode) {
      case 'normal':
        return chalk.cyan('-- NORMAL --');
      case 'insert':
        return chalk.green('-- INSERT --');
      case 'visual':
        return chalk.yellow('-- VISUAL --');
      case 'command':
        return chalk.blue(':');
      default:
        return '';
    }
  }

  /**
   * 设置readline接口
   */
  private setupReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // 启用原始模式以捕获单个按键
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', (data) => {
      this.handleInput(data.toString());
    });
  }

  /**
   * 处理输入
   */
  private handleInput(input: string): void {
    const key = input;
    
    // 全局快捷键
    if (key === '\u0003') { // Ctrl+C
      this.handleForceExit();
      return;
    }

    switch (this.state.mode) {
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

    this.render();
  }

  /**
   * Normal模式处理
   */
  private handleNormalMode(key: string): void {
    switch (key) {
      // 移动命令
      case 'h':
        this.moveCursorLeft();
        break;
      case 'j':
        this.moveCursorDown();
        break;
      case 'k':
        this.moveCursorUp();
        break;
      case 'l':
        this.moveCursorRight();
        break;
      case 'w':
        this.moveWordForward();
        break;
      case 'b':
        this.moveWordBackward();
        break;
      case '0':
        this.moveCursorToLineStart();
        break;
      case '$':
        this.moveCursorToLineEnd();
        break;
      case 'g':
        if (this.state.lastCommand === 'g') {
          this.moveCursorToFileStart();
        }
        break;
      case 'G':
        this.moveCursorToFileEnd();
        break;

      // 进入Insert模式
      case 'i':
        this.enterMode('insert');
        break;
      case 'I':
        this.moveCursorToLineStart();
        this.enterMode('insert');
        break;
      case 'a':
        this.moveCursorRight();
        this.enterMode('insert');
        break;
      case 'A':
        this.moveCursorToLineEnd();
        this.enterMode('insert');
        break;
      case 'o':
        this.insertLineBelow();
        this.enterMode('insert');
        break;
      case 'O':
        this.insertLineAbove();
        this.enterMode('insert');
        break;

      // 删除命令
      case 'x':
        this.deleteChar();
        break;
      case 'X':
        this.deleteCharBefore();
        break;
      case 'd':
        if (this.state.lastCommand === 'd') {
          this.deleteLine();
        }
        break;

      // 复制命令
      case 'y':
        if (this.state.lastCommand === 'y') {
          this.yankLine();
        }
        break;

      // 粘贴命令
      case 'p':
        this.pasteAfter();
        break;
      case 'P':
        this.pasteBefore();
        break;

      // 进入Visual模式
      case 'v':
        this.enterVisualMode();
        break;

      // 进入Command模式
      case ':':
        this.enterMode('command');
        break;

      // 撤销/重做
      case 'u':
        this.state.message = 'Undo not implemented yet';
        break;
      case '\u0012': // Ctrl+R
        this.state.message = 'Redo not implemented yet';
        break;
    }

    this.state.lastCommand = key;
  }

  /**
   * Insert模式处理
   */
  private handleInsertMode(key: string): void {
    if (key === '\u001b') { // ESC
      this.enterMode('normal');
      this.moveCursorLeft();
      return;
    }

    if (key === '\r' || key === '\n') { // Enter
      this.insertNewLine();
      return;
    }

    if (key === '\u007f' || key === '\b') { // Backspace
      this.backspace();
      return;
    }

    // 正常字符输入
    if (key.length === 1 && key >= ' ' && key <= '~') {
      this.insertChar(key);
    }
  }

  /**
   * Visual模式处理
   */
  private handleVisualMode(key: string): void {
    if (key === '\u001b') { // ESC
      this.enterMode('normal');
      this.state.visualStart = undefined;
      return;
    }

    // 移动命令（保持选择）
    switch (key) {
      case 'h':
        this.moveCursorLeft();
        break;
      case 'j':
        this.moveCursorDown();
        break;
      case 'k':
        this.moveCursorUp();
        break;
      case 'l':
        this.moveCursorRight();
        break;
      case 'y':
        this.yankVisualSelection();
        this.enterMode('normal');
        break;
      case 'd':
        this.deleteVisualSelection();
        this.enterMode('normal');
        break;
    }
  }

  /**
   * Command模式处理
   */
  private handleCommandMode(key: string): void {
    if (key === '\u001b') { // ESC
      this.enterMode('normal');
      return;
    }

    if (key === '\r' || key === '\n') { // Enter
      this.executeCommand();
      return;
    }

    if (key === '\u007f' || key === '\b') { // Backspace
      this.state.message = this.state.message.slice(0, -1);
      if (this.state.message === '') {
        this.enterMode('normal');
      }
      return;
    }

    // 添加字符到命令
    if (key.length === 1 && key >= ' ' && key <= '~') {
      this.state.message += key;
    }
  }

  /**
   * 执行命令
   */
  private executeCommand(): void {
    const command = this.state.message.slice(1).trim(); // 移除前面的 ':'
    
    if (command === 'q' || command === 'quit') {
      this.handleExit();
    } else if (command === 'w' || command === 'write') {
      this.handleSave();
    } else if (command === 'wq') {
      this.handleSaveAndExit();
    } else {
      this.state.message = `Unknown command: ${command}`;
    }
    
    this.enterMode('normal');
  }

  /**
   * 渲染界面
   */
  private render(): void {
    // 清屏
    process.stdout.write('\x1b[2J\x1b[H');
    
    // 显示缓冲区
    this.state.buffer.forEach((line, index) => {
      if (index === this.state.cursorLine) {
        // 当前行高亮
        console.log(chalk.bgGray(this.formatLineWithCursor(line)));
      } else {
        console.log(line);
      }
    });

    // 显示状态栏
    console.log('');
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 80)));
    console.log(this.state.message);
    console.log(chalk.gray(`${this.state.cursorLine + 1},${this.state.cursorCol + 1}`));
  }

  /**
   * 格式化行并显示光标
   */
  private formatLineWithCursor(line: string): string {
    if (this.state.cursorCol >= line.length) {
      return line + ' ';
    }
    return (
      line.substring(0, this.state.cursorCol) +
      chalk.inverse(line[this.state.cursorCol] || ' ') +
      line.substring(this.state.cursorCol + 1)
    );
  }

  // ========== 光标移动命令 ==========

  private moveCursorLeft(): void {
    if (this.state.cursorCol > 0) {
      this.state.cursorCol--;
    }
  }

  private moveCursorRight(): void {
    const line = this.getCurrentLine();
    if (this.state.cursorCol < line.length) {
      this.state.cursorCol++;
    }
  }

  private moveCursorUp(): void {
    if (this.state.cursorLine > 0) {
      this.state.cursorLine--;
      this.adjustCursorCol();
    }
  }

  private moveCursorDown(): void {
    if (this.state.cursorLine < this.state.buffer.length - 1) {
      this.state.cursorLine++;
      this.adjustCursorCol();
    }
  }

  private moveCursorToLineStart(): void {
    this.state.cursorCol = 0;
  }

  private moveCursorToLineEnd(): void {
    this.state.cursorCol = this.getCurrentLine().length;
  }

  private moveCursorToFileStart(): void {
    this.state.cursorLine = 0;
    this.state.cursorCol = 0;
  }

  private moveCursorToFileEnd(): void {
    this.state.cursorLine = this.state.buffer.length - 1;
    this.state.cursorCol = this.getCurrentLine().length;
  }

  private moveWordForward(): void {
    const line = this.getCurrentLine();
    let col = this.state.cursorCol;
    
    // 跳过当前单词
    while (col < line.length && /\w/.test(line[col])) {
      col++;
    }
    // 跳过空格
    while (col < line.length && /\s/.test(line[col])) {
      col++;
    }
    
    this.state.cursorCol = col;
  }

  private moveWordBackward(): void {
    const line = this.getCurrentLine();
    let col = this.state.cursorCol;
    
    if (col > 0) col--;
    
    // 跳过空格
    while (col > 0 && /\s/.test(line[col])) {
      col--;
    }
    // 跳到单词开头
    while (col > 0 && /\w/.test(line[col - 1])) {
      col--;
    }
    
    this.state.cursorCol = col;
  }

  // ========== 编辑命令 ==========

  private insertChar(char: string): void {
    const line = this.getCurrentLine();
    const newLine = 
      line.substring(0, this.state.cursorCol) +
      char +
      line.substring(this.state.cursorCol);
    this.setCurrentLine(newLine);
    this.state.cursorCol++;
  }

  private deleteChar(): void {
    const line = this.getCurrentLine();
    if (this.state.cursorCol < line.length) {
      const newLine = 
        line.substring(0, this.state.cursorCol) +
        line.substring(this.state.cursorCol + 1);
      this.setCurrentLine(newLine);
    }
  }

  private deleteCharBefore(): void {
    if (this.state.cursorCol > 0) {
      this.state.cursorCol--;
      this.deleteChar();
    }
  }

  private deleteLine(): void {
    this.state.register = this.getCurrentLine();
    if (this.state.buffer.length > 1) {
      this.state.buffer.splice(this.state.cursorLine, 1);
      if (this.state.cursorLine >= this.state.buffer.length) {
        this.state.cursorLine = this.state.buffer.length - 1;
      }
    } else {
      this.state.buffer = [''];
    }
    this.adjustCursorCol();
  }

  private yankLine(): void {
    this.state.register = this.getCurrentLine();
    this.state.message = 'Line yanked';
  }

  private pasteAfter(): void {
    if (this.state.register) {
      this.state.buffer.splice(this.state.cursorLine + 1, 0, this.state.register);
      this.state.cursorLine++;
    }
  }

  private pasteBefore(): void {
    if (this.state.register) {
      this.state.buffer.splice(this.state.cursorLine, 0, this.state.register);
    }
  }

  private insertLineBelow(): void {
    this.state.buffer.splice(this.state.cursorLine + 1, 0, '');
    this.state.cursorLine++;
    this.state.cursorCol = 0;
  }

  private insertLineAbove(): void {
    this.state.buffer.splice(this.state.cursorLine, 0, '');
    this.state.cursorCol = 0;
  }

  private insertNewLine(): void {
    const line = this.getCurrentLine();
    const before = line.substring(0, this.state.cursorCol);
    const after = line.substring(this.state.cursorCol);
    
    this.setCurrentLine(before);
    this.state.buffer.splice(this.state.cursorLine + 1, 0, after);
    this.state.cursorLine++;
    this.state.cursorCol = 0;
  }

  private backspace(): void {
    if (this.state.cursorCol > 0) {
      this.deleteCharBefore();
    } else if (this.state.cursorLine > 0) {
      // 合并到上一行
      const currentLine = this.getCurrentLine();
      this.state.cursorLine--;
      const prevLine = this.getCurrentLine();
      this.state.cursorCol = prevLine.length;
      this.setCurrentLine(prevLine + currentLine);
      this.state.buffer.splice(this.state.cursorLine + 1, 1);
    }
  }

  // ========== Visual模式命令 ==========

  private enterVisualMode(): void {
    this.state.visualStart = {
      line: this.state.cursorLine,
      col: this.state.cursorCol,
    };
    this.enterMode('visual');
  }

  private yankVisualSelection(): void {
    // 简化实现：只支持单行选择
    if (this.state.visualStart) {
      const start = Math.min(this.state.visualStart.col, this.state.cursorCol);
      const end = Math.max(this.state.visualStart.col, this.state.cursorCol);
      const line = this.getCurrentLine();
      this.state.register = line.substring(start, end + 1);
      this.state.message = 'Selection yanked';
    }
    this.state.visualStart = undefined;
  }

  private deleteVisualSelection(): void {
    // 简化实现：只支持单行选择
    if (this.state.visualStart) {
      const start = Math.min(this.state.visualStart.col, this.state.cursorCol);
      const end = Math.max(this.state.visualStart.col, this.state.cursorCol);
      const line = this.getCurrentLine();
      this.state.register = line.substring(start, end + 1);
      const newLine = line.substring(0, start) + line.substring(end + 1);
      this.setCurrentLine(newLine);
      this.state.cursorCol = start;
    }
    this.state.visualStart = undefined;
  }

  // ========== 退出命令 ==========

  private handleExit(): void {
    this.stop();
    this.onCancel();
  }

  private handleSave(): void {
    const content = this.getBuffer();
    this.stop();
    this.onSubmit(content);
  }

  private handleSaveAndExit(): void {
    this.handleSave();
  }

  private handleForceExit(): void {
    this.stop();
    this.onCancel();
  }

  // ========== 辅助方法 ==========

  private getCurrentLine(): string {
    return this.state.buffer[this.state.cursorLine] || '';
  }

  private setCurrentLine(line: string): void {
    this.state.buffer[this.state.cursorLine] = line;
  }

  private adjustCursorCol(): void {
    const line = this.getCurrentLine();
    if (this.state.cursorCol > line.length) {
      this.state.cursorCol = line.length;
    }
  }
}

