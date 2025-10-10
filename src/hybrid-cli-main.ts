#!/usr/bin/env node

import { HybridCLIInterface } from './ui/hybrid-cli-interface';
import { PrintModeHandler, main as printModeMain } from './sdk/print-mode';
import { UpdateManager } from './core/update-manager';
import { MCPManager } from './core/mcp-manager';
import { LayoutMode } from './ui/hybrid-layout';
import chalk from 'chalk';

// 模型别名解析
function resolveModelAlias(alias: string): string {
  const modelAliases: Record<string, string> = {
    // DeepSeek 模型别名
    'sonnet': 'deepseek-chat',
    'opus': 'deepseek-reasoner',
    'haiku': 'deepseek-coder',
    'default': 'deepseek-chat',
    'chat': 'deepseek-chat',
    'reasoner': 'deepseek-reasoner',
    'coder': 'deepseek-coder',

    // OpenAI 模型别名
    'gpt-4': 'gpt-4-turbo-preview',
    'gpt-3.5': 'gpt-3.5-turbo',
    'gpt4': 'gpt-4-turbo-preview',
    'gpt35': 'gpt-3.5-turbo',

    // Claude 模型别名
    'claude-3': 'claude-3-sonnet-20240229',
    'claude-opus': 'claude-3-opus-20240229',
    'claude-sonnet': 'claude-3-sonnet-20240229',
    'claude-haiku': 'claude-3-haiku-20240307'
  };

  return modelAliases[alias.toLowerCase()] || alias;
}

interface HybridProgramOptions {
  provider?: 'deepseek' | 'openai' | 'claude';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxFiles?: number;
  maxFileSize?: number;
  streaming?: boolean;
  autoClearAttachments?: boolean;
  help?: boolean;
  print?: boolean;
  outputFormat?: 'text' | 'json' | 'stream-json';
  inputFormat?: 'text' | 'stream-json';
  includePartialMessages?: boolean;
  appendSystemPrompt?: string;
  maxTurns?: number;
  verbose?: boolean;
  continue?: boolean;
  resume?: string;
  showSessions?: boolean;
  allowedTools?: string;
  disallowedTools?: string;
  addDir?: string[];
  permissionMode?: string;
  permissionPromptTool?: string;
  dangerouslySkipPermissions?: boolean;
  query?: string;
  update?: boolean;
  mcp?: boolean;
  mcpAction?: string;
  mcpServer?: string;

  // 新增的混合布局选项
  layoutMode?: LayoutMode;
  adaptiveLayout?: boolean;
  dashboardEnabled?: boolean;
  noAdaptive?: boolean;
  classic?: boolean;
}

