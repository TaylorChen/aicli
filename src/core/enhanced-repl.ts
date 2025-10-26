import readline from 'readline';
import chalk from 'chalk';
import { smartConfig } from './smart-config';
import { CommandHistory } from './command-history';
import { SmartCompleter } from './smart-completer';
import { SyntaxHighlighter } from './syntax-highlighter';
import { SessionManager } from './session-manager';
import { OutputManager } from './output-manager';
import { ProjectDetector } from './smart-command-parser';
import { HighlighterConfig } from './syntax-highlighter';

export interface REPLState {
  isRunning: boolean;
  currentSession: string;
  inputBuffer: string;
  cursorPosition: number;
  historyIndex: number;
  isMultiline: boolean;
  multilineBuffer: string[];
  suggestions: string[];
  selectedSuggestion: number;
}

export interface REPLConfig {
  theme: 'auto' | 'light' | 'dark' | 'minimal';
  colors: boolean;
  emoji: boolean;
  syntaxHighlighting: boolean;
  maxHistory: number;
  autoSave: boolean;
  smartSuggestions: boolean;
  maxOutputLines: number;
}

export class EnhancedREPL {
  private rl!: readline.Interface;
  private state: REPLState;
  private config: REPLConfig;
  private history: CommandHistory;
  private completer: SmartCompleter;
  private highlighter: SyntaxHighlighter;
  private sessionManager: SessionManager;
  private outputManager: OutputManager;
  private projectDetector: ProjectDetector;

  constructor() {
    this.state = {
      isRunning: false,
      currentSession: '',
      inputBuffer: '',
      cursorPosition: 0,
      historyIndex: -1,
      isMultiline: false,
      multilineBuffer: [],
      suggestions: [],
      selectedSuggestion: 0
    };

    this.config = this.loadConfig();
    this.history = new CommandHistory(this.config.maxHistory);
    this.completer = new SmartCompleter();
    // Filter out 'minimal' theme for SyntaxHighlighter which only supports auto/light/dark
    const highlighterConfig: Partial<HighlighterConfig> = {
      enabled: this.config.syntaxHighlighting,
      theme: this.config.theme === 'minimal' ? 'auto' : this.config.theme,
      languages: ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'],
      maxLineLength: 1000
    };
    this.highlighter = new SyntaxHighlighter(highlighterConfig);
    this.sessionManager = new SessionManager();
    this.outputManager = new OutputManager(this.config);
    this.projectDetector = new ProjectDetector();

    this.setupReadline();
  }

  private loadConfig(): REPLConfig {
    return {
      theme: (smartConfig.getWithDefault('ui.theme', 'auto') as 'auto' | 'light' | 'dark'),
      colors: smartConfig.getWithDefault('ui.colors', true),
      emoji: smartConfig.getWithDefault('ui.emoji', true),
      syntaxHighlighting: smartConfig.getWithDefault('ui.syntaxHighlighting', true),
      maxHistory: smartConfig.getWithDefault('behavior.historySize', 1000),
      autoSave: smartConfig.getWithDefault('behavior.autoSave', true),
      smartSuggestions: smartConfig.getWithDefault('behavior.smartSuggestions', true),
      maxOutputLines: smartConfig.getWithDefault('ui.maxOutputLines', 1000)
    };
  }

  private setupReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.buildPrompt(),
      history: this.history.getHistory(),
      historySize: this.config.maxHistory,
      completer: (line: string) => {
        const result = this.completer.completeCommand(line);
        return [result.completions, line];
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 基础事件
    this.rl.on('line', this.handleLine.bind(this));
    this.rl.on('close', this.handleClose.bind(this));

    // 键盘事件
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on('data', this.handleKeypress.bind(this));
    }

    // 窗口大小变化
    process.stdout.on('resize', this.handleResize.bind(this));

