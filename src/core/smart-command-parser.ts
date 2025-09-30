import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';

export interface AICLICommand {
  name: string;
  description: string;
  usage: string;
  category: string;
  options: CommandOption[];
  examples: string[];
  handler: CommandHandler;
  aliases?: string[];
  hidden?: boolean;
}

export interface CommandOption {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  required?: boolean;
  default?: any;
  choices?: string[];
  alias?: string;
}

export interface ParseResult {
  command: AICLICommand;
  options: Record<string, any>;
  args: string[];
  rawArgs: string[];
  intent: CommandIntent;
}

export interface CommandIntent {
  type: 'query' | 'chat' | 'configure' | 'help' | 'version';
  confidence: number;
  context: IntentContext;
}

export interface IntentContext {
  hasQuery: boolean;
  hasFiles: boolean;
  hasOptions: boolean;
  isInteractive: boolean;
  detectedProject?: ProjectInfo;
}

export interface ProjectInfo {
  type: string;
  language: string;
  framework?: string;
  path: string;
  confidence: number;
}

export type CommandHandler = (options: Record<string, any>, args: string[]) => Promise<void>;

export class SmartCommandParser {
  private commands: Map<string, AICLICommand> = new Map();
  private aliases: Map<string, string> = new Map();
  private program: Command;
  private projectDetector: ProjectDetector;

  constructor() {
    this.program = new Command();
    this.projectDetector = new ProjectDetector();
    this.initializeCommands();
    this.setupProgram();
  }

  private initializeCommands(): void {
    // 注册核心命令
    this.registerCommand({
      name: 'query',
      description: '执行单次AI查询',
      usage: 'aicli [options] "query"',
      category: '核心功能',
      options: [
        {
          name: 'model',
          description: '指定AI模型',
          type: 'string',
          alias: 'm'
        },
        {
          name: 'provider',
          description: '指定AI提供商',
          type: 'string',
          alias: 'p'
        },
        {
          name: 'file',
          description: '包含文件上下文',
          type: 'array',
          alias: 'f'
        },
        {
          name: 'context',
          description: '提供额外上下文',
          type: 'string',
          alias: 'c'
        },
        {
          name: 'output',
          description: '输出格式 (json|text|markdown)',
          type: 'string',
          alias: 'o',
          choices: ['json', 'text', 'markdown'],
          default: 'text'
        }
      ],
      examples: [
        'aicli "what\'s wrong with this code?"',
        'aicli -m gpt-4 "explain this algorithm"',
        'aicli -f main.py "optimize this function"'
      ],
      handler: this.handleQuery.bind(this),
      aliases: ['q', 'ask']
    });

    this.registerCommand({
      name: 'chat',
      description: '启动交互式对话',
      usage: 'aicli chat [options]',
      category: '核心功能',
      options: [
        {
          name: 'theme',
          description: '界面主题',
          type: 'string',
          choices: ['auto', 'light', 'dark', 'minimal'],
          default: 'auto'
        },
        {
          name: 'continue',
          description: '继续上一次对话',
          type: 'boolean',
          alias: 'c'
        },
        {
          name: 'session',
          description: '指定会话ID',
          type: 'string',
          alias: 's'
        },
        {
          name: 'project',
          description: '项目路径',
          type: 'string',
          alias: 'p'
        }
      ],
      examples: [
        'aicli chat',
        'aicli chat --continue',
        'aicli chat --project /path/to/code'
      ],
      handler: this.handleChat.bind(this),
      aliases: ['start', 'repl']
    });

    this.registerCommand({
      name: 'configure',
      description: '配置AICLI',
      usage: 'aicli configure [options]',
      category: '配置',
      options: [
        {
          name: 'provider',
          description: '设置默认提供商',
          type: 'string',
          alias: 'p'
        },
        {
          name: 'model',
          description: '设置默认模型',
          type: 'string',
          alias: 'm'
        },
        {
          name: 'apikey',
          description: '设置API密钥',
          type: 'string',
          alias: 'k'
        },
        {
          name: 'theme',
          description: '设置界面主题',
          type: 'string',
          choices: ['auto', 'light', 'dark', 'minimal']
        },
        {
          name: 'list',
          description: '列出当前配置',
          type: 'boolean',
          alias: 'l'
        },
        {
          name: 'reset',
          description: '重置配置',
          type: 'boolean'
        }
      ],
      examples: [
        'aicli configure --provider openai',
        'aicli configure --model gpt-4',
        'aicli configure --list'
      ],
      handler: this.handleConfigure.bind(this),
      aliases: ['config']
    });

    this.registerCommand({
      name: 'help',
      description: '显示帮助信息',
      usage: 'aicli help [command]',
      category: '帮助',
      options: [],
      examples: [
        'aicli help',
        'aicli help query'
      ],
      handler: this.handleHelp.bind(this)
    });

    this.registerCommand({
      name: 'version',
      description: '显示版本信息',
      usage: 'aicli version',
      category: '帮助',
      options: [],
      examples: ['aicli version'],
      handler: this.handleVersion.bind(this),
      aliases: ['v']
    });
  }

