import chalk from 'chalk';
import { DragState } from './enhanced-drag-handler';

export interface IndicatorStyle {
  enabled: boolean;
  position: 'top' | 'bottom' | 'inline';
  color: 'cyan' | 'blue' | 'magenta' | 'green';
  showProgress: boolean;
  showFileCount: boolean;
  showTimer: boolean;
  animation: boolean;
}

export interface IndicatorState {
  visible: boolean;
  message: string;
  progress: number;
  fileCount: number;
  startTime: number;
  animationFrame: number;
}

export class DragIndicator {
  private style: IndicatorStyle;
  private state: IndicatorState;
  private animationInterval: NodeJS.Timeout | null = null;
  private lastLineLength: number = 0;

  constructor(style: Partial<IndicatorStyle> = {}) {
    this.style = {
      enabled: style.enabled !== false,
      position: style.position || 'top',
      color: style.color || 'cyan',
      showProgress: style.showProgress !== false,
      showFileCount: style.showFileCount !== false,
      showTimer: style.showTimer !== false,
      animation: style.animation !== false
    };

    this.state = {
      visible: false,
      message: '',
      progress: 0,
      fileCount: 0,
      startTime: 0,
      animationFrame: 0
    };
  }

  public show(message: string, fileCount: number = 0): void {
    if (!this.style.enabled) return;

    this.state.visible = true;
    this.state.message = message;
    this.state.fileCount = fileCount;
    this.state.startTime = Date.now();

    if (this.style.animation) {
      this.startAnimation();
    }

    this.render();
  }

  public update(message: string, progress: number = 0, fileCount: number = 0): void {
    if (!this.state.visible || !this.style.enabled) return;

    this.state.message = message;
    this.state.progress = progress;
    this.state.fileCount = fileCount;

    this.render();
  }

  public hide(): void {
    if (!this.state.visible) return;

    this.state.visible = false;
    this.stopAnimation();

    // 清除指示器显示
    this.clearDisplay();
  }

  public updateFromDragState(dragState: DragState): void {
    if (!this.style.enabled) return;

    if (dragState.isDragging) {
      const elapsed = Date.now() - dragState.lastDragTime;
      const message = this.generateDragMessage(dragState, elapsed);
      this.show(message, dragState.hoveredFiles.length);
    } else {
      this.hide();
    }
  }

  private generateDragMessage(dragState: DragState, elapsed: number): string {
    let message = '🎯 拖拽文件中...';

    if (this.style.showTimer) {
      const seconds = Math.floor(elapsed / 1000);
      message += ` (${seconds}s)`;
    }

    if (this.style.showFileCount && dragState.hoveredFiles.length > 0) {
      message += ` [${dragState.hoveredFiles.length} 个文件]`;
    }

    return message;
  }

  private render(): void {
    if (!this.state.visible) return;

    const output = this.formatOutput();

    switch (this.style.position) {
      case 'top':
        this.renderTop(output);
        break;
      case 'bottom':
        this.renderBottom(output);
        break;
      case 'inline':
        this.renderInline(output);
        break;
    }
  }

  private formatOutput(): string {
    let output = this.state.message;

    // 添加颜色
    switch (this.style.color) {
      case 'cyan':
        output = chalk.cyan(output);
        break;
      case 'blue':
        output = chalk.blue(output);
        break;
      case 'magenta':
        output = chalk.magenta(output);
        break;
      case 'green':
        output = chalk.green(output);
        break;
    }

    // 添加进度条
    if (this.style.showProgress && this.state.progress > 0) {
      const progressBar = this.createProgressBar(this.state.progress);
      output += ` ${progressBar}`;
    }

    // 添加动画
    if (this.style.animation) {
      const spinner = this.createSpinner();
      output = `${spinner} ${output}`;
    }

    return output;
  }

  private createProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.floor(width * progress / 100);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
  }

  private createSpinner(): string {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    return spinners[this.state.animationFrame % spinners.length];
  }

  private renderTop(output: string): void {
    // 在顶部显示指示器
    process.stdout.write('\x1b[s'); // 保存光标位置
    process.stdout.write('\x1b[H'); // 移动到顶部
    process.stdout.write('\x1b[K'); // 清除行
    process.stdout.write(output);
    process.stdout.write('\x1b[u'); // 恢复光标位置
  }

  private renderBottom(output: string): void {
    // 在底部显示指示器
    const terminalHeight = process.stdout.rows || 24;

    process.stdout.write('\x1b[s'); // 保存光标位置
    process.stdout.write(`\x1b[${terminalHeight}H`); // 移动到底部
    process.stdout.write('\x1b[K'); // 清除行
    process.stdout.write(output);
    process.stdout.write('\x1b[u'); // 恢复光标位置
  }

  private renderInline(output: string): void {
    // 内联显示，覆盖当前行
    const padding = Math.max(0, this.lastLineLength - output.length);
    const paddedOutput = output + ' '.repeat(padding);

    process.stdout.write(`\r${paddedOutput}`);
    this.lastLineLength = output.length;
  }

  private clearDisplay(): void {
    // 清除指示器显示
    switch (this.style.position) {
      case 'inline':
        process.stdout.write(`\r${' '.repeat(this.lastLineLength)}\r`);
        this.lastLineLength = 0;
        break;
      case 'top':
        process.stdout.write('\x1b[s\x1b[H\x1b[K\x1b[u');
        break;
      case 'bottom':
        const terminalHeight = process.stdout.rows || 24;
        process.stdout.write(`\x1b[s\x1b[${terminalHeight}H\x1b[K\x1b[u`);
        break;
    }
  }

  private startAnimation(): void {
    if (this.animationInterval) return;

    this.animationInterval = setInterval(() => {
      this.state.animationFrame++;
      this.render();
    }, 100);
  }

  private stopAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    this.state.animationFrame = 0;
  }

  // 预设样式
  public static getMinimalStyle(): IndicatorStyle {
    return {
      enabled: true,
      position: 'inline',
      color: 'cyan',
      showProgress: false,
      showFileCount: true,
      showTimer: false,
      animation: false
    };
  }

  public static getFullStyle(): IndicatorStyle {
    return {
      enabled: true,
      position: 'top',
      color: 'blue',
      showProgress: true,
      showFileCount: true,
      showTimer: true,
      animation: true
    };
  }

  public static getCompactStyle(): IndicatorStyle {
    return {
      enabled: true,
      position: 'inline',
      color: 'magenta',
      showProgress: false,
      showFileCount: false,
      showTimer: true,
      animation: true
    };
  }

  // 公共方法
  public setStyle(style: Partial<IndicatorStyle>): void {
    this.style = { ...this.style, ...style };
  }

  public getStyle(): IndicatorStyle {
    return { ...this.style };
  }

  public isVisible(): boolean {
    return this.state.visible;
  }

  public cleanup(): void {
    this.hide();
  }
}

// 导出一个工厂函数，方便创建不同风格的指示器
export function createDragIndicator(type: 'minimal' | 'full' | 'compact' = 'full'): DragIndicator {
  switch (type) {
    case 'minimal':
      return new DragIndicator(DragIndicator.getMinimalStyle());
    case 'compact':
      return new DragIndicator(DragIndicator.getCompactStyle());
    case 'full':
    default:
      return new DragIndicator(DragIndicator.getFullStyle());
  }
}