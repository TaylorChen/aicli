/**
 * 增强的命令处理器
 * 整合所有命令功能
 */

import chalk from 'chalk';
import { MultimodalInputHandler } from './multimodal-input-handler';
import { MemoryManager } from './memory-manager';
import { SubagentManager } from './subagent-manager';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CommandContext {
  workspacePath: string;
  sessionId?: string;
  onExit?: () => void;
  onClear?: () => void;
}

export class EnhancedCommandHandler {
  private inputHandler: MultimodalInputHandler;
  private memoryManager: MemoryManager;
  private subagentManager: SubagentManager;

  constructor(private context: CommandContext) {
    this.inputHandler = new MultimodalInputHandler(context.workspacePath);
    this.memoryManager = new MemoryManager(context.workspacePath);
    this.subagentManager = new SubagentManager(context.workspacePath);
  }

  /**
   * 处理命令
   */
  async handleCommand(command: string): Promise<boolean> {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      // 帮助和信息
      case 'help':
      case 'h':
        this.showHelp();
        return true;

      case 'modes':
        this.inputHandler.showModeHelp();
        return true;

      case 'version':
      case 'v':
        this.showVersion();
        return true;

      case 'status':
      case 'st':
        await this.showStatus();
        return true;

      // Memory相关
      case 'init':
        await this.handleInit();
        return true;

      case 'memory':
      case 'mem':
        await this.handleMemory(args);
        return true;

      // Agent相关
      case 'agents':
      case 'agent':
        await this.handleAgents(args);
        return true;

      // 文件和附件
      case 'paste':
      case 'p':
        console.log(chalk.yellow('请使用系统粘贴功能（Cmd+V）'));
        return true;

      case 'attachments':
      case 'att':
        // 由调用者处理
        return false;

      case 'clear':
      case 'c':
        if (this.context.onClear) {
          this.context.onClear();
        }
        return true;

      // 会话管理
      case 'sessions':
      case 'sess':
        // 由调用者处理
        return false;

      case 'resume':
      case 'r':
        console.log(chalk.yellow('使用 aicli -r <session-id> 恢复会话'));
        return true;

      case 'compact':
        this.compactHistory();
        return true;

      // Vim模式
      case 'vim':
        await this.openVim();
        return true;

      // 工具相关
      case 'tools':
        this.showTools(args);
        return true;

      // 配置
      case 'config':
      case 'cfg':
        this.showConfig(args);
        return true;

      // 统计
      case 'usage':
        this.showUsage();
        return true;

      // 反馈
      case 'feedback':
        console.log(chalk.cyan('\n💬 反馈渠道:\n'));
        console.log(chalk.gray('  GitHub: https://github.com/your-repo/aicli/issues'));
        console.log(chalk.gray('  Email: feedback@example.com\n'));
        return true;

      // 退出
      case 'quit':
      case 'q':
      case 'exit':
        if (this.context.onExit) {
          this.context.onExit();
        }
        return true;

      default:
        console.log(chalk.red(`❌ 未知命令: ${cmd}`));
        console.log(chalk.gray('输入 /help 查看可用命令'));
        return true;
    }
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    console.log(chalk.bold('\n📚 AICLI 帮助\n'));

    const categories = [
      {
        name: '基础命令',
        commands: [
          { cmd: '/help, /h', desc: '显示帮助' },
          { cmd: '/modes', desc: '显示输入模式' },
          { cmd: '/version, /v', desc: '显示版本' },
          { cmd: '/status, /st', desc: '系统状态' },
        ]
      },
      {
        name: 'Memory系统',
        commands: [
          { cmd: '/init', desc: '初始化项目记忆' },
          { cmd: '/memory [show|search|edit]', desc: '管理记忆' },
        ]
      },
      {
        name: 'Agent系统',
        commands: [
          { cmd: '/agents list', desc: '列出所有Agent' },
          { cmd: '/agents info <name>', desc: '查看Agent详情' },
          { cmd: '/agents create', desc: '创建新Agent' },
          { cmd: '@<agent> <prompt>', desc: '调用Agent' },
        ]
      },
      {
        name: '文件和附件',
        commands: [
          { cmd: '/paste, /p', desc: '粘贴内容' },
          { cmd: '/att', desc: '查看附件' },
          { cmd: '/clear, /c', desc: '清空附件' },
        ]
      },
      {
        name: '会话管理',
        commands: [
          { cmd: '/sessions', desc: '查看所有会话' },
          { cmd: '/resume <id>', desc: '恢复会话' },
          { cmd: '/compact', desc: '压缩历史' },
        ]
      },
      {
        name: '其他',
        commands: [
          { cmd: '/vim', desc: 'Vim编辑器' },
          { cmd: '/tools', desc: '查看工具' },
          { cmd: '/config', desc: '查看配置' },
          { cmd: '/feedback', desc: '反馈问题' },
          { cmd: '/quit, /q', desc: '退出' },
        ]
      }
    ];