function parseArguments(): HybridProgramOptions {
  const options: HybridProgramOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--provider':
      case '-p':
        options.provider = args[++i] as any;
        break;

      case '--api-key':
      case '-k':
        options.apiKey = args[++i];
        break;

      case '--model':
      case '-m':
        options.model = resolveModelAlias(args[++i]);
        break;

      case '--base-url':
      case '-u':
        options.baseUrl = args[++i];
        break;

      case '--max-files':
        options.maxFiles = parseInt(args[++i]);
        break;

      case '--max-file-size':
        options.maxFileSize = parseInt(args[++i]) * 1024 * 1024;
        break;

      case '--streaming':
      case '-s':
        options.streaming = true;
        break;

      case '--no-streaming':
        options.streaming = false;
        break;

      case '--auto-clear':
        options.autoClearAttachments = true;
        break;

      case '--no-auto-clear':
        options.autoClearAttachments = false;
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;

      case '--print':
        options.print = true;
        break;

      case '--output-format':
        options.outputFormat = args[++i] as any;
        break;

      case '--input-format':
        options.inputFormat = args[++i] as any;
        break;

      case '--include-partial-messages':
        options.includePartialMessages = true;
        break;

      case '--append-system-prompt':
        options.appendSystemPrompt = args[++i];
        break;

      case '--max-turns':
        options.maxTurns = parseInt(args[++i]);
        break;

      case '--verbose':
        options.verbose = true;
        break;

      case '--continue':
      case '-c':
        options.continue = true;
        break;

      case '--resume':
      case '-r':
        options.resume = args[++i];
        break;

      case '--sessions':
        options.showSessions = true;
        break;

      case '--allowedTools':
        options.allowedTools = args[++i];
        break;

      case '--disallowedTools':
        options.disallowedTools = args[++i];
        break;

      case '--add-dir':
        const dir = args[++i];
        if (!options.addDir) options.addDir = [];
        options.addDir.push(dir);
        break;

      case '--permission-mode':
        options.permissionMode = args[++i];
        break;

      case '--permission-prompt-tool':
        options.permissionPromptTool = args[++i];
        break;

      case '--dangerously-skip-permissions':
        options.dangerouslySkipPermissions = true;
        break;

      case 'update':
        options.update = true;
        break;

      case 'mcp':
        options.mcp = true;
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.mcpAction = args[++i];

          if (['start', 'stop', 'status', 'test', 'remove'].includes(options.mcpAction)) {
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
              options.mcpServer = args[++i];
            }
          }
        }
        break;

      // 新增的混合布局选项
      case '--layout-mode':
      case '-l':
        const mode = args[++i];
        if (['chat', 'dashboard', 'adaptive'].includes(mode.toLowerCase())) {
          options.layoutMode = mode.toLowerCase() as LayoutMode;
        }
        break;

      case '--adaptive':
        options.adaptiveLayout = true;
        break;

      case '--no-adaptive':
        options.noAdaptive = true;
        break;

      case '--dashboard':
        options.dashboardEnabled = true;
        break;

      case '--no-dashboard':
        options.dashboardEnabled = false;
        break;

      case '--classic':
        options.classic = true;
        break;

      // 处理查询参数（非标志参数）
      default:
        if (!arg.startsWith('--') && !arg.startsWith('-')) {
          options.query = arg;
        }
        break;
    }
  }

  return options;
}

