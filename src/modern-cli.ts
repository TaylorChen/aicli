#!/usr/bin/env node

/**
 * Modern AICLI - 现代化的AI命令行助手
 * 设计理念：简洁、快速、直观
 * 参考：Claude CLI 和最佳CLI实践
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';

// 启动性能标记
const startTime = performance.now();

// 延迟导入以提升启动速度
let EnhancedCLIInterface: any;
let PrintModeHandler: any;
let SessionManagerV3: any;
let UpdateManager: any;
let MCPManager: any;

// 简化的命令行参数解析
interface CLIOptions {
  // 模式
  mode: 'interactive' | 'print' | 'continue' | 'resume';
  
  // 基本配置
  provider?: string;
  model?: string;
  apiKey?: string;
  
  // 查询和输入
  query?: string;
  sessionId?: string;
  
  // 输出控制
  outputFormat?: 'text' | 'json' | 'stream-json';
  verbose?: boolean;
  
  // 系统命令
  systemCommand?: 'update' | 'mcp' | 'sessions' | 'version' | 'help';
  mcpAction?: string;
  mcpServer?: string;
  
  // 其他选项
  [key: string]: any;
}

/**
 * 快速参数解析器
 * 实现渐进式复杂度：支持从最简单到最复杂的使用方式
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    mode: 'interactive', // 默认交互模式
  };

  // 没有参数 -> 交互模式
  if (args.length === 0) {
    return options;
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // 系统命令
    if (arg === 'update') {
      options.systemCommand = 'update';
      return options;
    }
    if (arg === 'mcp') {
      options.systemCommand = 'mcp';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.mcpAction = args[++i];
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options.mcpServer = args[++i];
        }
      }
      return options;
    }
    if (arg === 'sessions') {
      options.systemCommand = 'sessions';
      return options;
    }
    if (arg === 'version' || arg === '-v' || arg === '--version') {
      options.systemCommand = 'version';
      return options;
    }
    if (arg === 'help' || arg === '-h' || arg === '--help') {
      options.systemCommand = 'help';
      return options;
    }

    // 模式标志
    if (arg === '-p' || arg === '--print') {
      options.mode = 'print';
      i++;
      continue;
    }
    if (arg === '-c' || arg === '--continue') {
      options.mode = 'continue';
      i++;
      continue;
    }
    if (arg === '-r' || arg === '--resume') {
      options.mode = 'resume';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.sessionId = args[++i];
      }
      i++;
      continue;
    }

    // 配置选项
    if (arg === '--provider' && i + 1 < args.length) {
      options.provider = args[++i];
      i++;
      continue;
    }
    if (arg === '-m' || arg === '--model') {
      if (i + 1 < args.length) {
        options.model = args[++i];
      }
      i++;
      continue;
    }
    if (arg === '-k' || arg === '--api-key') {
      if (i + 1 < args.length) {
        options.apiKey = args[++i];
      }
      i++;
      continue;
    }

    // 输出控制
    if (arg === '--output-format' && i + 1 < args.length) {
      options.outputFormat = args[++i] as any;
      i++;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      i++;
      continue;
    }

    // 其他标志
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
      i++;
      continue;
    }

    // 位置参数 -> 查询内容
    if (!arg.startsWith('-')) {
      options.query = arg;
      // 如果有查询且没有显式设置模式，默认为打印模式
      if (options.mode === 'interactive') {
        options.mode = 'print';
      }
    }

    i++;
  }

  return options;
}

/**
 * 显示简洁的帮助信息
 * 分层次显示，避免信息过载
 */
