/**
 * 极致体验CLI界面
 * 整合所有新功能：多模态输入、Memory、Subagent等
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { EnhancedCommandHandler } from '../core/enhanced-command-handler';
import { MultimodalInputHandler, InputMode, ParsedInput } from '../core/multimodal-input-handler';
import { MemoryManager } from '../core/memory-manager';
import { SubagentManager } from '../core/subagent-manager';
import { TerminalFileUploader, FileAttachment } from '../core/terminal-file-uploader';
import { DeepSeekIntegration, DeepSeekConfig } from '../services/deepseek-integration';
import { SmartCompleter } from '../core/smart-completer';
import { HooksManager } from '../core/hooks-manager';

export interface UltimateCLIOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  sessionId?: string;
  workspacePath?: string;
  showStatus?: boolean;
  showSidebar?: boolean;
}

export class UltimateCLIInterface {
  private rl: readline.Interface;
  private commandHandler: EnhancedCommandHandler;
  private inputHandler: MultimodalInputHandler;
  private memoryManager: MemoryManager;
  private subagentManager: SubagentManager;
  private uploader: TerminalFileUploader;
  private aiService: DeepSeekIntegration;
  private completer: SmartCompleter;
  private hooksManager: HooksManager;
  
  private currentMode: InputMode = 'chat';
  private multilineBuffer: string[] = [];
  private isMultilineMode: boolean = false;
  private currentAttachments: FileAttachment[] = [];
  private isStreaming: boolean = false;
  
  private workspacePath: string;
  private sessionId: string;
  private options: UltimateCLIOptions;

  constructor(options: UltimateCLIOptions = {}) {
    this.options = options;
    this.workspacePath = options.workspacePath || process.cwd();
    this.sessionId = options.sessionId || this.generateSessionId();

    // 初始化所有管理器
    this.commandHandler = new EnhancedCommandHandler({
      workspacePath: this.workspacePath,
      sessionId: this.sessionId,
      onExit: () => this.exit(),
      onClear: () => this.clearAttachments()
    });

    this.inputHandler = this.commandHandler.getInputHandler();
    this.memoryManager = this.commandHandler.getMemoryManager();
    this.subagentManager = this.commandHandler.getSubagentManager();

    this.uploader = new TerminalFileUploader({
      enableDragDrop: true,
      enableClipboard: true,
      maxFiles: 20,
      maxFileSize: 50 * 1024 * 1024
    });

    // 初始化AI服务
    const deepseekConfig: DeepSeekConfig = {
      apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY || '',
      model: options.model || 'deepseek-chat',
      baseUrl: options.provider === 'openai' ? 'https://api.openai.com/v1' : undefined
    };

    this.aiService = new DeepSeekIntegration(deepseekConfig);

    // 初始化智能补全
    this.completer = new SmartCompleter(this.workspacePath);

    // 初始化Hooks系统
    this.hooksManager = new HooksManager(this.workspacePath);

    // 创建readline界面
    this.setupReadlineInterface();
  }

  /**
   * 设置或重置readline界面
   */
  private setupReadlineInterface(): void {
    // 创建readline界面（带补全功能）
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      terminal: true,
      completer: (line: string) => this.handleCompletion(line)
    });

    this.setupEventHandlers();
  }

  /**
   * 设置事件处理
   */
  private setupEventHandlers(): void {
    this.rl.on('line', async (input) => {
      await this.handleInput(input);
      this.rl.setPrompt(this.getPrompt());
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.exit();
    });

    // 处理Ctrl+C
    process.on('SIGINT', () => {
      if (this.isMultilineMode) {
        this.isMultilineMode = false;
        this.multilineBuffer = [];
        console.log(chalk.yellow('\n已取消多行输入'));
        this.rl.setPrompt(this.getPrompt());
        this.rl.prompt();
      } else {
        this.exit();
      }
    });
  }

  /**
   * Tab补全处理
   */
  private handleCompletion(line: string): [string[], string] {
    try {
      const trimmed = line.trim();
      
      // 1. 如果以/开头但后面紧跟字母，是命令补全
      if (trimmed.startsWith('/') && trimmed.length > 1 && /^\/[a-zA-Z]/.test(trimmed)) {
        const result = this.completer.completeCommand(trimmed);
        return [result.completions, trimmed];
      }
      
      // 2. 如果以@开头，是Agent补全
      if (trimmed.startsWith('@')) {
        const result = this.completer.completeCommand(trimmed);
        return [result.completions, trimmed];
      }
      
      // 3. 如果以$或%开头，是工具/宏补全
      if (trimmed.startsWith('$') || trimmed.startsWith('%')) {
        const result = this.completer.completeCommand(trimmed);
        return [result.completions, trimmed];
      }
      
      // 4. 如果包含路径特征，是文件路径补全
      if (trimmed.startsWith('~/') || 
          trimmed.startsWith('./') ||
          trimmed.startsWith('../') ||
          (trimmed.startsWith('/') && trimmed.includes('/', 1))) {
        const result = this.completer.completeFilePath(trimmed);
        return [result.completions, trimmed];
      }

      // 5. 其他情况，尝试命令补全
      const result = this.completer.completeCommand(trimmed);
      return [result.completions, trimmed];
    } catch (error) {
      return [[], line];
    }
  }

  /**
   * 处理输入
   */
  private async handleInput(input: string): Promise<void> {
    if (!input || input.trim().length === 0) {
      return;
    }

    // 添加到历史
    this.completer.addToHistory(input);

    // 触发beforeCommand Hook
    await this.hooksManager.trigger('beforeCommand', {
      input,
      sessionId: this.sessionId
    });

    try {
      // 多行模式处理
      if (this.isMultilineMode) {
        if (input.trim() === '') {
          // 空行结束多行输入
          const fullInput = this.multilineBuffer.join('\n');
          this.multilineBuffer = [];
          this.isMultilineMode = false;
          
          if (fullInput.trim()) {
            await this.processInput(fullInput);
          }
        } else {
          this.multilineBuffer.push(input);
        }
        return;
      }

      // 解析输入模式
      const parsed = this.inputHandler.parseInput(input);

      // 特殊处理：如果以/开头但看起来是文件路径，优先当作文件处理
      if (parsed.mode === 'command' && this.looksLikeFilePath(input)) {
        await this.handleFileMode(input);
        return;
      }

      // 根据模式处理
      switch (parsed.mode) {
        case 'bash':
          await this.handleBashMode(parsed.content);
          break;

        case 'command':
          // 特殊处理 /vim 命令 - 在UI层处理以便访问AI服务
          if (parsed.content.trim() === 'vim') {
            await this.handleVimMode();
          } else {
            await this.handleCommandMode(parsed.content);
          }
          break;
        
        // 新增：智能建议命令
        case 'chat':
          // 在对话前显示智能建议（如果适用）
          this.showSmartSuggestions(parsed.content);
          await this.handleChatMode(parsed.content);
          break;

        case 'memory':
          await this.handleMemoryMode(parsed.content);
          break;

        case 'agent':
          await this.handleAgentMode(parsed);
          break;

        case 'tool':
          await this.handleToolMode(parsed.content);
          break;

        case 'macro':
          await this.handleMacroMode(parsed.content);
          break;

        case 'multiline':
          this.startMultilineMode(parsed.content);
          break;

        case 'file':
          await this.handleFileMode(parsed.content);
          break;

        default:
          // 默认不会到这里，因为上面已经处理了chat
          break;
      }
      // 触发afterCommand Hook
      await this.hooksManager.trigger('afterCommand', {
        input,
        sessionId: this.sessionId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.log(chalk.red(`❌ 处理输入时发生错误: ${errorMessage}`));
      
      // 触发onError Hook
      await this.hooksManager.trigger('onError', {
        input,
        error: errorMessage,
        sessionId: this.sessionId
      });
    }
  }

  /**
   * 处理Bash模式
   */
  private async handleBashMode(command: string): Promise<void> {
    const result = await this.inputHandler.executeBash(command);
    // 输出已在executeBash中处理
  }

  /**
   * 处理命令模式
   */
  private async handleCommandMode(command: string): Promise<void> {
    const handled = await this.commandHandler.handleCommand(`/${command}`);
    
    if (!handled) {
      // 特殊命令需要在这里处理
      if (command.startsWith('att')) {
        this.showAttachments();
      } else if (command.startsWith('sessions')) {
        this.showSessions();
      } else if (command.startsWith('hooks')) {
        this.handleHooksCommand(command);
      } else if (command.startsWith('complete')) {
        this.showCompletionHelp();
      }
    }
  }

  /**
   * 处理Hooks命令
   */
  private handleHooksCommand(command: string): void {
    const parts = command.split(' ');
    const subCmd = parts[1];

    switch (subCmd) {
      case 'status':
        this.hooksManager.showStatus();
        break;

      case 'enable':
        this.hooksManager.enable();
        console.log(chalk.green('✓ Hooks已启用\n'));
        break;

      case 'disable':
        this.hooksManager.disable();
        console.log(chalk.yellow('✓ Hooks已禁用\n'));
        break;

      case 'example':
        console.log(chalk.bold('\n📝 Hooks配置示例:\n'));
        console.log(chalk.gray(this.hooksManager.createExampleConfig()));
        console.log();
        break;

      default:
        this.hooksManager.showStatus();
        break;
    }
  }

  /**
   * 显示补全帮助
   */
  private showCompletionHelp(): void {
    console.log(chalk.bold('\n⌨️  智能补全功能\n'));
    console.log(chalk.cyan('Tab键补全:'));
    console.log(chalk.gray('  /he[Tab]        → /help'));
    console.log(chalk.gray('  @rev[Tab]       → @review'));
    console.log(chalk.gray('  $gr[Tab]        → $grep'));
    console.log(chalk.gray('  %dep[Tab]       → %deploy\n'));
    
    console.log(chalk.cyan('路径补全:'));
    console.log(chalk.gray('  ~/Do[Tab]       → ~/Documents/'));
    console.log(chalk.gray('  ./src/[Tab]     → 显示src目录内容\n'));

    console.log(chalk.cyan('历史补全:'));
    console.log(chalk.gray('  输入之前的命令开头，按Tab补全\n'));

    console.log(chalk.cyan('智能建议:'));
    console.log(chalk.gray('  系统会根据上下文提供智能建议\n'));
  }

  /**
   * 显示智能建议
   */
  private showSmartSuggestions(input: string): void {
    const suggestions = this.completer.getSuggestions(input, {
      hasAttachments: this.currentAttachments.length > 0,
      hasMemory: this.memoryManager.hasMemory(false)
    });

    if (suggestions.length > 0 && !input.trim()) {
      console.log(chalk.gray('\n💡 智能建议:'));
      suggestions.slice(0, 3).forEach(s => {
        console.log(chalk.gray(`  • ${s.suggestion} - ${s.description}`));
      });
      console.log();
    }
  }

  /**
   * 处理Vim模式
   */
  private async handleVimMode(): Promise<void> {
    try {
      // 完全关闭主readline以避免任何输入冲突
      if (this.rl) {
        // 先移除所有事件监听器，避免触发close导致程序退出
        this.rl.removeAllListeners();
        this.rl.pause();
        this.rl.close();
      }
      
      // 导入完整的Vim模式
      const { FullVimMode } = await import('../core/full-vim-mode');
      
      // 创建Vim实例
      const vim = new FullVimMode('', 'scratch.txt');
      
      // 启动Vim模式
      const result = await vim.start();
      
      // 重新创建readline实例
      this.setupReadlineInterface();
      
      if (result !== null && result.trim()) {
        // 用户保存了内容
        console.log(chalk.green('\n✓ Vim编辑完成\n'));
        console.log(chalk.bold('编辑内容:'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(result);
        console.log(chalk.gray('─'.repeat(60)));
        console.log();
        
        // 验证内容格式 - 详细调试
        console.log(chalk.cyan('📤 准备发送给AI...'));
        console.log(chalk.gray(`  长度: ${result.length}字符`));
        console.log(chalk.gray(`  行数: ${result.split('\n').length}行`));
        
        // 显示每一行的内容（用于调试）
        const lines = result.split('\n');
        console.log(chalk.gray(`  行内容:`));
        lines.forEach((line, i) => {
          console.log(chalk.gray(`    行${i + 1}: "${line}"`));
        });
        
        // 检查是否包含Vim命令（不应该包含）
        if (result.includes(':wq') || result.includes(':q!') || result.includes(':w')) {
          console.log(chalk.yellow('\n⚠️  警告: 检测到Vim命令在内容中，这不应该发生'));
          console.log(chalk.yellow('  这可能是Vim实现的bug\n'));
        }
        
        console.log();
        
        // 确保换行符保持原样，直接发送给AI
        // 不做任何格式转换，保持原始内容
        await this.handleChatMode(result);
        
        // 重新显示提示符
        if (this.rl) {
          this.rl.prompt();
        }
        
      } else if (result !== null) {
        // 保存了但内容为空
        console.log(chalk.yellow('\n⚠️  内容为空，未发送给AI\n'));
        if (this.rl) {
          this.rl.prompt();
        }
      } else {
        // 用户放弃了编辑
        console.log(chalk.yellow('\n⚠️  编辑已取消\n'));
        if (this.rl) {
          this.rl.prompt();
        }
      }
    } catch (error) {
      console.log(chalk.red('\n❌ Vim模式启动失败\n'));
      console.log(chalk.gray(`错误: ${error instanceof Error ? error.message : '未知错误'}\n`));
      
      // 确保readline恢复
      this.setupReadlineInterface();
      if (this.rl) {
        this.rl.prompt();
      }
    }
  }

  /**
   * 处理记忆模式
   */
  private async handleMemoryMode(content: string): Promise<void> {
    if (!content) {
      console.log(chalk.yellow('❌ 请提供要添加的内容'));
      return;
    }

    this.memoryManager.appendToMemory(content, false);
  }

  /**
   * 处理Agent模式
   */
  private async handleAgentMode(parsed: ParsedInput): Promise<void> {
    const agentName = parsed.metadata?.agentName;
    
    if (!agentName) {
      console.log(chalk.red('❌ 请指定Agent名称'));
      console.log(chalk.gray('格式: @<agent-name> <prompt>'));
      return;
    }

    const agent = this.subagentManager.getAgent(agentName);
    
    if (!agent) {
      console.log(chalk.red(`❌ Agent不存在: ${agentName}`));
      console.log(chalk.gray('使用 /agents list 查看可用Agent'));
      return;
    }

    console.log(chalk.bold(`\n🤖 调用Agent: ${agent.name}\n`));
    console.log(chalk.gray(`描述: ${agent.description}`));
    console.log(chalk.gray(`工具: ${agent.tools.join(', ')}\n`));

    // TODO: 实际调用Agent执行任务
    console.log(chalk.cyan(`◆ ${agent.name}:`));
    console.log(chalk.gray(`  正在处理: ${parsed.content}...`));
    console.log(chalk.yellow(`\n💡 Agent调用功能开发中...\n`));
  }

  /**
   * 处理工具模式
   */
  private async handleToolMode(content: string): Promise<void> {
    console.log(chalk.yellow('💡 工具直接调用功能开发中...'));
    console.log(chalk.gray(`工具命令: ${content}\n`));
  }

  /**
   * 处理宏模式
   */
  private async handleMacroMode(macroName: string): Promise<void> {
    const macro = this.inputHandler.readMacro(macroName);
    
    if (!macro) {
      console.log(chalk.red(`❌ 宏不存在: ${macroName}`));
      return;
    }

    console.log(chalk.bold(`\n📦 执行宏: ${macroName}\n`));
    console.log(chalk.gray(macro));
    console.log();

    // TODO: 执行宏中定义的操作
    console.log(chalk.yellow('💡 宏执行功能开发中...\n'));
  }

  /**
   * 处理文件模式
   */
  private async handleFileMode(filePath: string): Promise<void> {
    const success = await this.uploader.processInput(filePath);
    if (success) {
      // 获取添加的文件
      const allFiles = this.uploader.getAttachments();
      this.currentAttachments = allFiles;
      console.log(chalk.green(`✓ 文件已添加（共${allFiles.length}个附件）`));
    }
  }

  /**
   * 处理对话模式
   */
  private async handleChatMode(message: string): Promise<void> {
    if (!message) {
      return;
    }

    // 检查API密钥
    if (!this.options.apiKey && !process.env.DEEPSEEK_API_KEY) {
      console.log(chalk.yellow('\n⚠️  未配置API密钥，无法与AI对话'));
      console.log(chalk.gray('请设置环境变量: export DEEPSEEK_API_KEY=your_key\n'));
      return;
    }

    if (this.isStreaming) {
      console.log(chalk.yellow('⚠️  当前正在处理上一个请求，请稍候...\n'));
      return;
    }

    try {
      // 加载项目记忆作为上下文
      const memoryContext = this.memoryManager.getMergedMemoryContent();
      let fullMessage = message;
      
      if (memoryContext) {
        fullMessage = `[项目记忆]\n${memoryContext}\n\n[用户消息]\n${message}`;
      }

      // 调试信息：显示即将发送给AI的完整消息
      if (process.env.AICLI_DEBUG === 'true') {
        console.log(chalk.magenta('\n[调试] 发送给AI的完整消息:'));
        console.log(chalk.magenta('─'.repeat(60)));
        console.log(fullMessage);
        console.log(chalk.magenta('─'.repeat(60)));
        console.log(chalk.gray(`消息长度: ${fullMessage.length}字符`));
        console.log(chalk.gray(`消息行数: ${fullMessage.split('\n').length}行\n`));
      }

      // 使用流式响应
      await this.sendStreamingMessage(fullMessage);
      
    } catch (error) {
      console.log(chalk.red(`\n❌ AI请求失败: ${error instanceof Error ? error.message : '未知错误'}\n`));
    }
  }

  /**
   * 发送流式消息
   */
  private async sendStreamingMessage(message: string): Promise<void> {
    this.isStreaming = true;

    console.log('');
    console.log(chalk.bold('◆ AI:'));
    console.log('');

    let fullResponse = '';

    try {
      await this.aiService.sendMessageWithAttachmentsStream(
        message,
        this.currentAttachments,
        (chunk: string) => {
          process.stdout.write(chalk.gray(chunk));
          fullResponse += chunk;
        }
      );

      console.log('\n');
    } catch (error) {
      throw error;
    } finally {
      this.isStreaming = false;
      
      // 清除附件（如果有）
      if (this.currentAttachments.length > 0) {
        console.log(chalk.gray(`已使用${this.currentAttachments.length}个附件`));
        this.currentAttachments = [];
      }
    }
  }

  /**
   * 开始多行模式
   */
  private startMultilineMode(initialContent?: string): void {
    this.isMultilineMode = true;
    this.multilineBuffer = [];
    
    if (initialContent) {
      this.multilineBuffer.push(initialContent);
    }

    console.log(chalk.yellow('\n进入多行输入模式（输入空行结束）\n'));
  }

  /**
   * 处理完整输入
   */
  private async processInput(input: string): Promise<void> {
    // 这里可以进一步处理合并后的多行输入
    await this.handleChatMode(input);
  }

  /**
   * 显示附件
   */
  private showAttachments(): void {
    const attachments = this.uploader.getAttachments();
    
    if (attachments.length === 0) {
      console.log(chalk.yellow('\n⚠️  没有附件\n'));
      return;
    }

    console.log(chalk.bold('\n📎 附件列表:\n'));
    
    attachments.forEach((att, index) => {
      const sizeMB = (att.size / (1024 * 1024)).toFixed(2);
      console.log(`${chalk.cyan(`[${index + 1}]`)} ${chalk.bold(att.filename)}`);
      console.log(chalk.gray(`     类型: ${att.mimeType} | 大小: ${sizeMB} MB`));
      console.log(chalk.gray(`     路径: ${att.originalPath}\n`));
    });
  }

  /**
   * 清空附件
   */
  private clearAttachments(): void {
    this.uploader.clearAttachments();
    this.currentAttachments = [];
    console.log(chalk.green('✓ 附件列表已清空\n'));
  }

  /**
   * 显示会话列表
   */
  private showSessions(): void {
    console.log(chalk.yellow('\n💡 会话管理功能开发中...\n'));
  }

  /**
   * 获取提示符
   */
  private getPrompt(): string {
    if (this.isMultilineMode) {
      return chalk.gray('... ');
    }

    // 根据当前模式显示不同的提示符
    return chalk.green('> ');
  }

  /**
   * 启动界面
   */
  async start(): Promise<void> {
    // 清屏
    console.clear();

    // 显示欢迎信息
    this.showWelcome();

    // 加载记忆
    await this.loadMemory();

    // 显示提示
    this.rl.prompt();
  }

  /**
   * 显示欢迎信息
   */
  private showWelcome(): void {
    const version = '2.3.0';
    
    console.log(chalk.bold(`\n⚡️ AICLI v${version} - 极致体验版\n`));
    
    if (this.options.showStatus !== false) {
      console.log(chalk.gray(`Provider: ${this.options.provider || 'DeepSeek'}`));
      console.log(chalk.gray(`Model: ${this.options.model || 'deepseek-chat'}`));
      console.log(chalk.gray(`Workspace: ${this.workspacePath}`));
      console.log(chalk.gray(`Session: ${this.sessionId.slice(0, 8)}...\n`));
    }

    console.log(chalk.cyan('🎯 多模态输入:'));
    console.log(chalk.gray('  >  对话 | !  Bash | /  命令 | #  记忆 | @  Agent\n'));

    console.log(chalk.gray('输入 /help 查看帮助 | /modes 查看所有模式 | Ctrl+C 退出\n'));
  }

  /**
   * 加载记忆
   */
  private async loadMemory(): Promise<void> {
    const memories = this.memoryManager.loadMemories();
    
    if (memories.length > 0) {
      console.log(chalk.green(`✓ 已加载 ${memories.length} 个记忆文件\n`));
    }
  }

  /**
   * 退出
   */
  private exit(): void {
    console.log(chalk.cyan('\n👋 再见！\n'));
    this.rl.close();
    process.exit(0);
  }

  /**
   * 判断输入是否像文件路径
   */
  private looksLikeFilePath(input: string): boolean {
    const trimmed = input.trim();
    
    // 检查是否是绝对路径
    if (trimmed.startsWith('/') || trimmed.startsWith('~')) {
      // 检查是否包含文件扩展名
      const hasExtension = /\.(txt|md|js|ts|json|pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|py|java|cpp|c|go|rs|html|css|vue|jsx|tsx|xml|yaml|yml|env|ini|conf|cfg)$/i.test(trimmed);
      
      // 或者路径中包含多个斜杠（说明是路径而不是命令）
      const hasMultipleSlashes = (trimmed.match(/\//g) || []).length > 1;
      
      return hasExtension || hasMultipleSlashes;
    }
    
    return false;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const cli = new UltimateCLIInterface({
    provider: process.env.AI_PROVIDER || 'deepseek',
    model: process.env.AI_MODEL || 'deepseek-chat',
    apiKey: process.env.DEEPSEEK_API_KEY,
    showStatus: true
  });

  cli.start().catch(error => {
    console.error(chalk.red('启动失败:'), error);
    process.exit(1);
  });
}