function displayHelp(): void {
  console.log(chalk.cyan(`
🚀 AICLI - 混合布局版本
现代化的AI编程助手终端工具

用法:
  aicli-hybrid [选项] [查询]

基本选项:
  -p, --provider <provider>    AI提供商 (deepseek, openai, claude) [默认: deepseek]
  -k, --api-key <key>         API密钥 [默认: 从环境变量读取]
  -m, --model <model>         模型名称 [支持别名: sonnet, opus, haiku, gpt-4, claude-3等]
  -u, --base-url <url>        API基础URL
  -h, --help                  显示帮助信息

🎨 布局选项:
  -l, --layout-mode <mode>    布局模式 (chat, dashboard, adaptive) [默认: adaptive]
  --adaptive                  启用自适应布局
  --no-adaptive               禁用自适应布局
  --dashboard                 启用仪表盘
  --no-dashboard              禁用仪表盘
  --classic                   使用经典布局（兼容模式）

📱 布局模式说明:
  chat        - 流式聊天布局 (类似Qoder CLI)
  dashboard   - 仪表盘布局 (类似Claude Code CLI)
  adaptive    - 自适应布局 (智能切换)

打印模式 (SDK):
  --print, -p                 打印响应而不使用交互模式
  --output-format <format>    输出格式 (text, json, stream-json) [默认: text]
  --input-format <format>     输入格式 (text, stream-json) [默认: text]
  --include-partial-messages  在流式JSON输出中包含部分消息
  --append-system-prompt <msg> 附加系统提示
  --max-turns <number>        限制最大轮数

会话管理:
  --continue, -c              继续最近的对话
  --resume, -r <id> [query]   通过ID恢复会话
  --sessions                  显示所有会话历史
  --query <text>              直接查询（与--print一起使用）

权限控制:
  --allowedTools <list>       允许的工具列表
  --disallowedTools <list>    禁止的工具列表
  --add-dir <path>            添加额外工作目录
  --permission-mode <mode>    权限模式
  --permission-prompt-tool <tool>  权限提示工具
  --dangerously-skip-permissions 跳过权限提示

文件和界面选项:
  --max-files <number>        最大文件数量 [默认: 20]
  --max-file-size <mb>        最大文件大小(MB) [默认: 50]
  -s, --streaming             启用流式响应 [默认: 启用]
  --no-streaming              禁用流式响应
  --auto-clear                启用自动清除附件
  --no-auto-clear             禁用自动清除附件
  --verbose                   启用详细日志

系统命令:
  update                      更新到最新版本
  mcp [action] [server]       MCP服务器管理

⌨️  混合布局快捷键:
  Ctrl+L                      切换布局模式
  Ctrl+T                      显示/隐藏仪表盘
  Ctrl+H                      显示帮助
  Ctrl+U                      上传文件
  Ctrl+P                      粘贴剪贴板内容
  Ctrl+C                      退出程序

交互命令:
  /help, /h                   显示帮助
  /mode                       切换布局模式
  /dashboard                  切换仪表盘显示
  /chat                       切换到聊天模式
  /status, /st                显示系统状态
  /clear, /c                  清空屏幕/附件
  /exit, /q                   退出程序

✨ 新功能特性:
  🎨 三种布局模式：聊天、仪表盘、自适应
  🤖 智能布局切换：根据内容类型和性能自动调整
  📊 实时状态仪表盘：系统监控、性能指标、工具状态
  📎 增强附件管理：拖拽上传、剪贴板粘贴、截图支持
  💬 流式对话体验：实时响应、语法高亮、代码渲染
  🔧 强大工具系统：文件操作、命令执行、智能搜索
  💾 会话历史管理：自动保存、快速恢复、搜索功能

模型别名:
  DeepSeek: sonnet→deepseek-chat, opus→deepseek-reasoner, haiku→deepseek-coder
  OpenAI: gpt-4→gpt-4-turbo-preview, gpt-3.5→gpt-3.5-turbo
  Claude: claude-3→claude-3-sonnet, claude-opus→claude-3-opus, claude-haiku→claude-3-haiku

MCP子命令:
    list                      列出所有MCP服务器
    start [server]            启动服务器
    stop [server]             停止服务器
    status [server]           查看服务器状态
    test [server]             测试服务器连接
    remove <server>           删除服务器
    add <config>              添加服务器(JSON格式)

环境变量:
  DEEPSEEK_API_KEY            DeepSeek API密钥
  OPENAI_API_KEY              OpenAI API密钥
  CLAUDE_API_KEY              Claude API密钥

使用示例:
  # 基本使用（自适应模式）
  aicli-hybrid

  # 使用特定布局模式
  aicli-hybrid --layout-mode chat
  aicli-hybrid --layout-mode dashboard
  aicli-hybrid -l adaptive

  # 禁用自适应布局
  aicli-hybrid --no-adaptive

  # 经典兼容模式
  aicli-hybrid --classic

  # 打印模式 - 直接查询
  aicli-hybrid --print "解释这个函数"
  aicli-hybrid -p "What does this code do?"

  # 会话管理
  aicli-hybrid --continue              # 继续最近对话
  aicli-hybrid -c "继续上次讨论"       # 继续对话并发送消息
  aicli-hybrid --resume abc123 "完成这个任务"  # 恢复特定会话

  # 高级功能
  aicli-hybrid --print --max-turns 3 "简单回答"
  aicli-hybrid --verbose --dashboard   # 详细日志 + 仪表盘

技术支持:
  GitHub: https://github.com/your-repo/aicli
  文档: https://docs.aicli.dev
  问题反馈: https://github.com/your-repo/aicli/issues

🎯 混合布局设计基于 Qoder CLI 和 Claude Code CLI 的技术分析，
    提供最佳的终端交互体验！
`));
}