function showHelp(): void {
  console.log(chalk.cyan.bold('\n🚀 AICLI - 现代化AI命令行助手\n'));
  
  console.log(chalk.white('基本用法:'));
  console.log(chalk.gray('  aicli                          ') + '启动交互式对话');
  console.log(chalk.gray('  aicli "查询内容"                ') + '直接提问并返回结果');
  console.log(chalk.gray('  aicli -p "查询内容"             ') + '打印模式（非交互）');
  console.log(chalk.gray('  cat file.js | aicli -p "分析"   ') + '管道输入处理');
  
  console.log(chalk.white('\n会话管理:'));
  console.log(chalk.gray('  aicli -c                       ') + '继续最近的对话');
  console.log(chalk.gray('  aicli -c "继续讨论"             ') + '继续对话并发送消息');
  console.log(chalk.gray('  aicli -r <session-id>          ') + '恢复特定会话');
  console.log(chalk.gray('  aicli sessions                 ') + '查看所有会话');
  
  console.log(chalk.white('\n配置选项:'));
  console.log(chalk.gray('  --provider <name>              ') + 'AI提供商 (deepseek, openai, claude)');
  console.log(chalk.gray('  -m, --model <name>             ') + '模型名称');
  console.log(chalk.gray('  -k, --api-key <key>            ') + 'API密钥');
  console.log(chalk.gray('  --output-format <format>       ') + '输出格式 (text, json)');
  console.log(chalk.gray('  --verbose                      ') + '详细输出');
  
  console.log(chalk.white('\n系统命令:'));
  console.log(chalk.gray('  aicli update                   ') + '更新到最新版本');
  console.log(chalk.gray('  aicli mcp [action] [server]    ') + 'MCP服务器管理');
  console.log(chalk.gray('  aicli version                  ') + '显示版本信息');
  console.log(chalk.gray('  aicli help                     ') + '显示帮助信息');
  
  console.log(chalk.white('\n环境变量:'));
  console.log(chalk.gray('  DEEPSEEK_API_KEY               ') + 'DeepSeek API密钥');
  console.log(chalk.gray('  OPENAI_API_KEY                 ') + 'OpenAI API密钥');
  console.log(chalk.gray('  CLAUDE_API_KEY                 ') + 'Claude API密钥');
  
  console.log(chalk.white('\n交互模式命令:'));
  console.log(chalk.gray('  /help, /h                      ') + '显示帮助');
  console.log(chalk.gray('  /paste, /p                     ') + '粘贴剪贴板');
  console.log(chalk.gray('  /vim                           ') + '进入Vim模式');
  console.log(chalk.gray('  /status                        ') + '系统状态');
  console.log(chalk.gray('  /quit, /q                      ') + '退出');
  
  console.log(chalk.gray('\n更多信息: ') + chalk.cyan('https://github.com/your-repo/aicli'));
  console.log('');
}

/**
 * 显示版本信息
 */
function showVersion(): void {
  const pkg = require('../package.json');
  console.log(chalk.cyan(`\naicli ${pkg.version}`));
  console.log(chalk.gray(`Node ${process.version}`));
  console.log(chalk.gray(`Platform ${process.platform}\n`));
}

/**
 * 处理交互模式
 */
async function handleInteractiveMode(options: CLIOptions): Promise<void> {
  if (!EnhancedCLIInterface) {
    const module = await import('./ui/enhanced-cli-interface');
    EnhancedCLIInterface = module.EnhancedCLIInterface;
  }

  // 从环境变量获取API密钥
  const apiKey = options.apiKey || 
                 process.env.DEEPSEEK_API_KEY || 
                 process.env.OPENAI_API_KEY || 
                 process.env.CLAUDE_API_KEY || 
                 '';

  const provider = options.provider || 'deepseek';

  const cliOptions = {
    provider: provider as any,
    apiKey,
    model: options.model,
    verbose: options.verbose,
    enableStreaming: true,
    maxFiles: 20,
    maxFileSize: 50 * 1024 * 1024,
  };

  const cli = new EnhancedCLIInterface(cliOptions);
  await cli.start();
}

/**
 * 处理打印模式（非交互）
 */
async function handlePrintMode(options: CLIOptions): Promise<void> {
  if (!PrintModeHandler) {
    const module = await import('./sdk/print-mode');
    PrintModeHandler = module.PrintModeHandler;
  }

  // 读取标准输入（如果有）
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

  const query = options.query || stdinContent || '';
  if (!query) {
    console.error(chalk.red('❌ 错误: 未提供查询内容'));
    console.error(chalk.gray('提示: aicli "你的问题" 或 echo "问题" | aicli -p'));
    process.exit(1);
  }

  const apiKey = options.apiKey || 
                 process.env.DEEPSEEK_API_KEY || 
                 process.env.OPENAI_API_KEY || 
                 process.env.CLAUDE_API_KEY || 
                 '';

  const provider = options.provider || 'deepseek';

  const handler = new PrintModeHandler({
    provider,
    apiKey,
    model: options.model,
    outputFormat: options.outputFormat || 'text',
    verbose: options.verbose,
  });

  await handler.handleQuery(query, stdinContent);
}

/**
 * 处理继续对话模式
 */
async function handleContinueMode(options: CLIOptions): Promise<void> {
  if (!PrintModeHandler) {
    const module = await import('./sdk/print-mode');
    PrintModeHandler = module.PrintModeHandler;
  }

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

  const query = options.query || stdinContent || '';
  if (!query) {
    console.error(chalk.red('❌ 错误: 继续会话需要提供查询内容'));
    process.exit(1);
  }

  const apiKey = options.apiKey || 
                 process.env.DEEPSEEK_API_KEY || 
                 process.env.OPENAI_API_KEY || 
                 process.env.CLAUDE_API_KEY || 
                 '';

  const provider = options.provider || 'deepseek';

  const handler = new PrintModeHandler({
    provider,
    apiKey,
    model: options.model,
    outputFormat: options.outputFormat || 'text',
    verbose: options.verbose,
  });

  await handler.continueLastSession(query, stdinContent);
}

/**
 * 处理恢复会话模式
 */
