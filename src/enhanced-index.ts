#!/usr/bin/env node

import { EnhancedCLIInterface } from './ui/enhanced-cli-interface';
import { PrintModeHandler, main as printModeMain } from './sdk/print-mode';
import { UpdateManager } from './core/update-manager';
import { MCPManager } from './core/mcp-manager';
import chalk from 'chalk';

interface ProgramOptions {
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
}

function parseArguments(): ProgramOptions {
  const options: ProgramOptions = {};
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
        options.model = args[++i];
        break;

      case '--base-url':
      case '-u':
        options.baseUrl = args[++i];
        break;

      case '--max-files':
        options.maxFiles = parseInt(args[++i]);
        break;

      case '--max-file-size':
        options.maxFileSize = parseInt(args[++i]) * 1024 * 1024; // Convert MB to bytes
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

      // 新增的打印模式相关标志
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

      // 会话管理相关
      case '--continue':
      case '-c':
        options.continue = true;
        break;

      case '--resume':
      case '-r':
        options.resume = args[++i];
        break;

      // 权限和工具控制
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

      // 系统功能
      case 'update':
        options.update = true;
        break;

      case 'mcp':
        options.mcp = true;
        // 检查MCP子命令
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.mcpAction = args[++i];

          // 如果是针对特定服务器的操作
          if (['start', 'stop', 'status', 'test', 'remove'].includes(options.mcpAction)) {
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
              options.mcpServer = args[++i];
            }
          }
        }
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
🚀 AICLI - 增强版 AI 命令行工具

用法:
  aicli [选项] [查询]

基本选项:
  -p, --provider <provider>    AI提供商 (deepseek, openai, claude) [默认: deepseek]
  -k, --api-key <key>         API密钥 [默认: 从环境变量读取]
  -m, --model <model>         模型名称
  -u, --base-url <url>        API基础URL
  -h, --help                  显示帮助信息

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

功能特性:
  📁 文件拖拽                   - 拖拽文件到终端窗口自动添加
  📋 剪贴板粘贴                 - 粘贴图片、文件路径或文本
  📎 附件管理                   - 添加、删除、查看附件
  🤖 AI对话                     - 支持多模态对话(文本+图片+文档)
  📤 文件上传                   - 自动上传附件到AI模型
  ⚡ 流式响应                   - 实时显示AI回复
  🎨 美观界面                   - 现代化CLI界面设计

支持文件类型:
  📄 文档: PDF, DOC, DOCX, TXT, MD
  🖼️ 图片: PNG, JPG, JPEG, GIF, WEBP, BMP
  📝 代码: JS, TS, PY, JAVA, CPP, JSON, XML
  💾 其他: 支持所有文件类型

使用示例:
  # 基本使用
  aicli

  # 打印模式 - 直接查询
  aicli --print "解释这个函数"
  aicli -p "What does this code do?"

  # 打印模式 - JSON输出
  aicli --print --output-format json "分析这段代码"
  aicli -p --output-format stream-json "详细解释"

  # 管道输入
  cat logs.txt | aicli --print "分析这些日志"
  echo "代码" | aicli -p "优化这段代码"

  # 会话管理
  aicli --continue              # 继续最近对话
  aicli -c "继续上次讨论"       # 继续对话并发送消息
  aicli --resume abc123 "完成这个任务"  # 恢复特定会话

  # 高级功能
  aicli --print --max-turns 3 "简单回答"
  aicli --print --append-system-prompt "你是专家" "解释一下"

  # 指定提供商和模型
  aicli --provider deepseek --model deepseek-chat

  # 使用自定义API密钥
  aicli --api-key "your-api-key"

  # 设置文件限制
  aicli --max-files 10 --max-file-size 20

  # 启用/禁用自动清除附件
  aicli --auto-clear              # 启用自动清除（默认）
  aicli --no-auto-clear           # 禁用自动清除

交互命令:
  /paste, /p                   粘贴剪贴板内容
  /attachments, /att           查看附件列表
  /clear, /c                  清空附件列表
  /remove <n>, /rm <n>         删除第 n 个附件
  /upload [path], /up [path]  上传文件
  /status, /st                查看系统状态
  /help, /h                   显示帮助
  /quit, /q                   退出程序

快捷键:
  Ctrl+C                      取消当前请求/退出
  Ctrl+V                      粘贴剪贴板内容

技术支持:
  GitHub: https://github.com/your-repo/aicli
  文档: https://docs.aicli.dev
  问题反馈: https://github.com/your-repo/aicli/issues
`));
}

async function handlePrintOrContinueMode(options: ProgramOptions): Promise<void> {
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

async function handleContinueMode(handler: PrintModeHandler, options: ProgramOptions, stdinContent?: string): Promise<void> {
  if (!options.query && !stdinContent) {
    console.error(chalk.red('❌ 错误: 继续会话需要提供查询内容'));
    process.exit(1);
  }

  const query = options.query || stdinContent || '';
  await handler.continueLastSession(query, stdinContent);
}

async function handleResumeMode(handler: PrintModeHandler, options: ProgramOptions, stdinContent?: string): Promise<void> {
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

async function handleMCPCommand(options: ProgramOptions): Promise<void> {
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
          console.log(chalk.gray('用法: aicli mcp test <server-name>'));
          process.exit(1);
        }
        await mcpManager.testServer(options.mcpServer);
        break;

      case 'remove':
        if (!options.mcpServer) {
          console.error(chalk.red('❌ 错误: 删除服务器需要指定服务器名称'));
          console.log(chalk.gray('用法: aicli mcp remove <server-name>'));
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

    // 检查是否是打印模式
    if (options.print || options.continue || options.resume || options.query) {
      await handlePrintOrContinueMode(options);
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

    if (!apiKey && !options.apiKey) {
      // 静默处理，不在启动时输出，由界面内部处理状态显示
    }

    // 设置默认选项
    const cliOptions = {
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
      verbose: options.verbose
    };

    // 创建并启动CLI界面
    const cli = new EnhancedCLIInterface(cliOptions);
    await cli.start();

  } catch (error) {
    console.error(chalk.red(`❌ 启动失败: ${error instanceof Error ? error.message : '未知错误'}`));
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