  private setupProgram(): void {
    this.program
      .name('aicli')
      .description('AI 编程助手终端工具')
      .version('2.0.0')
      .argument('[query...]', '查询内容')
      .option('-m, --model <model>', '指定AI模型')
      .option('-p, --provider <provider>', '指定AI提供商')
      .option('-f, --file <files...>', '包含文件上下文')
      .option('-c, --context <context>', '提供额外上下文')
      .option('-o, --output <format>', '输出格式', 'text')
      .option('--theme <theme>', '界面主题')
      .option('--continue', '继续上一次对话')
      .option('--session <session>', '指定会话ID')
      .option('--project <project>', '项目路径')
      .action((options, query) => {
        this.handleSmartCommand(options, query);
      });
  }

  registerCommand(command: AICLICommand): void {
    this.commands.set(command.name, command);

    // 注册别名
    if (command.aliases) {
      command.aliases.forEach(alias => {
        this.aliases.set(alias, command.name);
      });
    }
  }

  async parse(argv: string[]): Promise<ParseResult> {
    // 智能解析：根据参数推断用户意图
    const intent = await this.detectIntent(argv);

    if (intent.type === 'query') {
      // 单次查询模式
      return this.parseQueryCommand(argv, intent);
    } else if (intent.type === 'chat') {
      // 交互式对话模式
      return this.parseChatCommand(argv, intent);
    } else {
      // 使用commander解析标准命令
      return this.parseStandardCommand(argv);
    }
  }

  private async detectIntent(argv: string[]): Promise<CommandIntent> {
    const context: IntentContext = {
      hasQuery: false,
      hasFiles: false,
      hasOptions: false,
      isInteractive: false
    };

    // 分析参数
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      if (arg.startsWith('-')) {
        context.hasOptions = true;
      } else if (arg.includes('.')) {
        context.hasFiles = true;
      } else if (i === 0 || argv[i - 1]?.startsWith('-')) {
        context.hasQuery = true;
      }
    }

    // 检测项目上下文
    context.detectedProject = await this.projectDetector.detect(process.cwd());

    // 计算意图置信度
    let intentType: CommandIntent['type'] = 'help';
    let confidence = 0;

    if (context.hasQuery && !context.hasOptions) {
      // 简单查询模式
      intentType = 'query';
      confidence = 0.9;
    } else if (argv.length === 0 || (argv.length === 1 && argv[0] === 'chat')) {
      // 交互式模式
      intentType = 'chat';
      confidence = 0.95;
    } else if (argv.includes('help') || argv.includes('--help')) {
      // 帮助模式
      intentType = 'help';
      confidence = 1.0;
    } else if (argv.includes('version') || argv.includes('--version')) {
      // 版本模式
      intentType = 'version';
      confidence = 1.0;
    } else if (argv.includes('configure') || argv.includes('config')) {
      // 配置模式
      intentType = 'configure';
      confidence = 1.0;
    }

