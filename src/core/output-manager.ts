import chalk from 'chalk';
import { EventEmitter } from 'events';
import { smartConfig } from './smart-config';
import { SyntaxHighlighter } from './syntax-highlighter';

export interface OutputConfig {
  colors: boolean;
  emoji: boolean;
  syntaxHighlighting: boolean;
  maxOutputLines: number;
  streaming: boolean;
  theme: string;
  verbose: boolean;
  showTimestamps: boolean;
  showThinking: boolean;
}

export interface MessageChunk {
  type: 'text' | 'code' | 'tool' | 'error' | 'thinking';
  content: string;
  metadata?: {
    language?: string;
    toolName?: string;
    timestamp?: Date;
    confidence?: number;
  };
}

export interface StreamResponse {
  id: string;
  chunks: MessageChunk[];
  isComplete: boolean;
  metadata?: {
    model?: string;
    provider?: string;
    usage?: any;
    timing?: number;
  };
}

export class OutputManager extends EventEmitter {
  private config: OutputConfig;
  private highlighter: SyntaxHighlighter;
  private buffer: string[] = [];
  private isStreaming: boolean = false;
  private currentResponse: StreamResponse | null = null;
  private startTime: number = 0;
  private lineCount: number = 0;

  constructor(config?: Partial<OutputConfig>) {
    super();
    this.config = this.loadConfig(config);
    this.highlighter = new SyntaxHighlighter({
      enabled: this.config.syntaxHighlighting,
      theme: this.config.theme as any,
      languages: ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'],
      maxLineLength: 1000
    });

    this.setupEventListeners();
  }

  private loadConfig(userConfig?: Partial<OutputConfig>): OutputConfig {
    const baseConfig: OutputConfig = {
      colors: smartConfig.getWithDefault('ui.colors', true),
      emoji: smartConfig.getWithDefault('ui.emoji', true),
      syntaxHighlighting: smartConfig.getWithDefault('ui.syntaxHighlighting', true),
      maxOutputLines: smartConfig.getWithDefault('ui.maxOutputLines', 1000),
      streaming: smartConfig.getWithDefault('behavior.streaming', true),
      theme: smartConfig.getWithDefault('ui.theme', 'auto'),
      verbose: smartConfig.getWithDefault('behavior.verbose', false),
      showTimestamps: smartConfig.getWithDefault('ui.showTimestamps', false),
      showThinking: smartConfig.getWithDefault('ui.showThinking', false)
    };

    return { ...baseConfig, ...userConfig };
  }

  private setupEventListeners(): void {
    // 监听配置变化
    smartConfig.on('change', (key: string, value: any) => {
      this.updateConfig(key, value);
    });

    // 监听窗口大小变化
    process.stdout.on('resize', () => {
      this.handleResize();
    });
  }

  private updateConfig(key: string, value: any): void {
    const configMapping: Record<string, keyof OutputConfig> = {
      'ui.colors': 'colors',
      'ui.emoji': 'emoji',
      'ui.syntaxHighlighting': 'syntaxHighlighting',
      'ui.maxOutputLines': 'maxOutputLines',
      'behavior.streaming': 'streaming',
      'ui.theme': 'theme',
      'behavior.verbose': 'verbose',
      'ui.showTimestamps': 'showTimestamps',
      'ui.showThinking': 'showThinking'
    };

    const configKey = configMapping[key];
    if (configKey) {
      (this.config as any)[configKey] = value;
    }
  }

  private handleResize(): void {
    // 窗口大小变化时的处理逻辑
    if (this.isStreaming) {
      this.redrawCurrentOutput();
    }
  }