    // 进程信号
    process.on('SIGINT', this.handleInterrupt.bind(this));
    process.on('SIGTERM', this.handleTerminate.bind(this));
  }

  async start(options: { session?: string; project?: string } = {}): Promise<void> {
    this.state.isRunning = true;

    // 设置会话
    if (options.session) {
      this.state.currentSession = options.session;
    } else {
      this.state.currentSession = await this.sessionManager.createSession();
    }

    // 检测项目上下文
    const projectInfo = options.project
      ? await this.projectDetector.detect(options.project)
      : await this.projectDetector.detect(process.cwd());

    // 显示欢迎信息
    this.showWelcome(projectInfo);

    // 开始输入循环
    this.startInputLoop();
  }

  private showWelcome(projectInfo?: any): void {
    this.clearScreen();

    // 显示标题
    const title = this.config.emoji ? '🤖 ' : '';
    console.log(chalk.bold.blue(`${title}AICLI v2.0.0`));
    console.log(chalk.gray('AI 编程助手终端工具'));
    console.log('');

    // 显示会话信息
    console.log(chalk.white(`会话: ${this.state.currentSession.substring(0, 8)}...`));

    // 显示项目信息
    if (projectInfo) {
      console.log(chalk.white(`项目: ${projectInfo.type} (${projectInfo.language})`));
      console.log(chalk.gray(`路径: ${projectInfo.path}`));
    }

    console.log('');

    // 显示提示信息
    console.log(chalk.gray('输入消息开始对话，输入 /help 查看帮助。'));
    console.log(chalk.gray('按 Ctrl+C 退出，Ctrl+D 结束输入。'));
    console.log('');

    // 显示状态栏
    this.renderStatusBar();
  }

  private buildPrompt(): string {
    const theme = this.config.theme;

    if (theme === 'minimal') {
      return '> ';
    }

    // 智能提示符
    let prompt = '';

    if (this.state.isMultiline) {
      prompt += chalk.yellow('... ');
    } else {
      // 添加状态指示器
      if (this.config.emoji) {
        prompt += '💬 ';
      }

      prompt += chalk.green('> ');
    }

    return prompt;
  }

  private async handleLine(input: string): Promise<void> {
    try {
      await this.processInput(input.trim());
    } catch (error) {
      await this.outputManager.displayError(error instanceof Error ? error.message : '未知错误');
    }

    this.rl.prompt();
  }

  private async processInput(input: string): Promise<void> {
    // 空输入处理
    if (!input) {
      return;
    }

    // 多行输入处理
    if (this.state.isMultiline) {
      this.handleMultilineInput(input);
      return;
    }

    // 命令处理
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      return;
    }

    // 特殊命令处理
    if (input === 'exit' || input === 'quit') {
      this.handleExit();
      return;
    }

    // 添加到历史
    this.history.add(input);

    // 处理用户消息
    await this.handleUserMessage(input);
  }

  private async handleUserMessage(message: string): Promise<void> {
    // 显示用户输入
    await this.outputManager.displayUserInput(message);

    // 处理消息
    try {
      const response = await this.sessionManager.processMessage(
        this.state.currentSession,
        message
      );

      // 流式显示响应
      await this.outputManager.startStreamResponse(response.id, response.metadata);
      for (const chunk of response.chunks) {
        await this.outputManager.streamChunk(chunk);
      }
      await this.outputManager.endStreamResponse();
    } catch (error) {
      await this.outputManager.displayError(error instanceof Error ? error.message : '处理失败');
    }
  }

  private async handleCommand(input: string): Promise<void> {
    const command = input.slice(1);
    const [cmd, ...args] = command.split(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;

      case 'clear':
        this.clearScreen();
        break;

      case 'history':
        this.showHistory();
        break;

      case 'sessions':
        await this.showSessions();
        break;

      case 'new':
        await this.newSession();
        break;

      case 'save':
        await this.saveSession();
        break;

      case 'load':
        await this.loadSession(args[0]);
        break;

      case 'config':
        await this.showConfig();
        break;

      case 'theme':
        await this.changeTheme(args[0]);
        break;

      case 'multiline':
        this.toggleMultiline();
        break;

      case 'project':
        await this.showProjectInfo();
        break;

      case 'exit':
      case 'quit':
        this.handleExit();
        break;

      default:
        await this.outputManager.displayError(`未知命令: ${cmd}`);
        break;
    }
  }

  private showHelp(): void {
    const help = [
      chalk.bold('可用命令:'),
      '',
      chalk.white('  /help          - 显示此帮助信息'),
      chalk.white('  /clear         - 清空屏幕'),
      chalk.white('  /history       - 显示命令历史'),
      chalk.white('  /sessions      - 管理会话'),
      chalk.white('  /new           - 创建新会话'),
      chalk.white('  /save          - 保存当前会话'),
      chalk.white('  /load <id>     - 加载指定会话'),
      chalk.white('  /config        - 显示配置信息'),
      chalk.white('  /theme <name>  - 切换主题'),
      chalk.white('  /multiline     - 切换多行输入模式'),
      chalk.white('  /project       - 显示项目信息'),
      chalk.white('  /exit          - 退出程序'),
      '',
      chalk.gray('快捷键:'),
      chalk.gray('  Ctrl+C         - 中断当前操作'),
      chalk.gray('  Ctrl+D         - 结束多行输入/退出'),
      chalk.gray('  Ctrl+L         - 清空屏幕'),
      chalk.gray('  Tab            - 自动补全'),
      chalk.gray('  ↑/↓           - 浏览历史'),
      ''
    ];

    console.log(help.join('\n'));
  }

  private showHistory(): void {
    const history = this.history.getHistory();
    const display = history.slice(-10); // 显示最近10条

    console.log(chalk.bold('命令历史:'));
    console.log('');

    display.forEach((cmd, index) => {
      const num = chalk.gray(`${history.length - display.length + index + 1}.`);
      console.log(`${num} ${cmd}`);
    });

    console.log('');
    console.log(chalk.gray(`总计 ${history.length} 条历史记录。`));
  }

  private async showSessions(): Promise<void> {
    const sessions = await this.sessionManager.listSessions();

    console.log(chalk.bold('会话列表:'));
    console.log('');

    if (sessions.length === 0) {
      console.log(chalk.gray('没有找到会话。'));
      return;
    }

    sessions.forEach(session => {
      const id = chalk.gray(session.id.substring(0, 8) + '...');
      const time = chalk.gray(new Date(session.createdAt).toLocaleString());
      const messages = chalk.gray(`${session.messageCount} 条消息`);

      console.log(`${id} ${time} ${messages}`);
    });

    console.log('');
  }

  private async newSession(): Promise<void> {
    this.state.currentSession = await this.sessionManager.createSession();
    console.log(chalk.green(`新会话已创建: ${this.state.currentSession.substring(0, 8)}...`));
  }

  private async saveSession(): Promise<void> {
    await this.sessionManager.saveSession(this.state.currentSession);
    console.log(chalk.green('会话已保存。'));
  }

  private async loadSession(sessionId: string): Promise<void> {
    try {
      this.state.currentSession = await this.sessionManager.loadSession(sessionId);
      console.log(chalk.green(`会话已加载: ${this.state.currentSession.substring(0, 8)}...`));
    } catch (error) {
      await this.outputManager.displayError('加载会话失败');
    }
  }

  private async showConfig(): Promise<void> {
    const config = smartConfig.getAll();

    console.log(chalk.bold('当前配置:'));
    console.log('');

    Object.entries(config).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.log(chalk.white(`${key}:`));
        Object.entries(value).forEach(([subKey, subValue]) => {
          console.log(chalk.gray(`  ${subKey}: ${JSON.stringify(subValue)}`));
        });
      } else {
        console.log(chalk.white(`${key}: ${JSON.stringify(value)}`));
      }
    });
  }

  private async changeTheme(themeName: string): Promise<void> {
    const validThemes = ['auto', 'light', 'dark', 'minimal'];

    if (!validThemes.includes(themeName)) {
      await this.outputManager.displayError(`无效主题: ${themeName}`);
      return;
    }

    smartConfig.set('ui.theme', themeName);
    await smartConfig.save();

    this.config.theme = themeName as 'auto' | 'light' | 'dark' | 'minimal';
    this.rl.setPrompt(this.buildPrompt());

    console.log(chalk.green(`主题已切换为: ${themeName}`));
  }

  private toggleMultiline(): void {
    this.state.isMultiline = !this.state.isMultiline;

    if (this.state.isMultiline) {
      this.state.multilineBuffer = [];
      console.log(chalk.yellow('多行输入模式已启用，按 Ctrl+D 结束输入。'));
    } else {
      console.log(chalk.green('多行输入模式已禁用。'));
    }

    this.rl.setPrompt(this.buildPrompt());
  }

  private handleMultilineInput(input: string): void {
    this.state.multilineBuffer.push(input);
  }

  private async showProjectInfo(): Promise<void> {
    const projectInfo = await this.projectDetector.detect(process.cwd());

    if (!projectInfo) {
      console.log(chalk.gray('未检测到项目信息。'));
      return;
    }

    console.log(chalk.bold('项目信息:'));
    console.log('');
    console.log(chalk.white(`类型: ${projectInfo.type}`));
    console.log(chalk.white(`语言: ${projectInfo.language}`));
    console.log(chalk.white(`路径: ${projectInfo.path}`));
    console.log(chalk.white(`置信度: ${(projectInfo.confidence * 100).toFixed(1)}%`));

    if (projectInfo.framework) {
      console.log(chalk.white(`框架: ${projectInfo.framework}`));
    }
  }

  private handleKeypress(key: Buffer): void {
    // Tab 键处理
    if (key[0] === 9) {
      this.handleTab();
      return;
    }

    // Ctrl+C 处理
    if (key[0] === 3) {
      this.handleInterrupt();
      return;
    }

    // Ctrl+D 处理
    if (key[0] === 4) {
      if (this.state.isMultiline) {
        this.endMultiline();
      } else {
        this.handleExit();
      }
      return;
    }

    // Ctrl+L 处理
    if (key[0] === 12) {
      this.clearScreen();
      return;
    }

    // 上下箭头处理
    if (key[0] === 27 && key[1] === 91) {
      if (key[2] === 65) { // 上箭头
        this.handleUpArrow();
        return;
      } else if (key[2] === 66) { // 下箭头
        this.handleDownArrow();
        return;
      }
    }
  }

  private handleTab(): void {
    if (!this.config.smartSuggestions) return;

    const currentInput = this.state.inputBuffer;
    const suggestionsResult = this.completer.getSuggestions(currentInput);

    if (suggestionsResult.length > 0) {
      this.state.suggestions = suggestionsResult.map(s => s.suggestion);
      this.state.selectedSuggestion = 0;
      this.showSuggestions();
    }
  }

  private showSuggestions(): void {
    if (this.state.suggestions.length === 0) return;

    console.log('');
    console.log(chalk.gray('建议:'));
    this.state.suggestions.forEach((suggestion, index) => {
      const prefix = index === this.state.selectedSuggestion ? '> ' : '  ';
      const text = index === this.state.selectedSuggestion
        ? chalk.green(suggestion)
        : chalk.white(suggestion);
      console.log(prefix + text);
    });
    console.log('');
  }

  private handleUpArrow(): void {
    const history = this.history.getHistory();
    if (this.state.historyIndex < history.length - 1) {
      this.state.historyIndex++;
      this.state.inputBuffer = history[history.length - 1 - this.state.historyIndex];
      // Note: readline.line and cursor are read-only in newer Node.js versions
      // this.rl.line = this.state.inputBuffer;
      // this.rl.cursor = this.state.inputBuffer.length;
      // this.rl.refreshLine();
    }
  }

  private handleDownArrow(): void {
    const history = this.history.getHistory();
    if (this.state.historyIndex > 0) {
      this.state.historyIndex--;
      this.state.inputBuffer = history[history.length - 1 - this.state.historyIndex];
    } else {
      this.state.historyIndex = -1;
      this.state.inputBuffer = '';
    }

      // Note: readline.line and cursor are read-only in newer Node.js versions
    // this.rl.line = this.state.inputBuffer;
    // this.rl.cursor = this.state.inputBuffer.length;
    // this.rl.refreshLine();
  }

  private endMultiline(): void {
    this.state.isMultiline = false;
    const multilineText = this.state.multilineBuffer.join('\n');
    this.state.multilineBuffer = [];

    if (multilineText.trim()) {
      this.processInput(multilineText);
    }

    this.rl.setPrompt(this.buildPrompt());
  }

  private handleInterrupt(): void {
    if (this.state.isMultiline) {
      this.state.isMultiline = false;
      this.state.multilineBuffer = [];
      console.log(chalk.yellow('\\n多行输入已取消。'));
      this.rl.setPrompt(this.buildPrompt());
    } else {
      console.log(chalk.yellow('\\n操作已取消。'));
    }

    this.rl.prompt();
  }

  private handleClose(): void {
    this.handleExit();
  }

  private handleTerminate(): void {
    this.handleExit();
  }

  private handleExit(): void {
    if (this.config.autoSave) {
      this.sessionManager.saveSession(this.state.currentSession);
    }

    console.log(chalk.yellow('\\n👋 再见!'));
    this.cleanup();
    process.exit(0);
  }

  private handleResize(): void {
    this.clearScreen();
    this.renderStatusBar();
  }

  private clearScreen(): void {
    process.stdout.write('\\x1b[2J\\x1b[H');
  }

  private renderStatusBar(): void {
    const session = this.state.currentSession.substring(0, 8);
    const mode = this.state.isMultiline ? 'MULTILINE' : 'SINGLE';
    const theme = this.config.theme.toUpperCase();

    const status = `${session} | ${mode} | ${theme}`;
    const width = process.stdout.columns || 80;
    const padding = width - status.length - 2;

    if (padding > 0) {
      const statusBar = chalk.bgRgb(40, 44, 52)(chalk.white(` ${status}${' '.repeat(padding)} `));
      process.stdout.write(statusBar + '\\n');
    }
  }

  private startInputLoop(): void {
    this.rl.prompt();
  }

  private cleanup(): void {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }

    if (this.rl) {
      this.rl.close();
    }
  }
}