    return {
      type: intentType,
      confidence,
      context
    };
  }

  private parseQueryCommand(argv: string[], intent: CommandIntent): ParseResult {
    const options: Record<string, any> = {};
    const args: string[] = [];
    let query = '';

    // 解析查询内容
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      if (arg.startsWith('-')) {
        // 处理选项
        const optionName = arg.replace(/^-+/, '');
        const nextArg = argv[i + 1];

        if (nextArg && !nextArg.startsWith('-')) {
          options[optionName] = nextArg;
          i++; // 跳过下一个参数
        } else {
          options[optionName] = true;
        }
      } else {
        // 收集查询内容
        query += (query ? ' ' : '') + arg;
      }
    }

    if (query) {
      args.push(query);
    }

    return {
      command: this.commands.get('query')!,
      options,
      args,
      rawArgs: argv,
      intent
    };
  }

  private parseChatCommand(argv: string[], intent: CommandIntent): ParseResult {
    const options: Record<string, any> = {};
    const args: string[] = [];

    // 解析聊天选项
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      if (arg.startsWith('-')) {
        const optionName = arg.replace(/^-+/, '');
        const nextArg = argv[i + 1];

        if (nextArg && !nextArg.startsWith('-')) {
          options[optionName] = nextArg;
          i++;
        } else {
          options[optionName] = true;
        }
      }
    }

    return {
      command: this.commands.get('chat')!,
      options,
      args,
      rawArgs: argv,
      intent
    };
  }

  private parseStandardCommand(argv: string[]): ParseResult {
    // 使用commander解析标准命令
    this.program.parse(['aicli', ...argv]);

    // 这里需要根据commander的结果构建ParseResult
    // 简化实现，实际需要更复杂的逻辑
    return {
      command: this.commands.get('help')!,
      options: {},
      args: [],
      rawArgs: argv,
      intent: {
        type: 'help',
        confidence: 1.0,
        context: {
          hasQuery: false,
          hasFiles: false,
          hasOptions: false,
          isInteractive: false
        }
      }
    };
  }

  private handleSmartCommand(options: any, query: string[]): void {
    // 智能命令处理逻辑
    if (query.length > 0) {
      // 有查询内容，视为单次查询
      this.handleQuery(options, query);
    } else {
      // 没有查询内容，启动交互式对话
      this.handleChat(options, []);
    }
  }

  private async handleQuery(options: Record<string, any>, args: string[]): Promise<void> {
    console.log(chalk.blue('🔍 执行AI查询...'));
    console.log(chalk.gray('查询内容:'), args.join(' '));
    console.log(chalk.gray('选项:'), JSON.stringify(options, null, 2));

    // TODO: 实现实际的查询逻辑
    console.log(chalk.yellow('💡 查询功能正在开发中...'));
  }

  private async handleChat(options: Record<string, any>, args: string[]): Promise<void> {
    console.log(chalk.blue('💬 启动交互式对话...'));
    console.log(chalk.gray('选项:'), JSON.stringify(options, null, 2));

    // TODO: 实现实际的对话逻辑
    console.log(chalk.yellow('💡 交互式对话功能正在开发中...'));
  }

  private async handleConfigure(options: Record<string, any>, args: string[]): Promise<void> {
    console.log(chalk.blue('⚙️ 配置AICLI...'));
    console.log(chalk.gray('选项:'), JSON.stringify(options, null, 2));

    // TODO: 实现实际的配置逻辑
    console.log(chalk.yellow('💡 配置功能正在开发中...'));
  }

  private async handleHelp(options: Record<string, any>, args: string[]): Promise<void> {
    this.showHelp();
  }

  private async handleVersion(options: Record<string, any>, args: string[]): Promise<void> {
    console.log(chalk.bold('AICLI v2.0.0'));
    console.log(chalk.gray('AI 编程助手终端工具'));
  }

  private showHelp(): void {
    console.log(chalk.bold('AICLI - AI 编程助手终端工具'));
    console.log('');
    console.log(chalk.blue('用法:'));
    console.log('  aicli [选项] [查询...]          # 单次查询');
    console.log('  aicli chat [选项]               # 交互式对话');
    console.log('  aicli configure [选项]          # 配置设置');
    console.log('  aicli help [命令]               # 显示帮助');
    console.log('');
    console.log(chalk.blue('示例:'));
    console.log('  aicli "what\'s wrong with this code?"');
    console.log('  aicli -m gpt-4 "explain this algorithm"');
    console.log('  aicli chat --continue');
    console.log('  aicli configure --provider openai');
    console.log('');
    console.log(chalk.blue('选项:'));
    console.log('  -m, --model <model>         指定AI模型');
    console.log('  -p, --provider <provider>   指定AI提供商');
    console.log('  -f, --file <files...>       包含文件上下文');
    console.log('  -c, --context <context>     提供额外上下文');
    console.log('  -o, --output <format>       输出格式');
    console.log('      --theme <theme>         界面主题');
    console.log('      --continue              继续上一次对话');
    console.log('      --session <session>     指定会话ID');
    console.log('      --project <project>     项目路径');
    console.log('');
    console.log(chalk.gray('使用 "aicli help <命令>" 查看特定命令的详细信息。'));
  }

  // 获取所有命令
  getAllCommands(): AICLICommand[] {
    return Array.from(this.commands.values()).filter(cmd => !cmd.hidden);
  }

  // 按类别获取命令
  getCommandsByCategory(category: string): AICLICommand[] {
    return this.getAllCommands().filter(cmd => cmd.category === category);
  }

  // 查找命令
  findCommand(name: string): AICLICommand | undefined {
    // 直接查找
    if (this.commands.has(name)) {
      return this.commands.get(name);
    }

    // 通过别名查找
    const actualName = this.aliases.get(name);
    if (actualName) {
      return this.commands.get(actualName);
    }

    return undefined;
  }
}