  // 显示用户输入
  async displayUserInput(input: string): Promise<void> {
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    const prefix = this.config.emoji ? '👤 ' : '';

    const formattedInput = this.formatUserInput(input);

    if (this.config.colors) {
      process.stdout.write(chalk.gray(`${timestamp}${prefix}用户: ${formattedInput}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}用户: ${formattedInput}\n`);
    }

    this.lineCount += 1;
  }

  private formatUserInput(input: string): string {
    // 简单的用户输入格式化
    return input.trim();
  }

  // 开始流式响应
  async startStreamResponse(responseId: string, metadata?: any): Promise<void> {
    this.isStreaming = true;
    this.startTime = Date.now();
    this.lineCount = 0;

    this.currentResponse = {
      id: responseId,
      chunks: [],
      isComplete: false,
      metadata
    };

    if (this.config.showThinking) {
      await this.displayThinking('正在思考...');
    }

    this.emit('streamStart', { responseId, metadata });
  }

  // 流式显示响应
  async streamChunk(chunk: MessageChunk): Promise<void> {
    if (!this.currentResponse || !this.isStreaming) return;

    this.currentResponse.chunks.push(chunk);

    switch (chunk.type) {
      case 'text':
        await this.displayTextChunk(chunk.content);
        break;
      case 'code':
        await this.displayCodeChunk(chunk.content, chunk.metadata?.language);
        break;
      case 'tool':
        await this.displayToolChunk(chunk.content, chunk.metadata?.toolName);
        break;
      case 'error':
        await this.displayErrorChunk(chunk.content);
        break;
      case 'thinking':
        await this.displayThinking(chunk.content);
        break;
    }

    this.emit('streamChunk', chunk);
  }

  private async displayTextChunk(content: string): Promise<void> {
    if (this.config.colors) {
      process.stdout.write(chalk.white(content));
    } else {
      process.stdout.write(content);
    }

    this.lineCount += this.countLines(content);
  }

  private async displayCodeChunk(content: string, language?: string): Promise<void> {
    const highlighted = this.highlighter.highlight(content, language);

    if (this.config.colors) {
      process.stdout.write(chalk.gray('```' + (language || '') + '\n'));
      process.stdout.write(highlighted);
      process.stdout.write(chalk.gray('\n```\n'));
    } else {
      process.stdout.write('```' + (language || '') + '\n');
      process.stdout.write(highlighted);
      process.stdout.write('\n```\n');
    }

    this.lineCount += this.countLines(content) + 2;
  }

  private async displayToolChunk(content: string, toolName?: string): Promise<void> {
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    const prefix = this.config.emoji ? '🔧 ' : '';
    const toolDisplay = toolName ? `[${toolName}]` : '[工具]';

    if (this.config.colors) {
      process.stdout.write(chalk.cyan(`${timestamp}${prefix}${toolDisplay}: ${content}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}${toolDisplay}: ${content}\n`);
    }

    this.lineCount += 1;
  }

  private async displayErrorChunk(content: string): Promise<void> {
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    const prefix = this.config.emoji ? '❌ ' : '';

    if (this.config.colors) {
      process.stdout.write(chalk.red(`${timestamp}${prefix}错误: ${content}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}错误: ${content}`);
    }

    this.lineCount += 1;
  }

  private async displayThinking(content: string): Promise<void> {
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    const prefix = this.config.emoji ? '🤔 ' : '';

    if (this.config.colors) {
      process.stdout.write(chalk.gray.dim(`${timestamp}${prefix}${content}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}${content}\n`);
    }

    this.lineCount += 1;
  }

  // 结束流式响应
  async endStreamResponse(): Promise<void> {
    if (!this.currentResponse) return;

    this.isStreaming = false;
    this.currentResponse.isComplete = true;

    if (this.currentResponse.metadata) {
      this.currentResponse.metadata.timing = Date.now() - this.startTime;
    }

    // 显示响应元信息（如果配置为详细模式）
    if (this.config.verbose && this.currentResponse.metadata) {
      await this.displayResponseMetadata(this.currentResponse.metadata);
    }

    process.stdout.write('\n'); // 响应结束后的空行
    this.lineCount += 1;

    this.emit('streamEnd', this.currentResponse);
    this.currentResponse = null;
  }

  private async displayResponseMetadata(metadata: any): Promise<void> {
    const timestamp = this.getTimestamp();
    const prefix = this.config.emoji ? '📊 ' : '';

    let metaText = `${timestamp}${prefix}响应信息: `;
    if (metadata.model) metaText += `模型: ${metadata.model} `;
    if (metadata.provider) metaText += `提供商: ${metadata.provider} `;
    if (metadata.timing) metaText += `耗时: ${metadata.timing}ms `;
    if (metadata.usage) metaText += `使用量: ${JSON.stringify(metadata.usage)}`;

    if (this.config.colors) {
      process.stdout.write(chalk.gray.dim(metaText + '\n'));
    } else {
      process.stdout.write(metaText + '\n');
    }

    this.lineCount += 1;
  }

  // 显示错误信息
  async displayError(error: string | Error): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    const prefix = this.config.emoji ? '❌ ' : '';

    if (this.config.colors) {
      process.stdout.write(chalk.red(`${timestamp}${prefix}错误: ${errorMessage}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}错误: ${errorMessage}\n`);
    }

    this.lineCount += 1;
  }

  // 显示系统信息
  async displaySystem(message: string, type: 'info' | 'warning' | 'success' = 'info'): Promise<void> {
    const timestamp = this.config.showTimestamps ? this.getTimestamp() : '';
    let prefix = '';
    let color: any = chalk.white;

    switch (type) {
      case 'info':
        prefix = this.config.emoji ? 'ℹ️ ' : '';
        color = chalk.blue;
        break;
      case 'warning':
        prefix = this.config.emoji ? '⚠️ ' : '';
        color = chalk.yellow;
        break;
      case 'success':
        prefix = this.config.emoji ? '✅ ' : '';
        color = chalk.green;
        break;
    }

    if (this.config.colors) {
      process.stdout.write(color(`${timestamp}${prefix}${message}\n`));
    } else {
      process.stdout.write(`${timestamp}${prefix}${message}\n`);
    }

    this.lineCount += 1;
  }

  // 清空输出区域
  clearOutput(): void {
    this.buffer = [];
    this.lineCount = 0;
    process.stdout.write('\x1b[2J\x1b[H');
  }

  // 重绘当前输出
  private redrawCurrentOutput(): void {
    if (!this.currentResponse) return;

    // 重新显示所有chunks
    for (const chunk of this.currentResponse.chunks) {
      // 这里可以实现更复杂的重绘逻辑
    }
  }

  // 获取时间戳
  private getTimestamp(): string {
    const now = new Date();
    return chalk.gray(`[${now.toLocaleTimeString()}] `);
  }

  // 计算行数
  private countLines(text: string): number {
    return text.split('\n').length;
  }

  // 获取统计信息
  getStatistics(): {
    currentResponseId: string | null;
    isStreaming: boolean;
    lineCount: number;
    bufferLength: number;
    config: OutputConfig;
  } {
    return {
      currentResponseId: this.currentResponse?.id || null,
      isStreaming: this.isStreaming,
      lineCount: this.lineCount,
      bufferLength: this.buffer.length,
      config: { ...this.config }
    };
  }

  // 更新配置 (外部调用)
  updateExternalConfig(newConfig: Partial<OutputConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 更新highlighter配置
    this.highlighter.updateConfig({
      enabled: this.config.syntaxHighlighting,
      theme: this.config.theme as any
    });
  }

  // 中断当前流
  interruptStream(): void {
    if (this.isStreaming) {
      this.isStreaming = false;
      if (this.currentResponse) {
        this.currentResponse.isComplete = false;
      }
      this.emit('streamInterrupted');
    }
  }

  // 检查是否需要分页
  private needsPagination(): boolean {
    return this.lineCount > this.config.maxOutputLines;
  }

  // 分页显示
  async paginateOutput(): Promise<void> {
    if (!this.needsPagination()) return;

    const message = `输出已达到最大行数限制 (${this.config.maxOutputLines})。按 Enter 继续查看更多...`;

    if (this.config.colors) {
      process.stdout.write(chalk.yellow(message));
    } else {
      process.stdout.write(message);
    }

    // 等待用户输入
    await this.waitForEnter();

    this.lineCount = 0; // 重置行数计数器
  }

  private async waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      const originalRaw = stdin.isRaw;

      if (!stdin.isTTY) {
        resolve();
        return;
      }

      stdin.setRawMode(true);
      stdin.resume();

      const onData = (data: Buffer) => {
        if (data[0] === 13) { // Enter键
          stdin.setRawMode(originalRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          resolve();
        }
      };

      stdin.on('data', onData);
    });
  }

  // 获取当前响应
  getCurrentResponse(): StreamResponse | null {
    return this.currentResponse;
  }

  // 检查是否正在流式传输
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }
}