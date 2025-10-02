import * as readline from 'readline';
import { EventEmitter } from 'events';
import { EnhancedDragHandler, DragState, DragDropFeedback } from './enhanced-drag-handler';
import { AttachmentManager, ManagedAttachment } from './attachment-manager';
import chalk from 'chalk';

export interface InputEnhancerOptions {
  enableDragDrop?: boolean;
  enableVisualFeedback?: boolean;
  enableInlinePreview?: boolean;
  dragPrompt?: string;
  normalPrompt?: string;
  showAttachmentIndicator?: boolean;
}

export interface InputState {
  currentInput: string;
  cursorPosition: number;
  isDragging: boolean;
  attachments: ManagedAttachment[];
  dragState: DragState | null;
}

export class InputEnhancer extends EventEmitter {
  private rl: readline.Interface;
  private attachmentManager: AttachmentManager;
  private dragHandler: EnhancedDragHandler | null;
  private options: Required<InputEnhancerOptions>;
  private inputState: InputState;
  private originalCompleter: readline.Completer | null = null;
  private isProcessing: boolean = false;

  constructor(
    rl: readline.Interface,
    attachmentManager: AttachmentManager,
    options: InputEnhancerOptions = {}
  ) {
    super();

    this.rl = rl;
    this.attachmentManager = attachmentManager;
    this.options = {
      enableDragDrop: options.enableDragDrop !== false,
      enableVisualFeedback: options.enableVisualFeedback !== false,
      enableInlinePreview: options.enableInlinePreview !== false,
      dragPrompt: options.dragPrompt || '🎯 拖拽文件到这里 > ',
      normalPrompt: options.normalPrompt || '> ',
      showAttachmentIndicator: options.showAttachmentIndicator !== false
    };

    this.inputState = {
      currentInput: '',
      cursorPosition: 0,
      isDragging: false,
      attachments: [],
      dragState: null
    };

    // 不在这里初始化拖拽处理器，避免冲突
    // 拖拽处理由主界面的统一拖拽处理器负责
    this.dragHandler = null;

    this.setupEnhancements();
  }

  private setupEnhancements(): void {
    // 简化增强功能，避免干扰readline
    // this.setupInputTracking();
    this.setupAttachmentIndicator();
    this.setupEventHandlers();
  }

  private setupDragDropHandling(): void {
    // 拖拽处理由主界面负责，这里不再设置独立的事件监听
    // 避免多个处理器之间的冲突
  }

  private setupInputTracking(): void {
    // 保存原始的 completer
    this.originalCompleter = (this.rl as any).completer;

    // 监听输入变化
    this.rl.on('line', (input) => {
      this.inputState.currentInput = input;
      this.emit('input', input);
    });

    this.rl.on('keypress', (char, key) => {
      this.handleKeyPress(char, key);
    });
  }

  private setupAttachmentIndicator(): void {
    // 定期更新附件指示器
    setInterval(() => {
      if (this.options.showAttachmentIndicator) {
        this.updateAttachmentIndicator();
      }
    }, 1000);
  }

  private setupEventHandlers(): void {
    // 由于 AttachmentManager 不是 EventEmitter，通过轮询检查变化
    // 事件监听将在添加附件时手动触发
  }

  private handleDragStart(event: any): void {
    this.inputState.isDragging = true;
    // 不再依赖内部dragHandler的状态
    this.inputState.dragState = {
      isDragging: true,
      dragCount: 1,
      lastDragTime: Date.now(),
      hoveredFiles: [],
      previewMode: false
    };

    // 更新提示符
    this.updatePromptInternal(true);

    // 显示拖拽状态
    if (this.options.enableVisualFeedback) {
      this.showDragStatus(true);
    }

    this.emit('dragStart', event);
  }

  private handleDragEnd(event: any): void {
    this.inputState.isDragging = false;
    this.inputState.dragState = null;

    // 恢复正常提示符
    this.updatePromptInternal(false);

    // 清除拖拽状态显示
    if (this.options.enableVisualFeedback) {
      this.showDragStatus(false);
    }

    this.emit('dragEnd', event);
  }

  private handleFilesProcessed(event: any): void {
    // 更新附件列表
    this.inputState.attachments = this.attachmentManager.getAllAttachments();

    // 显示处理结果
    this.showProcessingResult(event);

    // 更新提示符
    this.updatePromptInternal(false);

    this.emit('filesProcessed', event);
  }

  private handleDragFeedback(feedback: DragDropFeedback): void {
    if (!this.options.enableVisualFeedback) return;

    switch (feedback.type) {
      case 'enter':
        this.showInlineFeedback(chalk.cyan(feedback.message));
        break;
      case 'over':
        if (feedback.files && feedback.files.length > 0) {
          this.showFilePreview(feedback.files);
        }
        break;
      case 'drop':
        this.showInlineFeedback(chalk.magenta(feedback.message));
        break;
      case 'error':
        this.showInlineFeedback(chalk.red(feedback.message));
        break;
    }
  }

  private handleKeyPress(char: string, key: readline.Key): void {
    // 处理特殊按键
    if (key && this.inputState.isDragging) {
      // 在拖拽期间可以取消操作
      if (key.name === 'escape') {
        this.cancelDrag();
      }
    }

    // 更新光标位置
    if (this.rl.line !== undefined) {
      this.inputState.cursorPosition = this.rl.cursor;
      this.inputState.currentInput = this.rl.line;
    }

    this.emit('keypress', char, key);
  }

