/**
 * 多模态输入处理器
 * 支持多种输入模式：对话、Bash、命令、记忆、Agent等
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type InputMode = 
  | 'chat'      // > 对话模式（默认）
  | 'bash'      // ! Bash模式
  | 'command'   // / 命令模式
  | 'memory'    // # 记忆模式
  | 'agent'     // @ Agent模式
  | 'tool'      // $ 工具模式
  | 'macro'     // % 宏模式
  | 'multiline' // \\ 多行模式
  | 'file';     // 文件路径

export interface ParsedInput {
  mode: InputMode;
  content: string;
  original: string;
  metadata?: {
    agentName?: string;
    commandName?: string;
    toolName?: string;
    macroName?: string;
  };
}

export class MultimodalInputHandler {
  private agentsDir: string;
  private commandsDir: string;
  private macrosDir: string;
  private memoryFile: string;

  constructor(private workspacePath: string = process.cwd()) {
    this.agentsDir = path.join(workspacePath, '.aicli', 'agents');
    this.commandsDir = path.join(workspacePath, '.aicli', 'commands');
    this.macrosDir = path.join(workspacePath, '.aicli', 'macros');
    this.memoryFile = path.join(workspacePath, 'AGENTS.md');
  }

  /**
   * 解析输入并识别模式
   */
  parseInput(input: string): ParsedInput {
    if (!input || input.trim().length === 0) {
      return {
        mode: 'chat',
        content: '',
        original: input
      };
    }

    const trimmed = input.trim();

    // Bash模式: ! command
    if (trimmed.startsWith('!')) {
      return {
        mode: 'bash',
        content: trimmed.slice(1).trim(),
        original: input
      };
    }

    // 命令模式: /command args
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(' ');
      return {
        mode: 'command',
        content: trimmed.slice(1).trim(),
        original: input,
        metadata: {
          commandName: parts[0]
        }
      };
    }

    // 记忆模式: # content
    if (trimmed.startsWith('#')) {
      return {
        mode: 'memory',
        content: trimmed.slice(1).trim(),
        original: input
      };
    }

    // Agent模式: @agent prompt
    if (trimmed.startsWith('@')) {
      const match = trimmed.match(/^@(\w+)\s+(.+)$/);
      if (match) {
        return {
          mode: 'agent',
          content: match[2],
          original: input,
          metadata: {
            agentName: match[1]
          }
        };
      }
    }

    // 工具模式: $tool args
    if (trimmed.startsWith('$')) {
      const parts = trimmed.slice(1).split(' ');
      return {
        mode: 'tool',
        content: trimmed.slice(1).trim(),
        original: input,
        metadata: {
          toolName: parts[0]
        }
      };
    }

    // 宏模式: %macro
    if (trimmed.startsWith('%')) {
      return {
        mode: 'macro',
        content: trimmed.slice(1).trim(),
        original: input,
        metadata: {
          macroName: trimmed.slice(1).trim()
        }
      };
    }

    // 多行模式: \\ content
    if (trimmed.startsWith('\\\\')) {
      return {
        mode: 'multiline',
        content: trimmed.slice(2).trim(),
        original: input
      };
    }

    // 检查是否是文件路径
    if (this.looksLikeFilePath(trimmed)) {
      return {
        mode: 'file',
        content: trimmed,
        original: input
      };
    }

    // 默认为对话模式
    return {
      mode: 'chat',
      content: trimmed,
      original: input
    };
  }

  /**
   * 判断输入是否像文件路径
   */
  private looksLikeFilePath(input: string): boolean {
    // 绝对路径
    if (input.startsWith('/') || input.startsWith('~')) {
      return fs.existsSync(input.replace('~', process.env.HOME || ''));
    }

    // 相对路径
    if (input.startsWith('./') || input.startsWith('../')) {
      return fs.existsSync(path.resolve(this.workspacePath, input));
    }

    // 包含常见文件扩展名
    const hasExtension = /\.(txt|md|js|ts|json|pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|py|java|cpp|c|go|rs|html|css|vue|jsx|tsx|xml|yaml|yml|env|ini|conf|cfg)$/i.test(input);
    
    if (hasExtension) {
      return fs.existsSync(input);
    }

    return false;
  }

  /**
   * 执行Bash命令
   */
  async executeBash(command: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      console.log(chalk.gray(`🔧 执行: ${command}`));
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspacePath,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      if (stderr) {
        console.log(chalk.yellow(stderr));
      }

      console.log(stdout);

      return {
        success: true,
        output: stdout,
        error: stderr
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`❌ 命令执行失败: ${errorMessage}`));
      return {
        success: false,
        output: '',
        error: errorMessage
      };
    }
  }

  /**
   * 添加到记忆文件
   */
  async addToMemory(content: string): Promise<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.memoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 如果文件不存在，创建初始内容
      if (!fs.existsSync(this.memoryFile)) {
        const header = `---
version: 2.3.0
created: ${new Date().toISOString().split('T')[0]}
updated: ${new Date().toISOString().split('T')[0]}
---

# 项目记忆 - ${path.basename(this.workspacePath)}

## 开发规范

`;
        fs.writeFileSync(this.memoryFile, header);
      }

      // 追加内容
      const timestamp = new Date().toLocaleString('zh-CN');
      const entry = `\n<!-- ${timestamp} -->\n${content}\n`;
      
      fs.appendFileSync(this.memoryFile, entry);
      console.log(chalk.green(`✓ 已添加到记忆文件: ${this.memoryFile}`));
    } catch (error) {
      console.log(chalk.red(`❌ 添加记忆失败: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * 读取记忆文件
   */
  readMemory(): string | null {
    try {
      if (fs.existsSync(this.memoryFile)) {
        return fs.readFileSync(this.memoryFile, 'utf-8');
      }
      
      // 尝试读取用户级记忆
      const userMemory = path.join(process.env.HOME || '', '.aicli', 'AGENTS.md');
      if (fs.existsSync(userMemory)) {
        return fs.readFileSync(userMemory, 'utf-8');
      }
      
      return null;
    } catch (error) {
      console.log(chalk.red(`❌ 读取记忆失败: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 初始化项目记忆
   */
  async initMemory(): Promise<boolean> {
    try {
      if (fs.existsSync(this.memoryFile)) {
        console.log(chalk.yellow(`⚠️  记忆文件已存在: ${this.memoryFile}`));
        return false;
      }

      const projectName = path.basename(this.workspacePath);
      const content = `---
version: 2.3.0
created: ${new Date().toISOString().split('T')[0]}
updated: ${new Date().toISOString().split('T')[0]}
---

# 项目记忆 - ${projectName}

## 技术栈

- Frontend: 
- Backend: 
- Database: 

## 开发规范

1. 代码风格
2. 命名约定
3. 注释规范

## 架构说明

请在此处添加项目架构信息...

## 常用命令

- \`npm run dev\` - 开发模式
- \`npm run build\` - 构建
- \`npm test\` - 测试

## 注意事项

- 
`;

      fs.writeFileSync(this.memoryFile, content);
      console.log(chalk.green(`✓ 已创建记忆文件: ${this.memoryFile}`));
      console.log(chalk.gray(`  使用 /memory 命令编辑`));
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 初始化记忆失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 列出可用的Agents
   */
  listAgents(): string[] {
    const agents: string[] = [];

    // 项目级Agent
    if (fs.existsSync(this.agentsDir)) {
      const files = fs.readdirSync(this.agentsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      agents.push(...files);
    }

    // 用户级Agent
    const userAgentsDir = path.join(process.env.HOME || '', '.aicli', 'agents');
    if (fs.existsSync(userAgentsDir)) {
      const files = fs.readdirSync(userAgentsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      agents.push(...files);
    }

    return [...new Set(agents)];
  }

  /**
   * 读取Agent定义
   */
  readAgent(agentName: string): { name: string; description: string; tools: string[]; prompt: string } | null {
    const agentFile = path.join(this.agentsDir, `${agentName}.md`);
    const userAgentFile = path.join(process.env.HOME || '', '.aicli', 'agents', `${agentName}.md`);

    let filePath: string | null = null;
    if (fs.existsSync(agentFile)) {
      filePath = agentFile;
    } else if (fs.existsSync(userAgentFile)) {
      filePath = userAgentFile;
    }

    if (!filePath) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 解析frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const prompt = frontmatterMatch[2].trim();

      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      const toolsMatch = frontmatter.match(/tools:\s*\[(.+)\]/);

      return {
        name: nameMatch ? nameMatch[1].trim() : agentName,
        description: descMatch ? descMatch[1].trim() : '',
        tools: toolsMatch ? toolsMatch[1].split(',').map(t => t.trim()) : [],
        prompt
      };
    } catch (error) {
      console.log(chalk.red(`❌ 读取Agent失败: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 列出可用的宏
   */
  listMacros(): string[] {
    const macros: string[] = [];

    if (fs.existsSync(this.macrosDir)) {
      const files = fs.readdirSync(this.macrosDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      macros.push(...files);
    }

    const userMacrosDir = path.join(process.env.HOME || '', '.aicli', 'macros');
    if (fs.existsSync(userMacrosDir)) {
      const files = fs.readdirSync(userMacrosDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      macros.push(...files);
    }

    return [...new Set(macros)];
  }

  /**
   * 读取宏定义
   */
  readMacro(macroName: string): string | null {
    const macroFile = path.join(this.macrosDir, `${macroName}.md`);
    const userMacroFile = path.join(process.env.HOME || '', '.aicli', 'macros', `${macroName}.md`);

    let filePath: string | null = null;
    if (fs.existsSync(macroFile)) {
      filePath = macroFile;
    } else if (fs.existsSync(userMacroFile)) {
      filePath = userMacroFile;
    }

    if (!filePath) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 移除frontmatter
      const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
      return withoutFrontmatter.trim();
    } catch (error) {
      console.log(chalk.red(`❌ 读取宏失败: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 显示输入模式帮助
   */
  showModeHelp(): void {
    console.log(chalk.bold('\n📋 输入模式指南\n'));
    
    const modes = [
      { prefix: '>', name: '对话模式', desc: '默认模式，直接与AI对话', example: '> 解释量子计算' },
      { prefix: '!', name: 'Bash模式', desc: '执行Shell命令', example: '! npm install' },
      { prefix: '/', name: '命令模式', desc: '执行内置命令', example: '/help' },
      { prefix: '#', name: '记忆模式', desc: '添加到项目记忆', example: '# 使用TypeScript' },
      { prefix: '@', name: 'Agent模式', desc: '调用特定Agent', example: '@review 检查代码' },
      { prefix: '$', name: '工具模式', desc: '直接调用工具', example: '$grep "TODO"' },
      { prefix: '%', name: '宏模式', desc: '执行自定义宏', example: '%deploy' },
      { prefix: '\\\\', name: '多行模式', desc: '输入多行内容', example: '\\\\ [Enter]' }
    ];

    modes.forEach(mode => {
      console.log(chalk.cyan(`  ${mode.prefix.padEnd(4)}`) + 
                  chalk.bold(mode.name.padEnd(12)) + 
                  chalk.gray(mode.desc));
      console.log(chalk.gray(`      示例: ${mode.example}\n`));
    });

    console.log(chalk.gray('提示: 不加前缀默认为对话模式\n'));
  }

  /**
   * 获取输入提示符
   */
  getPrompt(mode: InputMode = 'chat'): string {
    const prompts = {
      chat: chalk.green('> '),
      bash: chalk.yellow('! '),
      command: chalk.cyan('/ '),
      memory: chalk.magenta('# '),
      agent: chalk.blue('@ '),
      tool: chalk.yellow('$ '),
      macro: chalk.red('% '),
      multiline: chalk.gray('\\\\ '),
      file: chalk.green('> ')
    };

    return prompts[mode] || prompts.chat;
  }
}

