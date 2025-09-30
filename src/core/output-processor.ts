import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

export interface OutputOptions {
  enableColors?: boolean;
  enableMarkdown?: boolean;
  enableStreaming?: boolean;
  streamDelay?: number;
  maxLineWidth?: number;
}

export interface FormattedOutput {
  content: string;
  type: 'text' | 'markdown' | 'code' | 'error' | 'success' | 'warning';
  metadata?: Record<string, any>;
}

export class OutputProcessor {
  private options: Required<OutputOptions>;

  constructor(options: OutputOptions = {}) {
    this.options = {
      enableColors: options.enableColors ?? true,
      enableMarkdown: options.enableMarkdown ?? true,
      enableStreaming: options.enableStreaming ?? true,
      streamDelay: options.streamDelay ?? 10,
      maxLineWidth: options.maxLineWidth ?? (process.stdout.columns || 80),
      ...options
    };

    // 配置marked渲染器
    if (this.options.enableMarkdown) {
      marked.setOptions({
        renderer: new TerminalRenderer({
          code: chalk.gray,
          blockquote: chalk.yellow,
          html: chalk.gray,
          heading: chalk.bold.cyan,
          strong: chalk.bold,
          em: chalk.italic,
          del: chalk.strikethrough,
          link: chalk.blue,
          href: chalk.underline.blue
        }),
        breaks: false,
        gfm: true
      });
    }
  }

  /**
   * 处理格式化输出
   */
  public async process(output: FormattedOutput): Promise<void> {
    let processedContent = output.content;

    // 根据类型应用格式化
    switch (output.type) {
      case 'error':
        processedContent = this.formatError(processedContent);
        break;
      case 'success':
        processedContent = this.formatSuccess(processedContent);
        break;
      case 'warning':
        processedContent = this.formatWarning(processedContent);
        break;
      case 'code':
        processedContent = this.formatCode(processedContent);
        break;
      case 'markdown':
        processedContent = this.formatMarkdown(processedContent);
        break;
      case 'text':
      default:
        processedContent = this.formatText(processedContent);
        break;
    }

    // 处理换行和长度限制
    processedContent = this.wrapText(processedContent);

    // 流式输出或一次性输出
    if (this.options.enableStreaming && output.type !== 'error') {
      await this.streamOutput(processedContent);
    } else {
      process.stdout.write(processedContent + '\n');
    }
  }

  /**
   * 流式输出效果
   */
  private async streamOutput(content: string): Promise<void> {
    const words = content.split('');

    for (let i = 0; i < words.length; i++) {
      process.stdout.write(words[i]);
      await new Promise(resolve => setTimeout(resolve, this.options.streamDelay));
    }

    process.stdout.write('\n');
  }

  /**
   * 文本格式化
   */
  private formatText(content: string): string {
    return this.options.enableColors ? chalk.white(content) : content;
  }

  /**
   * Markdown格式化
   */
  private formatMarkdown(content: string): string {
    if (!this.options.enableMarkdown) {
      return this.formatText(content);
    }

    try {
      return marked(content) as string;
    } catch (error) {
      return this.formatError(`Markdown渲染失败: ${error}`);
    }
  }

  /**
   * 代码格式化
   */
  private formatCode(content: string): string {
    if (this.options.enableColors) {
      return chalk.gray(`\n${content}\n`);
    }
    return `\n${content}\n`;
  }

  /**
   * 错误信息格式化
   */
  private formatError(content: string): string {
    if (this.options.enableColors) {
      return chalk.red(`❌ ${content}`);
    }
    return `❌ ${content}`;
  }

  /**
   * 成功信息格式化
   */
  private formatSuccess(content: string): string {
    if (this.options.enableColors) {
      return chalk.green(`✅ ${content}`);
    }
    return `✅ ${content}`;
  }

  /**
   * 警告信息格式化
   */
  private formatWarning(content: string): string {
    if (this.options.enableColors) {
      return chalk.yellow(`⚠️  ${content}`);
    }
    return `⚠️  ${content}`;
  }

  /**
   * 文本换行处理
   */
  private wrapText(content: string): string {
    if (!this.options.maxLineWidth) {
      return content;
    }

    const lines = content.split('\n');
    const wrappedLines: string[] = [];

    for (const line of lines) {
      if (line.length <= this.options.maxLineWidth) {
        wrappedLines.push(line);
      } else {
        // 简单的单词边界换行
        const words = line.split(' ');
        let currentLine = '';

        for (const word of words) {
          if ((currentLine + word).length <= this.options.maxLineWidth) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) {
              wrappedLines.push(currentLine);
            }
            currentLine = word;
          }
        }

        if (currentLine) {
          wrappedLines.push(currentLine);
        }
      }
    }

    return wrappedLines.join('\n');
  }

  /**
   * 创建进度条
   */
  public createProgressBar(total: number, options: {
    title?: string;
    width?: number;
    completeChar?: string;
    incompleteChar?: string;
  } = {}): (current: number) => void {
    const {
      title = '进度',
      width = 30,
      completeChar = '=',
      incompleteChar = '-'
    } = options;

    return (current: number) => {
      const percentage = Math.min(current / total, 1);
      const completedWidth = Math.floor(width * percentage);
      const incompleteWidth = width - completedWidth;

      const progressBar = chalk.green(completeChar.repeat(completedWidth)) +
                         chalk.gray(incompleteChar.repeat(incompleteWidth));

      const percentageText = chalk.bold(`${Math.round(percentage * 100)}%`);

      // 清除当前行并移动到行首
      process.stdout.write('\r\x1b[K');

      process.stdout.write(`${title}: [${progressBar}] ${percentageText}`);

      if (current >= total) {
        process.stdout.write('\n');
      }
    };
  }

  /**
   * 创建表格输出
   */
  public createTable(headers: string[], rows: string[][]): string {
    if (headers.length === 0 || rows.length === 0) {
      return '';
    }

    // 计算每列最大宽度
    const colWidths = headers.map((header, index) => {
      const maxContentWidth = Math.max(
        header.length,
        ...rows.map(row => (row[index] || '').length)
      );
      return maxContentWidth + 2; // 加上边距
    });

    // 构建表格
    let table = '';

    // 表头
    table += chalk.bold.cyan(
      headers.map((header, index) => header.padEnd(colWidths[index])).join('│')
    ) + '\n';

    // 分隔线
    table += chalk.gray(
      colWidths.map(width => '─'.repeat(width)).join('┼')
    ) + '\n';

    // 数据行
    rows.forEach(row => {
      table += chalk.white(
        row.map((cell, index) => (cell || '').padEnd(colWidths[index])).join('│')
      ) + '\n';
    });

    return table;
  }

  /**
   * 显示加载动画
   */
  public showSpinner(text: string = '加载中...'): () => void {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let interval: NodeJS.Timeout;

    const spinner = () => {
      process.stdout.write('\r\x1b[K'); // 清除当前行
      process.stdout.write(chalk.yellow(`${frames[frameIndex]} ${text}`));
      frameIndex = (frameIndex + 1) % frames.length;
    };

    interval = setInterval(spinner, 100);

    return () => {
      clearInterval(interval);
      process.stdout.write('\r\x1b[K'); // 清除spinner
    };
  }

  /**
   * 清除终端行
   */
  public clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * 移动光标到行首
   */
  public moveToLineStart(): void {
    process.stdout.write('\r');
  }

  /**
   * 设置输出选项
   */
  public setOptions(options: Partial<OutputOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取当前输出选项
   */
  public getOptions(): OutputOptions {
    return { ...this.options };
  }
}