  private updatePromptInternal(isDragging: boolean = false): void {
    let prompt = this.options.normalPrompt;

    if (isDragging) {
      prompt = this.options.dragPrompt;
    }

    // 添加附件指示器
    if (this.options.showAttachmentIndicator && this.inputState.attachments.length > 0) {
      const attachmentCount = this.inputState.attachments.length;
      const imageCount = this.inputState.attachments.filter(att => att.type === 'image').length;
      const fileCount = attachmentCount - imageCount;

      let indicator = '';
      if (imageCount > 0 && fileCount > 0) {
        indicator = chalk.cyan(`[${imageCount}🖼️ ${fileCount}📄] `);
      } else if (imageCount > 0) {
        indicator = chalk.cyan(`[${imageCount}🖼️] `);
      } else if (fileCount > 0) {
        indicator = chalk.cyan(`[${fileCount}📄] `);
      }

      prompt = indicator + prompt;
    }

    // 更新 readline 的提示符
    (this.rl as any)._prompt = prompt;

    // 如果需要，立即刷新显示
    if (this.isProcessing === false) {
      this.refreshDisplay();
    }
  }

  private showDragStatus(show: boolean): void {
    if (show) {
      // 在当前行下方显示拖拽状态
      process.stdout.write('\n' + chalk.cyan('🎯 准备接收拖拽的文件...') + '\n');

      // 移动光标到上一行，为后续输入做准备
      process.stdout.write('\x1b[1A');
    } else {
      // 清除拖拽状态显示
      process.stdout.write('\x1b[1A\x1b[K');
    }
  }

  private showInlineFeedback(message: string): void {
    // 在同一行显示反馈信息
    process.stdout.write(`\r${' '.repeat(process.stdout.columns || 80)}\r`);
    process.stdout.write(message);

    // 短暂延迟后恢复输入行
    setTimeout(() => {
      this.refreshDisplay();
    }, 2000);
  }

  private showFilePreview(files: string[]): void {
    if (!this.options.enableInlinePreview) return;

    // 显示文件预览
    const preview = files.map(file => `   📄 ${file}`).join('\n');
    const message = chalk.blue(`📋 预览文件:\n${preview}`);

    // 保存当前光标位置
    process.stdout.write('\x1b[s');

    // 显示预览
    process.stdout.write(`\n${message}\n`);

    // 短暂延迟后恢复
    setTimeout(() => {
      // 恢复光标位置
      process.stdout.write('\x1b[u');
      // 清除预览内容
      process.stdout.write('\x1b[J');
    }, 3000);
  }

  private showProcessingResult(event: any): void {
    const { successCount, failCount, totalCount } = event;

    let message = '';
    if (successCount > 0 && failCount === 0) {
      message = chalk.green(`✅ 成功添加 ${successCount} 个文件`);
    } else if (successCount > 0 && failCount > 0) {
      message = chalk.yellow(`⚠️ 添加了 ${successCount} 个文件，${failCount} 个失败`);
    } else {
      message = chalk.red(`❌ 所有 ${failCount} 个文件都添加失败`);
    }

    // 显示结果
    this.showInlineFeedback(message);

    // 显示附件提示
    if (successCount > 0) {
      setTimeout(() => {
        const totalAttachments = this.attachmentManager.getStats().count;
        const hint = chalk.cyan(`💡 当前共有 ${totalAttachments} 个附件，输入 /attachments 查看`);
        this.showInlineFeedback(hint);
      }, 3000);
    }
  }

  private updateAttachmentIndicator(): void {
    // 更新附件状态显示
    const currentCount = this.inputState.attachments.length;
    const actualCount = this.attachmentManager.getStats().count;

    if (currentCount !== actualCount) {
      this.inputState.attachments = this.attachmentManager.getAllAttachments();
      this.updatePrompt();
    }
  }

  private refreshDisplay(): void {
    // 刷新 readline 显示
    if (this.rl && !this.isProcessing) {
      try {
        (this.rl as any).refreshLine();
      } catch (error) {
        // 忽略刷新错误
      }
    }
  }

  private cancelDrag(): void {
    if (this.inputState.isDragging) {
      this.showInlineFeedback(chalk.yellow('📴 拖拽已取消'));
      this.handleDragEnd({ timestamp: new Date() });
    }
  }

  // 公共方法
  public getCurrentInput(): string {
    return this.inputState.currentInput;
  }

  public getAttachments(): ManagedAttachment[] {
    return [...this.inputState.attachments];
  }

  public getDragState(): DragState | null {
    return this.inputState.dragState;
  }

  public isDragging(): boolean {
    return this.inputState.isDragging;
  }

  public addAttachment(attachment: ManagedAttachment): void {
    this.inputState.attachments.push(attachment);
    this.updatePrompt();
  }

  public removeAttachment(attachmentId: string): boolean {
    const index = this.inputState.attachments.findIndex(att => att.id === attachmentId);
    if (index !== -1) {
      this.inputState.attachments.splice(index, 1);
      this.updatePrompt();
      return true;
    }
    return false;
  }

  public clearAttachments(): void {
    this.inputState.attachments = [];
    this.updatePrompt();
  }

  public setProcessing(processing: boolean): void {
    this.isProcessing = processing;
  }

  public updatePrompt(): void {
    this.updatePromptInternal(this.inputState.isDragging);
  }

  public cleanup(): void {
    if (this.dragHandler) {
      this.dragHandler.cleanup();
    }
    this.removeAllListeners();
  }
}