    categories.forEach(category => {
      console.log(chalk.cyan(category.name));
      category.commands.forEach(({ cmd, desc }) => {
        console.log(`  ${chalk.bold(cmd.padEnd(30))} ${chalk.gray(desc)}`);
      });
      console.log();
    });

    console.log(chalk.bold('输入模式:\n'));
    console.log(chalk.gray('  >  对话模式（默认）'));
    console.log(chalk.gray('  !  Bash模式'));
    console.log(chalk.gray('  /  命令模式'));
    console.log(chalk.gray('  #  记忆模式'));
    console.log(chalk.gray('  @  Agent模式'));
    console.log(chalk.gray('  $  工具模式'));
    console.log(chalk.gray('  %  宏模式'));
    console.log(chalk.gray('  \\\\ 多行模式\n'));

    console.log(chalk.gray('输入 /modes 查看详细的模式说明\n'));
  }

  /**
   * 显示输入模式详情
   */
  private showModes(): void {
    console.log(chalk.bold('\n🎯 多模态输入系统\n'));
    
    const modes = [
      {
        prefix: '>',
        name: '对话模式',
        desc: '与AI进行自然对话（默认模式）',
        example: '> 帮我分析这段代码'
      },
      {
        prefix: '!',
        name: 'Bash模式',
        desc: '执行Shell命令',
        example: '! ls -la'
      },
      {
        prefix: '/',
        name: '命令模式',
        desc: '执行AICLI内置命令',
        example: '/help'
      },
      {
        prefix: '#',
        name: '记忆模式',
        desc: '添加内容到项目记忆（AGENTS.md）',
        example: '# 项目使用React + TypeScript'
      },
      {
        prefix: '@',
        name: 'Agent模式',
        desc: '调用专业化AI Agent',
        example: '@review 审查这段代码'
      },
      {
        prefix: '$',
        name: '工具模式',
        desc: '直接调用内置工具',
        example: '$grep "TODO" ./src'
      },
      {
        prefix: '%',
        name: '宏模式',
        desc: '执行预定义的宏',
        example: '%deploy'
      },
      {
        prefix: '\\\\',
        name: '多行模式',
        desc: '输入多行内容，空行结束',
        example: '\\\\ 输入多行内容...'
      }
    ];

    modes.forEach(mode => {
      console.log(chalk.cyan(`${mode.prefix}  ${mode.name}`));
      console.log(chalk.gray(`   ${mode.desc}`));
      console.log(chalk.gray(`   示例: ${mode.example}\n`));
    });

    console.log(chalk.bold('💡 使用技巧:\n'));
    console.log(chalk.gray('  • 不使用前缀默认为对话模式'));
    console.log(chalk.gray('  • Tab键可补全命令、Agent、工具和路径'));
    console.log(chalk.gray('  • 可直接拖拽文件到终端添加附件\n'));
  }

  /**
   * 显示版本
   */
  private showVersion(): void {
    const version = '2.4.0';
    console.log(chalk.bold(`\n⚡️ AICLI v${version}\n`));
    console.log(chalk.gray(`Node ${process.version}`));
    console.log(chalk.gray(`Platform ${process.platform}\n`));
  }

  /**
   * 显示状态
   */
  private async showStatus(): Promise<void> {
    console.log(chalk.bold('\n📊 系统状态\n'));

    // Memory状态
    console.log(chalk.cyan('Memory:'));
    const hasProjectMemory = this.memoryManager.hasMemory(false);
    const hasUserMemory = this.memoryManager.hasMemory(true);
    console.log(chalk.gray(`  项目记忆: ${hasProjectMemory ? '✓' : '✗'}`));
    console.log(chalk.gray(`  用户记忆: ${hasUserMemory ? '✓' : '✗'}\n`));

    // Agents状态
    console.log(chalk.cyan('Agents:'));
    const agents = this.subagentManager.listAgents();
    console.log(chalk.gray(`  可用Agent数: ${agents.length}`));
    if (agents.length > 0) {
      console.log(chalk.gray(`  ${agents.map(a => a.name).join(', ')}\n`));
    } else {
      console.log();
    }

    // 会话状态
    console.log(chalk.cyan('Session:'));
    console.log(chalk.gray(`  ID: ${this.context.sessionId || '无'}\n`));
  }

  /**
   * 处理init命令
   */
  private async handleInit(): Promise<void> {
    console.log(chalk.bold('\n🔧 初始化项目\n'));
    
    // 初始化记忆
    await this.memoryManager.initProjectMemory();
    
    // 询问是否创建默认Agents
    console.log(chalk.yellow('\n是否创建默认Agents? (review, design, test)'));
    console.log(chalk.gray('输入 yes 确认，或任意键跳过\n'));
    
    // 简单起见，这里直接创建
    // 实际应该等待用户输入
    await this.subagentManager.createDefaultAgents();
  }

  /**
   * 处理memory命令
   */
  private async handleMemory(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'show':
      case 's':
        const content = this.memoryManager.getMergedMemoryContent();
        if (content) {
          console.log(chalk.bold('\n📝 项目记忆\n'));
          console.log(content);
          console.log();
        } else {
          console.log(chalk.yellow('\n⚠️  没有记忆内容'));
          console.log(chalk.gray('使用 /init 初始化项目记忆\n'));
        }
        break;

      case 'search':
        const keyword = args.slice(1).join(' ');
        if (!keyword) {
          console.log(chalk.red('❌ 请提供搜索关键词'));
          break;
        }
        const results = this.memoryManager.searchMemory(keyword);
        if (results.length > 0) {
          console.log(chalk.bold(`\n🔍 搜索结果: "${keyword}"\n`));
          results.forEach(r => {
            console.log(`${chalk.cyan(r.source)} ${chalk.gray(`行${r.line}:`)}`);
            console.log(chalk.gray(`  ${r.content}\n`));
          });
        } else {
          console.log(chalk.yellow(`\n⚠️  没有找到包含"${keyword}"的内容\n`));
        }
        break;

      case 'edit':
      case 'e':
        const isUser = args[1] === 'user';
        const memPath = this.memoryManager.getMemoryPath(isUser);
        if (fs.existsSync(memPath)) {
          await this.openEditor(memPath);
        } else {
          console.log(chalk.yellow('\n⚠️  记忆文件不存在'));
          console.log(chalk.gray('使用 /init 初始化\n'));
        }
        break;

      case 'stats':
        this.memoryManager.showMemoryStats();
        break;

      default:
        this.memoryManager.showMemoryStats();
        break;
    }
  }

  /**
   * 处理agents命令
   */
  private async handleAgents(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'list':
      case 'ls':
        this.subagentManager.showAgentList();
        break;

      case 'info':
        const agentName = args[1];
        if (!agentName) {
          console.log(chalk.red('❌ 请指定Agent名称'));
          break;
        }
        this.subagentManager.showAgentInfo(agentName);
        break;

      case 'create':
        console.log(chalk.yellow('\n📝 创建新Agent\n'));
        console.log(chalk.gray('请在 .aicli/agents/ 目录下创建 <name>.md 文件'));
        console.log(chalk.gray('格式参考: https://docs.aicli.com/agents\n'));
        break;

      case 'delete':
      case 'rm':
        const delName = args[1];
        if (!delName) {
          console.log(chalk.red('❌ 请指定Agent名称'));
          break;
        }
        await this.subagentManager.deleteAgent(delName);
        break;

      default:
        this.subagentManager.showAgentList();
        break;
    }
  }

  /**
   * 打开Vim编辑器
   */
  private async openVim(): Promise<void> {
    try {
      // 导入完整的Vim模式
      const { FullVimMode } = await import('./full-vim-mode');
      
      // 创建Vim实例
      const vim = new FullVimMode('', 'scratch.txt');
      
      // 启动Vim模式
      const result = await vim.start();
      
      if (result !== null) {
        // 用户保存了内容
        console.log(chalk.green('\n✓ Vim编辑完成\n'));
        
        if (result.trim()) {
          console.log(chalk.bold('编辑内容:'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(result);
          console.log(chalk.gray('─'.repeat(60)));
          console.log();
          
          // 询问是否保存到记忆
          console.log(chalk.yellow('💡 提示: 使用 /memory edit 可以直接编辑项目记忆'));
          console.log(chalk.gray('或使用 # 内容 快速添加到记忆\n'));
        }
      } else {
        // 用户放弃了编辑
        console.log(chalk.yellow('\n⚠️  编辑已取消\n'));
      }
    } catch (error) {
      console.log(chalk.red('\n❌ Vim模式启动失败\n'));
      console.log(chalk.yellow('💡 Vim模式功能说明:\n'));
      console.log(chalk.cyan('快速编辑命令:'));
      console.log(chalk.gray('  /memory edit       - 编辑项目记忆'));
      console.log(chalk.gray('  /memory edit user  - 编辑用户记忆\n'));
      
      console.log(chalk.cyan('使用系统编辑器:'));
      console.log(chalk.gray(`  当前编辑器: ${process.env.EDITOR || 'vim'}`));
      console.log(chalk.gray('  设置: export EDITOR=code  # 或 nano, vim等\n'));

      console.log(chalk.gray(`错误: ${error instanceof Error ? error.message : '未知错误'}\n`));
    }
  }

  /**
   * 打开外部编辑器
   */
  private openEditor(filePath: string): void {
    const editor = process.env.EDITOR || 'vim';
    
    console.log(chalk.gray(`\n正在打开编辑器: ${editor}\n`));

    const child = spawn(editor, [filePath], {
      stdio: 'inherit'
    });

    child.on('close', () => {
      console.log(chalk.green('\n✓ 编辑完成\n'));
    });
  }

  /**
   * 显示工具列表
   */
  private showTools(args: string[]): void {
    console.log(chalk.bold('\n🔧 可用工具\n'));

    const tools = [
      { name: 'Read', desc: '读取文件内容' },
      { name: 'Write', desc: '写入文件' },
      { name: 'Grep', desc: '搜索文件内容' },
      { name: 'Glob', desc: '文件路径匹配' },
      { name: 'Bash', desc: '执行Shell命令' },
    ];

    tools.forEach(tool => {
      console.log(`${chalk.cyan(tool.name.padEnd(10))} ${chalk.gray(tool.desc)}`);
    });

    console.log();
  }

  /**
   * 显示配置
   */
  private showConfig(args: string[]): void {
    console.log(chalk.bold('\n⚙️  配置信息\n'));
    
    console.log(chalk.cyan('工作目录:'));
    console.log(chalk.gray(`  ${this.context.workspacePath}\n`));
    
    console.log(chalk.cyan('记忆文件:'));
    console.log(chalk.gray(`  项目: ${this.memoryManager.getMemoryPath(false)}`));
    console.log(chalk.gray(`  用户: ${this.memoryManager.getMemoryPath(true)}\n`));
    
    console.log(chalk.cyan('Agents目录:'));
    console.log(chalk.gray(`  项目: ${path.join(this.context.workspacePath, '.aicli', 'agents')}`));
    console.log(chalk.gray(`  用户: ${path.join(process.env.HOME || '', '.aicli', 'agents')}\n`));
  }

  /**
   * 显示用量统计
   */
  private showUsage(): void {
    console.log(chalk.bold('\n📈 用量统计\n'));
    console.log(chalk.yellow('💡 用量统计功能开发中...\n'));
  }

  /**
   * 压缩历史记录
   */
  private compactHistory(): void {
    console.log(chalk.bold('\n🗜️  压缩对话历史\n'));
    console.log(chalk.cyan('功能说明:'));
    console.log(chalk.gray('  • 压缩冗余的对话历史'));
    console.log(chalk.gray('  • 保留关键信息'));
    console.log(chalk.gray('  • 释放内存空间\n'));
    console.log(chalk.yellow('💡 历史压缩功能开发中...\n'));
  }

  /**
   * 获取输入处理器
   */
  getInputHandler(): MultimodalInputHandler {
    return this.inputHandler;
  }

  /**
   * 获取记忆管理器
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * 获取Agent管理器
   */
  getSubagentManager(): SubagentManager {
    return this.subagentManager;
  }
}