async function handleResumeMode(options: CLIOptions): Promise<void> {
  if (!options.sessionId) {
    console.error(chalk.red('❌ 错误: 恢复会话需要提供会话ID'));
    console.error(chalk.gray('提示: aicli -r <session-id> "你的问题"'));
    process.exit(1);
  }

  if (!PrintModeHandler) {
    const module = await import('./sdk/print-mode');
    PrintModeHandler = module.PrintModeHandler;
  }

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

  const query = options.query || stdinContent || '';
  if (!query) {
    console.error(chalk.red('❌ 错误: 恢复会话需要提供查询内容'));
    process.exit(1);
  }

  const apiKey = options.apiKey || 
                 process.env.DEEPSEEK_API_KEY || 
                 process.env.OPENAI_API_KEY || 
                 process.env.CLAUDE_API_KEY || 
                 '';

  const provider = options.provider || 'deepseek';

  const handler = new PrintModeHandler({
    provider,
    apiKey,
    model: options.model,
    outputFormat: options.outputFormat || 'text',
    verbose: options.verbose,
  });

  await handler.resumeSession(options.sessionId, query, stdinContent);
}

/**
 * 处理更新命令
 */
async function handleUpdateCommand(): Promise<void> {
  if (!UpdateManager) {
    const module = await import('./core/update-manager');
    UpdateManager = module.UpdateManager;
  }

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
    console.error(chalk.red(`❌ 更新失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

/**
 * 处理MCP命令
 */
async function handleMCPCommand(options: CLIOptions): Promise<void> {
  if (!MCPManager) {
    const module = await import('./core/mcp-manager');
    MCPManager = module.MCPManager;
  }

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
          process.exit(1);
        }
        await mcpManager.testServer(options.mcpServer);
        break;
      case 'remove':
        if (!options.mcpServer) {
          console.error(chalk.red('❌ 错误: 删除服务器需要指定服务器名称'));
          process.exit(1);
        }
        mcpManager.removeServer(options.mcpServer);
        break;
      default:
        console.error(chalk.red(`❌ 未知的MCP操作: ${action}`));
        console.log(chalk.gray('可用操作: list, start, stop, status, test, remove'));
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`❌ MCP命令执行失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

/**
 * 处理会话列表显示
 */
async function handleSessionsCommand(): Promise<void> {
  if (!SessionManagerV3) {
    const module = await import('./core/session-manager-v3');
    SessionManagerV3 = module.SessionManagerV3;
  }

  try {
    const sessionManager = new SessionManagerV3();
    const sessions = await sessionManager.getAllSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('📝 暂无会话历史'));
      return;
    }

    console.log(chalk.cyan(`\n📝 会话历史 (${sessions.length}个)\n`));

    const sortedSessions = sessions.sort((a: any, b: any) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    sortedSessions.slice(0, 10).forEach((session: any, index: number) => {
      const shortId = session.id.substring(0, 8);
      const modelInfo = `${session.provider}/${session.model}`;
      const updatedTime = new Date(session.updatedAt).toLocaleString();

      console.log(`${chalk.cyan((index + 1) + '.')} ${chalk.white(session.title)}`);
      console.log(`   ${chalk.gray(`ID: ${shortId}  模型: ${modelInfo}  更新: ${updatedTime}`)}\n`);
    });

    if (sessions.length > 10) {
      console.log(chalk.gray(`   ...以及 ${sessions.length - 10} 个更早的会话\n`));
    }

    console.log(chalk.gray('💡 使用 aicli -c 继续最近对话，或 aicli -r <ID> 恢复特定会话\n'));
  } catch (error) {
    console.error(chalk.red(`❌ 显示会话列表失败: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // 处理系统命令
    if (options.systemCommand) {
      switch (options.systemCommand) {
        case 'help':
          showHelp();
          return;
        case 'version':
          showVersion();
          return;
        case 'update':
          await handleUpdateCommand();
          return;
        case 'mcp':
          await handleMCPCommand(options);
          return;
        case 'sessions':
          await handleSessionsCommand();
          return;
      }
    }

    // 处理不同模式
    switch (options.mode) {
      case 'interactive':
        await handleInteractiveMode(options);
        break;
      case 'print':
        await handlePrintMode(options);
        break;
      case 'continue':
        await handleContinueMode(options);
        break;
      case 'resume':
        await handleResumeMode(options);
        break;
    }

    // 输出启动性能（仅在verbose模式）
    if (options.verbose) {
      const endTime = performance.now();
      console.error(chalk.gray(`\n[启动耗时: ${(endTime - startTime).toFixed(0)}ms]`));
    }

  } catch (error) {
    console.error(chalk.red(`❌ 错误: ${error instanceof Error ? error.message : '未知错误'}`));
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ 未捕获的异常: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`❌ 未处理的Promise拒绝: ${reason}`));
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 再见！'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 再见！'));
  process.exit(0);
});

// 启动应用
main();