async function handlePrintOrContinueMode(options: HybridProgramOptions): Promise<void> {
  try {
    // 检查标准输入
    let stdinContent = '';
    if (!process.stdin.isTTY) {
      stdinContent = await new Promise<string>((resolve) => {
        let content = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          content += chunk;
        });
        process.stdin.on('end', () => {
          resolve(content.trim());
        });
      });
    }

    // 从环境变量获取API密钥
    const deepseekKey = process.env.DEEPSEEK_API_KEY || options.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    // 确定API密钥
    let apiKey = '';
    let provider = options.provider || 'deepseek';

    if (options.provider === 'deepseek' || !options.provider) {
      apiKey = deepseekKey || '';
      provider = 'deepseek';
    } else if (options.provider === 'openai') {
      apiKey = openaiKey || '';
      provider = 'openai';
    } else if (options.provider === 'claude') {
      apiKey = claudeKey || '';
      provider = 'claude';
    }

    const sdkOptions = {
      provider,
      apiKey: options.apiKey || apiKey,
      model: options.model,
      baseUrl: options.baseUrl,
      outputFormat: options.outputFormat || 'text',
      inputFormat: options.inputFormat,
      includePartialMessages: options.includePartialMessages,
      appendSystemPrompt: options.appendSystemPrompt,
      maxTurns: options.maxTurns,
      verbose: options.verbose
    };

    const handler = new PrintModeHandler(sdkOptions);

    // 处理不同的模式
    if (options.continue && !options.resume) {
      // 继续最近的对话
      await handleContinueMode(handler, options, stdinContent);
    } else if (options.resume) {
      // 恢复特定会话
      await handleResumeMode(handler, options, stdinContent);
    } else if (options.print || options.query) {
      // 打印模式
      const query = options.query || stdinContent || '';
      if (!query) {
        console.error(chalk.red('❌ 错误: 未提供查询内容'));
        process.exit(1);
      }
      await handler.handleQuery(query, stdinContent);
    }

  } catch (error) {
    console.error(chalk.red(`❌ 打印模式失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

async function handleContinueMode(handler: PrintModeHandler, options: HybridProgramOptions, stdinContent?: string): Promise<void> {
  if (!options.query && !stdinContent) {
    console.error(chalk.red('❌ 错误: 继续会话需要提供查询内容'));
    process.exit(1);
  }

  const query = options.query || stdinContent || '';
  await handler.continueLastSession(query, stdinContent);
}

async function handleResumeMode(handler: PrintModeHandler, options: HybridProgramOptions, stdinContent?: string): Promise<void> {
  if (!options.resume) {
    console.error(chalk.red('❌ 错误: 恢复会话需要提供会话ID'));
    process.exit(1);
  }

  if (!options.query && !stdinContent) {
    console.error(chalk.red('❌ 错误: 恢复会话需要提供查询内容'));
    process.exit(1);
  }

  const query = options.query || stdinContent || '';
  await handler.resumeSession(options.resume, query, stdinContent);
}

async function handleUpdateCommand(): Promise<void> {
  try {
    const updateManager = new UpdateManager();

    console.log(chalk.blue('🔍 检查更新...'));
    const updateInfo = await updateManager.checkForUpdates();

    if (updateInfo.updateAvailable) {
      console.log(chalk.green(`🚀 发现新版本: ${updateInfo.latestVersion}`));
      console.log(chalk.yellow(`当前版本: ${updateInfo.currentVersion}`));

      const success = await updateManager.performUpdate();
      if (success) {
        console.log(chalk.green('✅ 更新完成！'));
      } else {
        console.log(chalk.red('❌ 更新失败'));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('✅ 已是最新版本'));
      console.log(chalk.gray(`当前版本: ${updateInfo.currentVersion}`));
    }

  } catch (error) {
    console.error(chalk.red(`❌ 更新检查失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

async function handleMCPCommand(options: HybridProgramOptions): Promise<void> {
  try {
    const mcpManager = new MCPManager();
    const action = options.mcpAction || 'list';

    switch (action) {
      case 'list':
        mcpManager.listServers();
        break;

      case 'start':
        if (options.mcpServer) {
          await mcpManager.startServer(options.mcpServer);
        } else {
          await mcpManager.startAllEnabledServers();
        }
        break;

      case 'stop':
        if (options.mcpServer) {
          mcpManager.stopServer(options.mcpServer);
        } else {
          mcpManager.stopAllServers();
        }
        break;

      case 'status':
        mcpManager.showServerStatus(options.mcpServer);
        break;

      case 'test':
        if (!options.mcpServer) {
          console.error(chalk.red('❌ 错误: 测试服务器需要指定服务器名称'));
          console.log(chalk.gray('用法: aicli-hybrid mcp test <server-name>'));
          process.exit(1);
        }
        await mcpManager.testServer(options.mcpServer);
        break;

      case 'remove':
        if (!options.mcpServer) {
          console.error(chalk.red('❌ 错误: 删除服务器需要指定服务器名称'));
          console.log(chalk.gray('用法: aicli-hybrid mcp remove <server-name>'));
          process.exit(1);
        }
        mcpManager.removeServer(options.mcpServer);
        break;

      case 'add':
        console.error(chalk.red('❌ 错误: 添加服务器功能需要通过配置文件实现'));
        console.log(chalk.gray('请手动编辑 ~/.config/aicli/mcp.json 文件'));
        break;

      default:
        console.error(chalk.red(`❌ 错误: 未知的MCP操作 "${action}"`));
        console.log(chalk.gray('可用操作: list, start, stop, status, test, remove, add'));
        process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red(`❌ MCP命令执行失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

async function handleShowSessionsCommand(): Promise<void> {
  try {
    const { SessionManagerV3 } = await import('./core/session-manager-v3');
    const sessionManager = new SessionManagerV3();
    const sessions = await sessionManager.getAllSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('📝 暂无会话历史'));
      console.log(chalk.gray('开始新的对话来创建会话历史'));
      return;
    }

    console.log(chalk.cyan(`\n📝 会话历史 (${sessions.length}个会话)`));
    console.log(chalk.gray('─'.repeat(80)));

    // 按最后更新时间排序
    const sortedSessions = sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    sortedSessions.forEach((session, index) => {
      const createdTime = new Date(session.createdAt).toLocaleString();
      const updatedTime = new Date(session.updatedAt).toLocaleString();
      const modelInfo = `${session.provider}/${session.model}`;
      const messageCount = session.messages.length;

      // 显示会话ID的前8位
      const shortId = session.id.substring(0, 8);

      console.log(`${chalk.cyan((index + 1).toString() + '.')} ${chalk.white(session.title)}`);
      console.log(`   ID: ${chalk.gray(shortId)}... | 模型: ${chalk.blue(modelInfo)} | 消息: ${chalk.green(messageCount.toString())}`);
      console.log(`   创建: ${chalk.gray(createdTime)} | 更新: ${chalk.gray(updatedTime)}`);

      // 显示最后一条用户消息的预览
      const lastUserMessage = session.messages
        .filter(msg => msg.role === 'user')
        .pop();

      if (lastUserMessage) {
        const preview = lastUserMessage.content.length > 50
          ? lastUserMessage.content.substring(0, 50) + '...'
          : lastUserMessage.content;
        console.log(`   预览: ${chalk.gray(preview)}`);
      }

      console.log('');
    });

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white('💡 使用方法:'));
    console.log(chalk.gray('  继续最近对话: aicli-hybrid --continue'));
    console.log(chalk.gray('  恢复特定会话: aicli-hybrid --resume <会话ID>'));
    console.log(chalk.gray('  查看会话详情: aicli-hybrid --resume <会话ID> --status'));

  } catch (error) {
    console.error(chalk.red(`❌ 显示会话列表失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArguments();

    if (options.help) {
      displayHelp();
      process.exit(0);
    }

    // 处理系统命令
    if (options.update) {
      await handleUpdateCommand();
      return;
    }

    if (options.mcp) {
      await handleMCPCommand(options);
      return;
    }

    // 处理会话列表显示
    if (options.showSessions) {
      await handleShowSessionsCommand();
      return;
    }

    // 检查是否是打印模式
    if (options.print || options.continue || options.resume || options.query) {
      await handlePrintOrContinueMode(options);
      return;
    }

    // 检查是否使用经典模式（向后兼容）
    if (options.classic) {
      console.log(chalk.yellow('🔄 启动经典兼容模式...'));
      const { EnhancedCLIInterface } = await import('./ui/enhanced-cli-interface');

      const classicOptions = {
        provider: options.provider as any,
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl,
        maxFiles: options.maxFiles || 20,
        maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
        enableStreaming: options.streaming !== false,
        allowedTools: options.allowedTools,
        disallowedTools: options.disallowedTools,
        addDir: options.addDir,
        permissionMode: options.permissionMode,
        permissionPromptTool: options.permissionPromptTool,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions,
        verbose: options.verbose
      };

      const classicCLI = new EnhancedCLIInterface(classicOptions);
      await classicCLI.start();
      return;
    }

    // 从环境变量获取API密钥
    const deepseekKey = process.env.DEEPSEEK_API_KEY || options.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    // 确定API密钥
    let apiKey = '';
    let provider = options.provider || 'deepseek';

    if (options.provider === 'deepseek' || !options.provider) {
      apiKey = deepseekKey || '';
      provider = 'deepseek';
    } else if (options.provider === 'openai') {
      apiKey = openaiKey || '';
      provider = 'openai';
    } else if (options.provider === 'claude') {
      apiKey = claudeKey || '';
      provider = 'claude';
    }

    // 设置默认选项
    const hybridOptions = {
      provider: provider as any,
      apiKey: options.apiKey || apiKey,
      model: options.model,
      baseUrl: options.baseUrl,
      maxFiles: options.maxFiles || 20,
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024,
      enableStreaming: options.streaming !== false,
      allowedTools: options.allowedTools,
      disallowedTools: options.disallowedTools,
      addDir: options.addDir,
      permissionMode: options.permissionMode,
      permissionPromptTool: options.permissionPromptTool,
      dangerouslySkipPermissions: options.dangerouslySkipPermissions,
      verbose: options.verbose,
      initialMode: options.layoutMode || LayoutMode.ADAPTIVE,
      adaptiveLayout: options.adaptiveLayout ?? !options.noAdaptive,
      dashboardEnabled: options.dashboardEnabled ?? true
    };

    // 显示启动信息
    if (options.verbose) {
      console.log(chalk.blue('🚀 启动混合布局版本...'));
      console.log(chalk.gray(`  模式: ${hybridOptions.initialMode}`));
      console.log(chalk.gray(`  自适应: ${hybridOptions.adaptiveLayout ? '启用' : '禁用'}`));
      console.log(chalk.gray(`  仪表盘: ${hybridOptions.dashboardEnabled ? '启用' : '禁用'}`));
    }

    // 创建并启动混合布局CLI界面
    const hybridCLI = new HybridCLIInterface(hybridOptions);
    await hybridCLI.start();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error(chalk.red(`❌ 启动失败: ${errorMessage}`));
    if (process.env.DEBUG && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ 未捕获的异常: ${error.message}`));
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red(`❌ 未处理的Promise拒绝: ${reason}`));
  process.exit(1);
});

// 处理进程信号
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 收到中断信号，正在退出...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 收到终止信号，正在退出...'));
  process.exit(0);
});

// 启动应用
main().catch((error) => {
  console.error(chalk.red(`❌ 应用启动失败: ${error instanceof Error ? error.message : '未知错误'}`));
  process.exit(1);
});