// 项目检测器
export class ProjectDetector {
  async detect(path: string): Promise<ProjectInfo | undefined> {
    try {
      const indicators = await this.scanIndicators(path);

      if (indicators.length === 0) {
        return undefined;
      }

      return {
        type: this.classifyProject(indicators),
        language: this.detectLanguage(indicators),
        framework: this.detectFramework(indicators),
        path,
        confidence: this.calculateConfidence(indicators)
      };
    } catch (error) {
      return undefined;
    }
  }

  private async scanIndicators(path: string): Promise<string[]> {
    const indicators: string[] = [];

    // 扫描常见项目文件
    const commonFiles = [
      'package.json',
      'requirements.txt',
      'pom.xml',
      'build.gradle',
      'Cargo.toml',
      'go.mod',
      'composer.json',
      'Gemfile',
      'mix.exs',
      'pubspec.yaml',
      'project.clj',
      'sbt.sbt',
      'stack.yaml',
      'CMakeLists.txt',
      'Makefile'
    ];

    for (const file of commonFiles) {
      if (await this.fileExists(path, file)) {
        indicators.push(file);
      }
    }

    return indicators;
  }

  private async fileExists(dir: string, file: string): Promise<boolean> {
    const fs = await import('fs');
    return fs.existsSync(path.join(dir, file));
  }

  private classifyProject(indicators: string[]): string {
    if (indicators.includes('package.json')) return 'nodejs';
    if (indicators.includes('requirements.txt') || indicators.includes('pyproject.toml')) return 'python';
    if (indicators.includes('pom.xml') || indicators.includes('build.gradle')) return 'java';
    if (indicators.includes('Cargo.toml')) return 'rust';
    if (indicators.includes('go.mod')) return 'go';
    if (indicators.includes('composer.json')) return 'php';
    if (indicators.includes('Gemfile')) return 'ruby';
    if (indicators.includes('mix.exs')) return 'elixir';
    if (indicators.includes('pubspec.yaml')) return 'dart';
    if (indicators.includes('project.clj') || indicators.includes('sbt.sbt')) return 'scala';
    if (indicators.includes('stack.yaml')) return 'haskell';
    if (indicators.includes('CMakeLists.txt')) return 'cpp';
    if (indicators.includes('Makefile')) return 'c';

    return 'unknown';
  }

  private detectLanguage(indicators: string[]): string {
    const projectType = this.classifyProject(indicators);
    const languageMap: Record<string, string> = {
      'nodejs': 'javascript',
      'python': 'python',
      'java': 'java',
      'rust': 'rust',
      'go': 'go',
      'php': 'php',
      'ruby': 'ruby',
      'elixir': 'elixir',
      'dart': 'dart',
      'scala': 'scala',
      'haskell': 'haskell',
      'cpp': 'cpp',
      'c': 'c'
    };

    return languageMap[projectType] || 'unknown';
  }

  private detectFramework(indicators: string[]): string | undefined {
    // TODO: 实现框架检测逻辑
    return undefined;
  }

  private calculateConfidence(indicators: string[]): number {
    // 简单的置信度计算
    return Math.min(indicators.length * 0.3, 1.0);
  }
}

// 导出单例实例
export const smartCommandParser = new SmartCommandParser();