import chalk from 'chalk';
import { StatusBarState } from '../types';

export class StatusBar {
  private state: StatusBarState;
  private lastUpdateTime: number = 0;

  constructor(initialState: StatusBarState) {
    this.state = initialState;
  }

  updateState(updates: Partial<StatusBarState>): void {
    this.state = { ...this.state, ...updates };
    this.lastUpdateTime = Date.now();
    this.render();
  }

  render(): void {
    const { model, provider, isConnected, tokensUsed, streaming, lastResponseTime } = this.state;

    const statusColor = isConnected ? chalk.green : chalk.red;
    const modelColor = streaming ? chalk.cyan : chalk.blue;
    const providerColor = chalk.yellow;

    const statusIcon = isConnected ? '●' : '○';
    const streamingIcon = streaming ? '⚡' : '';

    const leftSection = `${statusColor(statusIcon)} ${providerColor(provider)} ${modelColor(model)}`;
    const middleSection = streaming ? chalk.cyan(streamingIcon + ' Streaming...') : '';
    let rightSection = `💾 ${tokensUsed} tokens`;

    if (lastResponseTime) {
      const responseTime = Date.now() - lastResponseTime.getTime();
      const timeStr = `${responseTime}ms`;
      const timeColor = responseTime < 1000 ? chalk.green : responseTime < 3000 ? chalk.yellow : chalk.red;
      rightSection += ` ${timeColor(timeStr)}`;
    }

    const terminalWidth = process.stdout.columns || 80;
    const padding = Math.max(0, terminalWidth - leftSection.length - middleSection.length - rightSection.length - 4);

    const statusBar = chalk.bgGray.white(
      ` ${leftSection}${' '.repeat(padding)}${middleSection} ${rightSection} `
    );

    // Clear the current line and move to beginning
    process.stdout.write('\x1b[2K\x1b[G');
    process.stdout.write(statusBar + '\n');
  }

  clear(): void {
    process.stdout.write('\x1b[2K\x1b[G');
  }

  showLoading(message: string = 'Processing...'): () => void {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frame = 0;

    const interval = setInterval(() => {
      const frameChar = frames[frame % frames.length];
      const loadingText = chalk.cyan(`${frameChar} ${message}`);

      process.stdout.write('\x1b[2K\x1b[G');
      process.stdout.write(loadingText);

      frame++;
    }, 100);

    return () => {
      clearInterval(interval);
      this.clear();
    };
  }

  showError(message: string): void {
    process.stdout.write('\x1b[2K\x1b[G');
    process.stdout.write(chalk.red(`❌ ${message}`) + '\n');
  }

  showSuccess(message: string): void {
    process.stdout.write('\x1b[2K\x1b[G');
    process.stdout.write(chalk.green(`✅ ${message}`) + '\n');
  }

  getState(): StatusBarState {
    return { ...this.state };
  }
}