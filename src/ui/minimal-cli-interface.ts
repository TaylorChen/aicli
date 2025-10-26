/**
 * 极简CLI界面
 * 参考Claude CLI的简洁设计理念
 * - 极简主义：最小化视觉元素
 * - 一致性：统一的颜色、图标、布局
 * - 响应式：自适应终端大小
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { EnhancedVimMode } from '../core/enhanced-vim-mode';

export interface MinimalCLIOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  enableVim?: boolean;
  enableStreaming?: boolean;
  verbose?: boolean;
}

export class MinimalCLIInterface {
  private rl: readline.Interface | null = null;
  private options: Required<MinimalCLIOptions>;
  private vimMode: EnhancedVimMode | null = null;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private isProcessing = false;
  private attachments: Array<{ path: string; type: string; name: string }> = [];

  constructor(options: MinimalCLIOptions = {}) {
    this.options = {
      provider: options.provider || 'deepseek',
      model: options.model || 'deepseek-chat',
      apiKey: options.apiKey || '',
      enableVim: options.enableVim !== false,
      enableStreaming: options.enableStreaming !== false,
      verbose: options.verbose || false,
    };
  }

  /**
   * 启动界面
   */
  public async start(): Promise<void> {
    this.showWelcome();
    this.setupReadline();
    this.startInputLoop();
  }

  /**
   * 显示欢迎信息 - 极简版
   */
  private showWelcome(): void {
    console.clear();
    console.log(chalk.cyan('\nAICLI\n'));
    console.log(chalk.gray(`Model: ${this.options.provider}/${this.options.model}`));
    console.log(chalk.gray(`\nType your message to start. Type /help for commands, Ctrl+C to exit.\n`));
  }

  /**
   * 设置Readline接口
   */
  private setupReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.gray('❯ '),
      historySize: 100,
      removeHistoryDuplicates: true,
    });

    // 启用自动补全
    this.rl.on('line', (line) => this.handleInput(line.trim()));
    
    // 处理Ctrl+C
    this.rl.on('SIGINT', () => {
      if (this.isProcessing) {
        console.log(chalk.yellow('\n⚠ Interrupted'));
        this.isProcessing = false;
        this.rl?.prompt();
      } else {
        this.handleExit();
      }
    });

    // 处理Ctrl+D
    this.rl.on('close', () => {
      this.handleExit();
    });
  }

  /**
   * 开始输入循环
   */
  private startInputLoop(): void {
    this.rl?.prompt();
  }

  /**
   * 处理用户输入
   */
  private async handleInput(input: string): Promise<void> {
    if (!input) {
      this.rl?.prompt();
      return;
    }

    // 检查是否是文件路径（拖拽文件）
    if (await this.isFilePath(input)) {
      await this.handleFileDrop(input);
      this.rl?.prompt();
      return;
    }

    // 处理斜杠命令
    if (input.startsWith('/') && !input.startsWith('//')) {
      await this.handleCommand(input);
      this.rl?.prompt();
      return;
    }

    // 处理普通消息
    await this.handleMessage(input);
    this.rl?.prompt();
  }

  /**
   * 检查是否是有效的文件路径
   */
  private async isFilePath(input: string): Promise<boolean> {
    // 去除前后空格
    const trimmed = input.trim();
    
    // 检查是否看起来像文件路径
    if (!trimmed.includes('/') && !trimmed.includes('\\')) {
      return false;
    }

    // 检查文件是否存在
    try {
      const stats = await fs.promises.stat(trimmed);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 处理文件拖拽
   */
  private async handleFileDrop(filePath: string): Promise<void> {
    const trimmed = filePath.trim();
    
    try {
      const stats = await fs.promises.stat(trimmed);
      const ext = path.extname(trimmed).toLowerCase();
      const name = path.basename(trimmed);
      
      // 判断文件类型
      let fileType = 'document';
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
        fileType = 'image';
      } else if (['.pdf'].includes(ext)) {
        fileType = 'pdf';
      } else if (['.txt', '.md', '.json', '.xml', '.yaml', '.yml'].includes(ext)) {
        fileType = 'text';
      } else if (['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rs'].includes(ext)) {
        fileType = 'code';
      }

      // 添加到附件列表
      this.attachments.push({
        path: trimmed,
        type: fileType,
        name: name,
      });

      // 显示成功消息
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(chalk.green(`\n✓ 已添加${fileType === 'image' ? '图片' : '文件'}: ${name}`));
      console.log(chalk.gray(`  路径: ${trimmed}`));
      console.log(chalk.gray(`  大小: ${sizeInMB}MB`));
      console.log(chalk.gray(`  类型: ${fileType}`));
      console.log(chalk.cyan(`\n💡 提示: 发送消息时将自动包含此${fileType === 'image' ? '图片' : '文件'}\n`));
      
    } catch (error) {
      console.log(chalk.red(`\n✗ 无法读取文件: ${trimmed}`));
      console.log(chalk.gray(`  错误: ${error instanceof Error ? error.message : '未知错误'}\n`));
    }
  }

  /**
   * 处理斜杠命令
   */
  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd) {
      case 'help':
      case 'h':
        this.showHelp();
        break;

      case 'vim':
        await this.enterVimMode();
        break;

      case 'clear':
      case 'c':
        console.clear();
        this.showWelcome();
        break;

      case 'attachments':
      case 'att':
        this.showAttachments();
        break;

      case 'remove':
      case 'rm':
        if (args.length > 0) {
          this.removeAttachment(parseInt(args[0]));
        } else {
          console.log(chalk.red('✗ 请指定要删除的附件编号'));
          console.log(chalk.gray('  用法: /remove <编号>'));
        }
        break;

      case 'clear-attachments':
        this.clearAttachments();
        break;

      case 'history':
        this.showHistory();
        break;

      case 'model':
        if (args.length > 0) {
          this.options.model = args.join(' ');
          console.log(chalk.green(`✓ Switched to ${this.options.model}`));
        } else {
          console.log(chalk.gray(`Current model: ${this.options.model}`));
        }
        break;

      case 'provider':
        if (args.length > 0) {
          this.options.provider = args[0];
          console.log(chalk.green(`✓ Switched to ${this.options.provider}`));
        } else {
          console.log(chalk.gray(`Current provider: ${this.options.provider}`));
        }
        break;

      case 'status':
      case 'st':
        this.showStatus();
        break;

      case 'reset':
        this.conversationHistory = [];
        console.log(chalk.green('✓ Conversation reset'));
        break;

      case 'exit':
      case 'quit':
      case 'q':
        this.handleExit();
        break;

      default:
        console.log(chalk.red(`✗ Unknown command: /${cmd}`));
        console.log(chalk.gray('Type /help for available commands'));
    }
  }

  /**
   * 显示帮助信息 - 极简版
   */
  private showHelp(): void {
    console.log(chalk.white('\nCommands:'));
    console.log(chalk.gray('  /help, /h             ') + 'Show this help');
    console.log(chalk.gray('  /vim                  ') + 'Enter Vim mode');
    console.log(chalk.gray('  /clear, /c            ') + 'Clear screen');
    console.log(chalk.gray('  /attachments, /att    ') + 'Show attachments');
    console.log(chalk.gray('  /remove <n>, /rm <n>  ') + 'Remove attachment');
    console.log(chalk.gray('  /clear-attachments    ') + 'Clear all attachments');
    console.log(chalk.gray('  /history              ') + 'Show conversation');
    console.log(chalk.gray('  /model [name]         ') + 'View/change model');
    console.log(chalk.gray('  /provider [name]      ') + 'View/change provider');
    console.log(chalk.gray('  /status               ') + 'Show system status');
    console.log(chalk.gray('  /reset                ') + 'Reset conversation');
    console.log(chalk.gray('  /quit, /q             ') + 'Exit');
    console.log(chalk.white('\nFile Operations:'));
    console.log(chalk.gray('  Drag & Drop           ') + 'Drag files/images into terminal');
    console.log(chalk.gray('  Paste (Ctrl+V)        ') + 'Paste clipboard content\n');
  }

  /**
   * 显示附件列表
   */
  private showAttachments(): void {
    if (this.attachments.length === 0) {
      console.log(chalk.yellow('\n⚠ 无附件\n'));
      return;
    }

    console.log(chalk.white(`\n📎 附件列表 (${this.attachments.length}个)\n`));
    this.attachments.forEach((att, index) => {
      const icon = att.type === 'image' ? '🖼️' : '📄';
      console.log(`${chalk.cyan((index + 1) + '.')} ${icon} ${chalk.white(att.name)}`);
      console.log(`   ${chalk.gray('类型: ' + att.type + '  路径: ' + att.path)}\n`);
    });
  }

  /**
   * 删除附件
   */
  private removeAttachment(index: number): void {
    if (index < 1 || index > this.attachments.length) {
      console.log(chalk.red(`✗ 无效的附件编号: ${index}`));
      return;
    }

    const removed = this.attachments.splice(index - 1, 1)[0];
    console.log(chalk.green(`✓ 已删除附件: ${removed.name}`));
  }

  /**
   * 清空所有附件
   */
  private clearAttachments(): void {
    const count = this.attachments.length;
    this.attachments = [];
    console.log(chalk.green(`✓ 已清空 ${count} 个附件`));
  }

  /**
   * 显示状态信息
   */
  private showStatus(): void {
    console.log(chalk.white('\nStatus:'));
    console.log(chalk.gray('  Provider:    ') + chalk.cyan(this.options.provider));
    console.log(chalk.gray('  Model:       ') + chalk.cyan(this.options.model));
    console.log(chalk.gray('  API Key:     ') + (this.options.apiKey ? chalk.green('✓ Set') : chalk.red('✗ Not set')));
    console.log(chalk.gray('  Messages:    ') + chalk.cyan(this.conversationHistory.length.toString()));
    console.log(chalk.gray('  Attachments: ') + chalk.cyan(this.attachments.length.toString()));
    console.log(chalk.gray('  Streaming:   ') + (this.options.enableStreaming ? chalk.green('✓ On') : chalk.gray('✗ Off')));
    console.log(chalk.gray('  Vim mode:    ') + (this.options.enableVim ? chalk.green('✓ Available') : chalk.gray('✗ Disabled')));
    console.log('');
  }

  /**
   * 显示对话历史
   */
  private showHistory(): void {
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray('\nNo conversation history\n'));
      return;
    }

    console.log(chalk.white('\nConversation:\n'));
    this.conversationHistory.forEach((msg, index) => {
      const icon = msg.role === 'user' ? '❯' : '◆';
      const color = msg.role === 'user' ? chalk.gray : chalk.cyan;
      
      // 截断长消息
      const preview = msg.content.length > 100 
        ? msg.content.substring(0, 100) + '...'
        : msg.content;
      
      console.log(color(`${icon} ${preview}`));
      if (index < this.conversationHistory.length - 1) {
        console.log('');
      }
    });
    console.log('');
  }

  /**
   * 处理消息
   */
  private async handleMessage(message: string): Promise<void> {
    // 构建完整消息（包含附件信息）
    let fullMessage = message;
    if (this.attachments.length > 0) {
      fullMessage += '\n\n[附件]:';
      this.attachments.forEach((att, index) => {
        fullMessage += `\n${index + 1}. ${att.name} (${att.type})`;
      });
    }

    // 添加到历史
    this.conversationHistory.push({
      role: 'user',
      content: fullMessage,
    });

    // 显示用户消息
    console.log('');
    if (this.attachments.length > 0) {
      console.log(chalk.gray(`[包含 ${this.attachments.length} 个附件]`));
    }

    // 模拟AI响应（实际应该调用AI服务）
    this.isProcessing = true;
    console.log(chalk.cyan('◆ '));
    
    try {
      // 这里应该调用实际的AI服务
      // 临时模拟响应
      await this.simulateAIResponse(message);
      
      // 发送后清空附件（可选）
      // this.attachments = [];
      
    } catch (error) {
      console.log(chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    } finally {
      this.isProcessing = false;
      console.log('\n');
    }
  }

  /**
   * 模拟AI响应（临时）
   */
  private async simulateAIResponse(message: string): Promise<void> {
    const response = `I received your message: "${message}". This is a placeholder response. The actual AI integration will be added soon.`;
    
    // 模拟流式输出
    for (const char of response) {
      process.stdout.write(char);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    this.conversationHistory.push({
      role: 'assistant',
      content: response,
    });
  }

  /**
   * 进入Vim模式
   */
  private async enterVimMode(): Promise<void> {
    if (!this.options.enableVim) {
      console.log(chalk.red('✗ Vim mode is disabled'));
      return;
    }

    console.log(chalk.cyan('\nEntering Vim mode...'));
    console.log(chalk.gray('ESC to normal mode, :q to exit, :wq to save and exit\n'));

    return new Promise((resolve) => {
      this.vimMode = new EnhancedVimMode(
        (text) => {
          // 保存文本
          this.handleMessage(text).then(() => {
            this.vimMode = null;
            resolve();
          });
        },
        () => {
          // 取消
          console.log(chalk.yellow('\nVim mode cancelled'));
          this.vimMode = null;
          resolve();
        }
      );

      this.vimMode.start();
    });
  }

  /**
   * 处理退出
   */
  private handleExit(): void {
    console.log(chalk.gray('\nGoodbye!\n'));
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }

  /**
   * 停止界面
   */
  public stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.vimMode) {
      this.vimMode.stop();
      this.vimMode = null;
    }
  }
}

/**
 * 创建并启动极简CLI界面
 */
export async function startMinimalCLI(options?: MinimalCLIOptions): Promise<void> {
  const cli = new MinimalCLIInterface(options);
  await cli.start();
}

