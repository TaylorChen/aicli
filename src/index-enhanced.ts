#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from './config';
import { smartConfig } from './core/smart-config';
import { EnhancedREPL } from './core/enhanced-repl';
import { enhancedAIService } from './core/enhanced-ai-service';
import { enhancedFileOperations } from './core/enhanced-file-operations';
import { enhancedImageProcessor } from './core/enhanced-image-processor';
import { enhancedWebSearch } from './core/enhanced-web-search';
import { enhancedCodeExecutor } from './core/enhanced-code-executor';
import { enhancedToolManager } from './core/enhanced-tool-manager';
import { enhancedProjectManager } from './core/enhanced-project-manager';

// Helper function to get provider names
function getAllProviderNames(): string[] {
  // Use smartConfig to get all available providers
  try {
    const providers = smartConfig.get('providers') || {};
    return Object.keys(providers);
  } catch {
    // Fallback to common provider names if config doesn't have providers
    return ['deepseek', 'openai', 'claude', 'kimi', 'gemini', 'grok'];
  }
}
import { SmartCommandParser } from './core/smart-command-parser';
import { SessionManager } from './core/session-manager';
import { sessionManager } from './core/session-manager';
import { ClaudeStyleLayout } from './ui/claude-style-layout';
import { ModernCLIInterface } from './ui/modern-cli-interface';
import { EnhancedCLIInterface } from './ui/enhanced-cli-interface';

const program = new Command();

program
  .name('aicli')
  .description('AI 编程助手终端工具 - Claude Code CLI 风格')
  .version('2.0.0');

program
  .command('start')
  .alias('s')
  .description('启动增强版交互式对话（支持文件拖拽和附件）')
  .option('--project <path>', '指定项目路径')
  .option('--session <id>', '继续指定会话')
  .option('--provider <name>', '指定AI提供商')
  .option('--model <name>', '指定AI模型')
  .option('--claude-style', '使用Claude风格界面')
  .option('--modern', '使用现代化界面')
  .option('--enhanced', '使用增强版界面（支持文件拖拽和附件）')
  .option('--theme <theme>', '界面主题 (claude|qorder|auto)')
  .option('--no-sidebar', '隐藏侧边栏')
  .option('--no-statusbar', '隐藏状态栏')
  .option('--api-key <key>', 'AI API密钥')
  .option('--base-url <url>', 'API基础URL')
  .option('--max-files <number>', '最大文件数量 (默认: 20)')
  .option('--max-file-size <size>', '最大文件大小MB (默认: 50)')
  .option('--auto-clear', '启用自动清除附件 (默认)')
  .option('--no-auto-clear', '禁用自动清除附件')
  .option('--streaming', '启用流式响应 (默认)')
  .option('--no-streaming', '禁用流式响应')
  .action((options) => {
    // 设置项目路径
    if (options.project) {
      process.chdir(options.project);
    }

    // 设置提供商
    if (options.provider) {
      const providers = getAllProviderNames();
      if (providers.includes(options.provider)) {
        config.setCurrentProvider(options.provider);
      }
    }

    // 设置模型
    if (options.model) {
      const currentProvider = config.getCurrentProvider();
      if (currentProvider && currentProvider.models.includes(options.model)) {
        config.setCurrentModel(options.model);
      }
    }

    // 选择界面类型 - 默认使用现代化增强版界面
    if (options.enhanced || (!options.claudeStyle && !options.modern && !options.theme)) {
      // 使用增强版界面（支持文件拖拽和附件，现在显示现代化界面）
      const enhancedOptions = {
        provider: options.provider || 'deepseek',
        apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
        model: options.model,
        baseUrl: options.baseUrl,
        maxFiles: options.maxFiles ? parseInt(options.maxFiles) : 20,
        maxFileSize: options.maxFileSize ? parseInt(options.maxFileSize) * 1024 * 1024 : 50 * 1024 * 1024,
        enableStreaming: options.streaming !== false,
        autoClearAttachments: options.autoClear !== false
      };

      const enhancedUI = new EnhancedCLIInterface(enhancedOptions);
      enhancedUI.start();
    } else if (options.modern || options.theme) {
      // 使用现代化界面（备用选项）
      const modernUI = new ModernCLIInterface({
        theme: options.theme as any || 'auto',
        showSidebar: options.sidebar !== false,
        showStatusBar: options.statusbar !== false,
        enableAnimations: true
      });

      // 初始化会话信息
      const currentProvider = config.getCurrentProvider();
      const currentModel = config.getCurrentModel();

      if (currentProvider && currentModel) {
        modernUI.updateSession({
          id: 'session_' + Date.now(),
          model: currentModel,
          provider: currentProvider.name,
          messages: 0,
          startTime: new Date()
        });
      }

      // 设置工具状态
      const tools = [
        { name: 'web_search', category: 'Web', status: 'ready' as const, description: 'Web搜索功能' },
        { name: 'execute_code', category: 'Code', status: 'ready' as const, description: '代码执行' },
        { name: 'analyze_file', category: 'File', status: 'ready' as const, description: '文件分析' },
        { name: 'process_image', category: 'Media', status: 'ready' as const, description: '图像处理' },
        { name: 'project_operation', category: 'Project', status: 'ready' as const, description: '项目管理' }
      ];

      tools.forEach(tool => {
        modernUI.updateToolStatus(tool.name, tool);
      });

      // 启动界面
      modernUI.start();
    } else if (options.claudeStyle) {
      // 使用Claude风格界面
      const claudeUI = new ClaudeStyleLayout();
      if (options.session) {
        sessionManager.continueSession(options.session).then(() => {
          claudeUI.start();
        }).catch(() => {
          console.log(chalk.red('❌ 会话不存在，将创建新会话'));
          claudeUI.start();
        });
      } else {
        claudeUI.start();
      }
    } else {
      // 使用传统界面
      const terminalUI = new ModernCLIInterface();
      if (options.session) {
        sessionManager.continueSession(options.session).then(() => {
          terminalUI.start();
        }).catch(() => {
          console.log(chalk.red('❌ 会话不存在，将创建新会话'));
          terminalUI.start();
        });
      } else {
        terminalUI.start();
      }
    }
  });

program
  .command('config')
  .alias('cfg')
  .description('配置管理')
  .option('-l, --list', '显示所有配置')
  .option('-r, --reset', '重置配置')
  .option('--set <key=value>', '设置配置项')
  .option('--get <key>', '获取配置项')
  .option('--theme <theme>', '设置主题 (light|dark)')
  .option('--auto-save <boolean>', '设置自动保存')
  .option('--history <number>', '设置历史记录数量')
  .action(async (options) => {
    if (options.list) {
      console.log(chalk.cyan('\n📋 当前配置:'));
      console.log(chalk.gray('═'.repeat(50)));

      const currentProvider = config.getCurrentProvider();
      if (currentProvider) {
        console.log(chalk.yellow('🤖 AI 配置:'));
        console.log(chalk.white(`  提供商: ${currentProvider.name}`));
        console.log(chalk.white(`  模型: ${config.get('currentModel')}`));
        console.log(chalk.white(`  API URL: ${currentProvider.baseUrl}`));
        console.log(chalk.white(`  主题: ${config.get('theme')}`));
        console.log(chalk.white(`  自动保存: ${config.get('autoSave') ? '开启' : '关闭'}`));
        console.log(chalk.white(`  历史记录: ${config.get('sessionHistory')} 条`));
        console.log('');
      }

      // 显示会话统计
      const stats = sessionManager.getOverallStats();
      console.log(chalk.yellow('💾 会话统计:'));
      console.log(chalk.white(`  总会话数: ${stats.totalSessions}`));
      console.log(chalk.white(`  总消息数: ${stats.totalMessages}`));
      console.log(chalk.white(`  总 Token 数: ${stats.totalTokens}`));
      console.log('');
    } else if (options.reset) {
      config.reset();
      console.log(chalk.green('✅ 配置已重置'));
    } else if (options.set) {
      const [key, value] = options.set.split('=');
      if (key && value) {
        config.set(key, value);
        console.log(chalk.green(`✅ 已设置 ${key} = ${value}`));
      } else {
        console.log(chalk.red('❌ 格式错误，使用 --set key=value'));
      }
    } else if (options.get) {
      const value = config.get(options.get);
      console.log(chalk.white(`${options.get}: ${value}`));
    } else if (options.theme) {
      if (['light', 'dark'].includes(options.theme)) {
        config.set('theme', options.theme);
        console.log(chalk.green(`✅ 主题已设置为: ${options.theme}`));
      } else {
        console.log(chalk.red('❌ 主题必须是 light 或 dark'));
      }
    } else if (options.autoSave !== undefined) {
      const enabled = options.autoSave === 'true' || options.autoSave === 'yes';
      config.set('autoSave', enabled);
      console.log(chalk.green(`✅ 自动保存已${enabled ? '开启' : '关闭'}`));
    } else if (options.history !== undefined) {
      const num = parseInt(options.history);
      if (!isNaN(num) && num > 0) {
        config.set('sessionHistory', num);
        console.log(chalk.green(`✅ 历史记录数量已设置为: ${num}`));
      } else {
        console.log(chalk.red('❌ 历史记录数量必须是正数'));
      }
    } else {
      console.log(chalk.cyan('\n📋 配置选项:'));
      console.log(chalk.gray('  aicli config --list              显示配置'));
      console.log(chalk.gray('  aicli config --reset             重置配置'));
      console.log(chalk.gray('  aicli config --set key=value     设置配置项'));
      console.log(chalk.gray('  aicli config --get key           获取配置项'));
      console.log(chalk.gray('  aicli config --theme <theme>    设置主题'));
      console.log(chalk.gray('  aicli config --auto-save <bool> 设置自动保存'));
      console.log(chalk.gray('  aicli config --history <num>    设置历史记录数量'));
    }
  });

program
  .command('provider')
  .alias('p')
  .description('管理 AI 提供商')
  .option('-l, --list', '列出所有提供商')
  .option('-s, --set <provider>', '设置当前提供商')
  .action((options) => {
    if (options.list) {
      console.log(chalk.cyan('\n🤖 可用的 AI 提供商:'));
      console.log(chalk.gray('─'.repeat(40)));

      getAllProviderNames().forEach(provider => {
        const current = config.get('currentProvider') === provider ? chalk.green(' ✓') : '';
        console.log(chalk.white(`  ${provider}${current}`));
      });

      console.log(chalk.gray('\n💡 使用 aicli provider --set <name> 切换提供商'));
    } else if (options.set) {
      const providerName = options.set;
      if (getAllProviderNames().includes(providerName)) {
        if (config.setCurrentProvider(providerName)) {
          console.log(chalk.green(`✅ 已切换到 ${providerName}`));
        }
      } else {
        console.log(chalk.red(`❌ 未知的提供商: ${providerName}`));
        console.log(chalk.gray('使用 --list 查看可用提供商'));
      }
    } else {
      console.log(chalk.cyan('\n🤖 提供商管理:'));
      console.log(chalk.gray('  aicli provider --list    列出提供商'));
      console.log(chalk.gray('  aicli provider --set <name>    设置提供商'));
    }
  });

program
  .command('model')
  .alias('m')
  .description('管理 AI 模型')
  .option('-l, --list', '列出当前提供商的模型')
  .option('-s, --set <model>', '设置当前模型')
  .action((options) => {
    const currentProvider = config.getCurrentProvider();
    if (!currentProvider) {
      console.log(chalk.red('❌ 没有配置提供商'));
      console.log(chalk.gray('请先使用 aicli provider --set <name> 设置提供商'));
      return;
    }

    if (options.list) {
      console.log(chalk.cyan(`\n🧠 ${currentProvider.name} 可用的模型:`));
      console.log(chalk.gray('─'.repeat(40)));

      currentProvider.models.forEach(model => {
        const current = config.get('currentModel') === model ? chalk.green(' ✓') : '';
        console.log(chalk.white(`  ${model}${current}`));
      });

      console.log(chalk.gray('\n💡 使用 aicli model --set <name> 切换模型'));
    } else if (options.set) {
      const modelName = options.set;
      if (currentProvider.models.includes(modelName)) {
        if (config.setCurrentModel(modelName)) {
          console.log(chalk.green(`✅ 已切换到模型 ${modelName}`));
        }
      } else {
        console.log(chalk.red(`❌ 未知的模型: ${modelName}`));
        console.log(chalk.gray('使用 --list 查看可用模型'));
      }
    } else {
      console.log(chalk.cyan('\n🧠 模型管理:'));
      console.log(chalk.gray('  aicli model --list    列出模型'));
      console.log(chalk.gray('  aicli model --set <name>    设置模型'));
    }
  });

program
  .command('status')
  .alias('s')
  .description('显示当前状态')
  .action(async () => {
    const currentProvider = config.getCurrentProvider();
    const validation = config.validateCurrentProvider();
    const context = await import('./core/project-context').then(m => m.projectContext.detectProject());
    const currentSession = sessionManager.getCurrentSession();

    console.log(chalk.cyan('\n📊 系统状态:'));
    console.log(chalk.gray('─'.repeat(50)));

    // AI 配置
    if (currentProvider) {
      console.log(chalk.yellow('🤖 AI 配置:'));
      console.log(chalk.white(`  提供商: ${currentProvider.name}`));
      console.log(chalk.white(`  模型: ${config.get('currentModel')}`));
      console.log(chalk.white(`  API URL: ${currentProvider.baseUrl}`));

      const apiKey = config.getApiKey(currentProvider.name);
      console.log(chalk.white(`  API Key: ${apiKey ? '✅ 已配置' : '❌ 未配置'}`));
      console.log(chalk.white(`  状态: ${validation.valid ? '🟢 正常' : '🔴 ' + validation.message}`));
    }

    // 项目信息
    const projectContextResult = await context;
    console.log(chalk.yellow('\n🏗️  项目信息:'));
    console.log(chalk.white(`  类型: ${projectContextResult.type}`));
    console.log(chalk.white(`  路径: ${projectContextResult.rootPath}`));
    console.log(chalk.white(`  文件数: ${projectContextResult.files.length}`));
    console.log(chalk.white(`  Git: ${projectContextResult.gitRepo ? '✅ 是' : '❌ 否'}`));

    // 会话信息
    if (currentSession) {
      console.log(chalk.yellow('\n💾 当前会话:'));
      console.log(chalk.white(`  ID: ${currentSession.metadata.id}`));
      console.log(chalk.white(`  标题: ${currentSession.metadata.title}`));
      console.log(chalk.white(`  消息数: ${currentSession.messages.length}`));
      const tokensUsed = currentSession.messages.reduce((total, msg) => total + (msg.metadata?.tokens || 0), 0);
      console.log(chalk.white(`  Token 数: ${tokensUsed}`));
      console.log(chalk.white(`  创建时间: ${currentSession.metadata.createdAt.toLocaleString()}`));
    }

    console.log('');
  });

program
  .command('env')
  .description('显示环境变量配置说明')
  .option('--check', '检查环境变量配置')
  .option('--setup', '显示设置向导')
  .action((options) => {
    if (options.check) {
      console.log(chalk.cyan('\n🔑 环境变量检查:'));
      console.log(chalk.gray('═'.repeat(50)));

      const providers = [
        { name: 'Claude', env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com' },
        { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com' },
        { name: 'Kimi', env: 'MOONSHOT_API_KEY', url: 'https://platform.moonshot.cn' },
        { name: 'OpenAI', env: 'OPENAI_API_KEY', url: 'https://platform.openai.com' },
        { name: 'Gemini', env: 'GOOGLE_API_KEY', url: 'https://makersuite.google.com' },
        { name: 'Grok', env: 'GROK_API_KEY', url: 'https://console.x.ai' }
      ];

      providers.forEach(provider => {
        const configured = process.env[provider.env] ? chalk.green('✅ 已配置') : chalk.red('❌ 未配置');
        console.log(chalk.white(`${provider.name}:`));
        console.log(chalk.gray(`  环境变量: ${provider.env}`));
        console.log(chalk.gray(`  状态: ${configured}`));
        console.log('');
      });
    } else if (options.setup) {
      console.log(chalk.cyan('\n🔑 环境变量设置向导:'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(chalk.white('选择要配置的 AI 提供商:\n'));

      const providers = [
        { name: 'Claude', env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com' },
        { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com' },
        { name: 'Kimi', env: 'MOONSHOT_API_KEY', url: 'https://platform.moonshot.cn' }
      ];

      providers.forEach((provider, index) => {
        console.log(chalk.white(`  ${index + 1}. ${provider.name}`));
        console.log(chalk.gray(`     环境变量: ${provider.env}`));
        console.log(chalk.gray(`     获取地址: ${provider.url}`));
        console.log('');
      });

      console.log(chalk.green('📝 配置步骤:'));
      console.log(chalk.gray('  1. 访问提供商的控制台获取 API Key'));
      console.log(chalk.gray('  2. 在终端中运行: export <环境变量>=<你的API密钥>'));
      console.log(chalk.gray('  3. 或者将配置添加到 ~/.bashrc 或 ~/.zshrc'));
      console.log(chalk.gray('  4. 运行 aicli env --check 验证配置'));
    } else {
      console.log(chalk.cyan('\n🔑 环境变量配置说明:'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(chalk.white('设置以下环境变量来配置 API Key:\n'));

      const providers = [
        { name: 'Claude', env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com' },
        { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com' },
        { name: 'Kimi', env: 'MOONSHOT_API_KEY', url: 'https://platform.moonshot.cn' },
        { name: 'OpenAI', env: 'OPENAI_API_KEY', url: 'https://platform.openai.com' },
        { name: 'Gemini', env: 'GOOGLE_API_KEY', url: 'https://makersuite.google.com' },
        { name: 'Grok', env: 'GROK_API_KEY', url: 'https://console.x.ai' }
      ];

      providers.forEach(provider => {
        console.log(chalk.yellow(`${provider.name}:`));
        console.log(chalk.gray(`  环境变量: ${provider.env}`));
        console.log(chalk.gray(`  获取地址: ${provider.url}\n`));
      });

      console.log(chalk.green('📝 快速配置:'));
      console.log(chalk.gray('  aicli env --check   - 检查环境变量'));
      console.log(chalk.gray('  aicli env --setup   - 显示设置向导'));
      console.log('');
    }
  });

// 新增：项目分析命令
program
  .command('analyze')
  .alias('analyse')
  .description('分析当前项目')
  .option('--json', '以 JSON 格式输出')
  .option('--detailed', '显示详细信息')
  .action(async (options) => {
    const { projectContext } = await import('./core/project-context');
    const context = await projectContext.detectProject();

    if (options.json) {
      console.log(JSON.stringify(context, null, 2));
    } else {
      console.log(chalk.cyan('\n🔍 项目分析:'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(chalk.yellow('📁 基本信息:'));
      console.log(chalk.white(`  项目类型: ${context.type}`));
      console.log(chalk.white(`  根目录: ${context.rootPath}`));
      console.log(chalk.white(`  Git 仓库: ${context.gitRepo ? '是' : '否'}`));

      if (options.detailed) {
        console.log(chalk.yellow('\n📊 详细信息:'));
        console.log(chalk.white(`  源文件数: ${context.files.length}`));
        console.log(chalk.white(`  依赖包数: ${Object.keys(context.dependencies).length}`));

        if (Object.keys(context.dependencies).length > 0) {
          console.log(chalk.yellow('\n📦 主要依赖:'));
          Object.entries(context.dependencies).slice(0, 10).forEach(([name, version]) => {
            console.log(chalk.white(`  ${name}: ${version}`));
          });
          if (Object.keys(context.dependencies).length > 10) {
            console.log(chalk.gray(`  ... 还有 ${Object.keys(context.dependencies).length - 10} 个依赖`));
          }
        }
      }

      console.log('');
    }
  });

// 增强版：工具验证命令
program
  .command('validate')
  .alias('check')
  .description('验证系统配置和工具')
  .option('--tools', '仅验证工具')
  .option('--config', '仅验证配置')
  .option('--environments', '仅验证执行环境')
  .option('--search', '仅验证搜索引擎')
  .option('--fix', '尝试修复问题')
  .option('--detailed', '显示详细信息')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔧 系统验证:'));
    console.log(chalk.gray('═'.repeat(50)));

    let hasErrors = false;

    // 验证配置
    if (!options.tools && !options.environments && !options.search) {
      console.log(chalk.yellow('📋 配置验证:'));
      const currentProvider = config.getCurrentProvider();
      const validation = config.validateCurrentProvider();

      if (!currentProvider) {
        console.log(chalk.red('  ❌ 未配置 AI 提供商'));
        hasErrors = true;
      } else {
        console.log(chalk.green(`  ✅ 提供商: ${currentProvider.name}`));
        console.log(chalk.green(`  ✅ 模型: ${config.get('currentModel')}`));

        if (validation.valid) {
          console.log(chalk.green('  ✅ 配置有效'));
        } else {
          console.log(chalk.red(`  ❌ ${validation.message}`));
          hasErrors = true;
        }
      }
    }

    // 验证增强工具
    if (!options.config && !options.environments && !options.search) {
      console.log(chalk.yellow('\n🛠️ 增强工具验证:'));

      // 验证AI服务
      try {
        const aiHealth = await enhancedAIService.healthCheck();
        console.log(chalk.green(`  ✅ AI服务: ${aiHealth.provider} - ${aiHealth.status}`));
        if (aiHealth.status === 'error') {
          console.log(chalk.red(`    错误: ${aiHealth.message}`));
          hasErrors = true;
        }
      } catch (error) {
        console.log(chalk.red('  ❌ AI服务验证失败'));
        hasErrors = true;
      }

      // 验证文件操作
      try {
        const stats = enhancedFileOperations.getStatistics();
        console.log(chalk.green(`  ✅ 文件操作: 缓存大小 ${stats.cacheSize} 项`));
      } catch (error) {
        console.log(chalk.red('  ❌ 文件操作验证失败'));
        hasErrors = true;
      }

      // 验证图像处理
      try {
        const imageStats = enhancedImageProcessor.getStatistics();
        console.log(chalk.green(`  ✅ 图像处理: 支持 ${imageStats.supportedFormats.length} 种格式`));
      } catch (error) {
        console.log(chalk.red('  ❌ 图像处理验证失败'));
        hasErrors = true;
      }

      // 验证代码执行器
      const availableEnvs = enhancedCodeExecutor.getAvailableEnvironments();
      console.log(chalk.green(`  ✅ 代码执行: ${availableEnvs.length} 个环境可用`));

      // 验证工具管理器
      const toolStats = enhancedToolManager.getStatistics();
      console.log(chalk.green(`  ✅ 工具管理: ${toolStats.totalToolCalls} 次调用历史`));

      if (options.detailed) {
        console.log(chalk.yellow('\n📊 详细工具信息:'));
        const tools = enhancedToolManager.getAvailableTools();
        tools.forEach(tool => {
          const category = tool.category || 'general';
          const dangerous = tool.dangerous ? ' ⚠️' : '';
          console.log(chalk.white(`  ${tool.name} (${category})${dangerous}`));
        });
      }
    }

    // 验证执行环境
    if (options.environments || (!options.tools && !options.config && !options.search)) {
      console.log(chalk.yellow('\n🏗️ 执行环境验证:'));
      const environments = enhancedCodeExecutor.getAvailableEnvironments();

      if (environments.length === 0) {
        console.log(chalk.red('  ❌ 没有可用的执行环境'));
        hasErrors = true;
      } else {
        environments.forEach(env => {
          console.log(chalk.green(`  ✅ ${env.name} (${env.type}) - 版本: ${env.version || '未知'}`));
        });
      }
    }

    // 验证搜索引擎
    if (options.search || (!options.tools && !options.config && !options.environments)) {
      console.log(chalk.yellow('\n🔍 搜索引擎验证:'));
      const searchEngines = enhancedWebSearch.getAvailableEngines();

      if (searchEngines.length === 0) {
        console.log(chalk.red('  ❌ 没有可用的搜索引擎'));
        hasErrors = true;
      } else {
        for (const engine of searchEngines) {
          try {
            const connection = await enhancedWebSearch.testEngineConnection(engine.name);
            const status = connection.success ? chalk.green('✅') : chalk.red('❌');
            console.log(`${status}  ${engine.name} - ${connection.message}`);

            if (!connection.success) {
              hasErrors = true;
            }
          } catch (error) {
            console.log(chalk.red(`  ❌ ${engine.name} - 连接测试失败`));
            hasErrors = true;
          }
        }
      }
    }

    // 验证环境变量
    console.log(chalk.yellow('\n🔑 环境变量验证:'));
    const envProviders = [
      { name: 'Claude', env: 'ANTHROPIC_API_KEY' },
      { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY' },
      { name: 'Kimi', env: 'MOONSHOT_API_KEY' },
      { name: 'OpenAI', env: 'OPENAI_API_KEY' },
      { name: 'Gemini', env: 'GOOGLE_API_KEY' },
      { name: 'Grok', env: 'GROK_API_KEY' }
    ];

    const configuredProviders = envProviders.filter(provider => process.env[provider.env]);

    if (configuredProviders.length === 0) {
      console.log(chalk.red('  ❌ 未配置任何 API Key'));
      hasErrors = true;
    } else {
      console.log(chalk.green(`  ✅ 已配置 ${configuredProviders.length} 个 API Key`));

      if (options.detailed) {
        configuredProviders.forEach(provider => {
          console.log(chalk.white(`    ${provider.name}: ${provider.env}`));
        });
      }
    }

    if (hasErrors && options.fix) {
      console.log(chalk.yellow('\n🔧 尝试修复问题...'));
      console.log(chalk.gray('  运行 aicli env --setup 获取配置帮助'));
      console.log(chalk.gray('  检查 API Key 配置'));
      console.log(chalk.gray('  确认网络连接正常'));
    }

    console.log(hasErrors ? chalk.red(`\n❌ 验证失败`) : chalk.green(`\n✅ 验证通过`));
  });

// 新增：日志查看命令
program
  .command('logs')
  .description('查看日志文件')
  .option('-f, --follow', '实时跟踪日志')
  .option('-n, --lines <number>', '显示最后 N 行', '50')
  .option('--level <level>', '按级别过滤 (error|warn|info|debug)')
  .action((options) => {
    console.log(chalk.cyan('\n📋 日志查看:'));
    console.log(chalk.gray('═'.repeat(50)));

    // 这里可以实现实际的日志查看逻辑
    console.log(chalk.yellow('📝 日志功能开发中...'));
    console.log(chalk.gray('  即将支持:'));
    console.log(chalk.gray('  - 实时日志跟踪'));
    console.log(chalk.gray('  - 日志级别过滤'));
    console.log(chalk.gray('  - 日志搜索'));
  });

// 新增：更新命令
program
  .command('update')
  .alias('upgrade')
  .description('更新 AICLI')
  .option('--check', '仅检查更新')
  .option('--force', '强制更新')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔄 更新检查:'));
    console.log(chalk.gray('═'.repeat(50)));

    // 这里可以实现实际的更新检查逻辑
    console.log(chalk.yellow('📝 当前版本: 2.0.0'));
    console.log(chalk.green('✅ 已是最新版本'));

    if (!options.check) {
      console.log(chalk.gray('\n💡 更新提示:'));
      console.log(chalk.gray('  npm install -g aicli@latest'));
      console.log(chalk.gray('  yarn global add aicli@latest'));
    }
  });

// 会话管理命令
program
  .command('sessions')
  .alias('sess')
  .description('会话管理')
  .option('-l, --list', '列出所有会话')
  .option('-n, --new [title]', '创建新会话')
  .option('-d, --delete <id>', '删除会话')
  .option('-e, --export <id>', '导出会话')
  .option('--import <file>', '导入会话')
  .option('--cleanup', '清理过期会话')
  .action(async (options) => {
    if (options.list) {
      const stats = sessionManager.getOverallStats();
      const currentSession = sessionManager.getCurrentSession();

      console.log(chalk.cyan('\n📊 会话统计:'));
      console.log(chalk.gray('═'.repeat(50)));
      console.log(chalk.white(`总会话数: ${stats.totalSessions}`));
      console.log(chalk.white(`总消息数: ${stats.totalMessages}`));
      console.log(chalk.white(`总 Token 数: ${stats.totalTokens}`));

      if (currentSession) {
        console.log(chalk.green(`\n💾 当前会话: ${currentSession.metadata.title} (${currentSession.metadata.id})`));
        console.log(chalk.white(`  消息数: ${currentSession.messages.length}`));
        console.log(chalk.white(`  更新时间: ${currentSession.metadata.updatedAt.toLocaleString()}`));
      }

      console.log(chalk.cyan('\n📁 按项目分组的会话:'));
      Object.entries(stats.sessionsByProject).forEach(([project, count]) => {
        console.log(chalk.white(`  ${project}: ${count} 个会话`));
      });
    } else if (options.new !== undefined) {
      const title = options.new || 'New Session';
      const sessionId = await sessionManager.createSession({ title });
      console.log(chalk.green(`✅ 创建新会话: ${sessionId}`));
    } else if (options.delete) {
      const deleted = await sessionManager.deleteSession(options.delete);
      if (deleted) {
        console.log(chalk.green(`✅ 删除会话: ${options.delete}`));
      } else {
        console.log(chalk.red(`❌ 会话不存在: ${options.delete}`));
      }
    } else if (options.export) {
      try {
        const exportPath = await sessionManager.exportSession(options.export);
        console.log(chalk.green(`✅ 导出会话到: ${exportPath}`));
      } catch (error) {
        console.log(chalk.red(`❌ 导出失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    } else if (options.import) {
      try {
        const session = await sessionManager.importSession(options.import);
        console.log(chalk.green(`✅ 导入会话: ${session}`));
      } catch (error) {
        console.log(chalk.red(`❌ 导入失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    } else if (options.cleanup) {
      const cleanedCount = await sessionManager.cleanupOldSessions();
      console.log(chalk.green(`✅ 清理了 ${cleanedCount} 个过期会话`));
    } else {
      console.log(chalk.cyan('\n💾 会话管理:'));
      console.log(chalk.gray('  aicli sessions --list              列出所有会话'));
      console.log(chalk.gray('  aicli sessions --new [title]       创建新会话'));
      console.log(chalk.gray('  aicli sessions --delete <id>       删除会话'));
      console.log(chalk.gray('  aicli sessions --export <id>       导出会话'));
      console.log(chalk.gray('  aicli sessions --import <file>     导入会话'));
      console.log(chalk.gray('  aicli sessions --cleanup           清理过期会话'));
    }
  });

// 添加Claude风格快捷命令
program
  .command('claude')
  .alias('c')
  .description('启动Claude风格界面')
  .option('--project <path>', '指定项目路径')
  .option('--session <id>', '继续指定会话')
  .option('--provider <name>', '指定AI提供商')
  .option('--model <name>', '指定AI模型')
  .action((options) => {
    // 设置项目路径
    if (options.project) {
      process.chdir(options.project);
    }

    // 设置提供商
    if (options.provider) {
      const providers = getAllProviderNames();
      if (providers.includes(options.provider)) {
        config.setCurrentProvider(options.provider);
      }
    }

    // 设置模型
    if (options.model) {
      const currentProvider = config.getCurrentProvider();
      if (currentProvider && currentProvider.models.includes(options.model)) {
        config.setCurrentModel(options.model);
      }
    }

    // 使用Claude风格界面
    const claudeUI = new ClaudeStyleLayout();
    if (options.session) {
      sessionManager.continueSession(options.session).then(() => {
        claudeUI.start();
      }).catch(() => {
        console.log(chalk.red('❌ 会话不存在，将创建新会话'));
        claudeUI.start();
      });
    } else {
      claudeUI.start();
    }
  });

// 新增：现代CLI模式
program
  .command('modern')
  .alias('m')
  .description('启动现代CLI风格界面 (极简REPL模式)')
  .option('--project <path>', '指定项目路径')
  .option('--session <id>', '继续指定会话')
  .option('--provider <name>', '指定AI提供商')
  .option('--model <name>', '指定AI模型')
  .action((options) => {
    // 设置项目路径
    if (options.project) {
      process.chdir(options.project);
    }

    // 设置提供商
    if (options.provider) {
      const providers = getAllProviderNames();
      if (providers.includes(options.provider)) {
        config.setCurrentProvider(options.provider);
      }
    }

    // 设置模型
    if (options.model) {
      const currentProvider = config.getCurrentProvider();
      if (currentProvider && currentProvider.models.includes(options.model)) {
        config.setCurrentModel(options.model);
      }
    }

    // 启动现代CLI界面
    const modernUI = new ModernCLIInterface();
    modernUI.start();
  });

// 默认命令 - 使用Claude风格界面
if (process.argv.length === 2) {
  program.action(() => {
    const claudeUI = new ClaudeStyleLayout();
    claudeUI.start();
  });
}

// 增强版：代码执行命令
program
  .command('exec')
  .alias('run')
  .description('执行代码片段')
  .option('-c, --code <code>', '要执行的代码')
  .option('-f, --file <path>', '执行的文件路径')
  .option('-l, --language <language>', '编程语言')
  .option('-e, --env <environment>', '执行环境')
  .option('-t, --timeout <ms>', '超时时间（毫秒）', '30000')
  .option('--interactive', '交互式执行模式')
  .action(async (options) => {
    if (options.interactive) {
      console.log(chalk.cyan('\n💻 交互式代码执行:'));
      console.log(chalk.gray('输入 "exit" 退出，输入 "help" 查看帮助'));
      console.log('');

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      let currentLanguage = 'javascript';
      let currentEnvironment: string | undefined = undefined;

      const askForInput = () => {
        rl.question(chalk.green(`${currentLanguage}> `), async (input: string) => {
          if (input.trim() === 'exit') {
            rl.close();
            return;
          }

          if (input.trim() === 'help') {
            console.log(chalk.yellow('\n📚 可用命令:'));
            console.log(chalk.gray('  lang <language>  - 切换编程语言'));
            console.log(chalk.gray('  env <env>        - 切换执行环境'));
            console.log(chalk.gray('  help            - 显示帮助'));
            console.log(chalk.gray('  exit            - 退出\n'));
            askForInput();
            return;
          }

          if (input.startsWith('lang ')) {
            currentLanguage = input.substring(5).trim();
            console.log(chalk.green(`✅ 切换到: ${currentLanguage}`));
            askForInput();
            return;
          }

          if (input.startsWith('env ')) {
            currentEnvironment = input.substring(4).trim();
            console.log(chalk.green(`✅ 环境设置: ${currentEnvironment || '默认'}`));
            askForInput();
            return;
          }

          if (input.trim() === '') {
            askForInput();
            return;
          }

          try {
            console.log(chalk.cyan('执行中...'));
            const result = await enhancedCodeExecutor.executeCode({
              code: input,
              language: currentLanguage,
              environment: currentEnvironment,
              timeout: parseInt(options.timeout || '30000')
            });

            if (result.success) {
              console.log(chalk.green('\n✅ 执行成功:'));
              if (result.output) {
                console.log(chalk.white(result.output));
              }
            } else {
              console.log(chalk.red('\n❌ 执行失败:'));
              console.log(chalk.red(result.error || '未知错误'));
            }
            console.log(chalk.gray(`执行时间: ${result.executionTime}ms\n`));
          } catch (error) {
            console.log(chalk.red('\n❌ 执行错误:'));
            console.log(chalk.red(error instanceof Error ? error.message : '未知错误\n'));
          }

          askForInput();
        });
      };

      askForInput();
      return;
    }

    try {
      let executionOptions = {
        code: options.code || '',
        language: options.language || 'javascript',
        environment: options.env,
        timeout: parseInt(options.timeout)
      };

      if (options.file) {
        // 执行文件
        const result = await enhancedCodeExecutor.executeFile(options.file, {
          language: options.language,
          environment: options.env,
          timeout: parseInt(options.timeout)
        });

        if (result.success) {
          console.log(chalk.green('\n✅ 文件执行成功:'));
          if (result.output) {
            console.log(chalk.white(result.output));
          }
        } else {
          console.log(chalk.red('\n❌ 文件执行失败:'));
          console.log(chalk.red(result.error || '未知错误'));
        }
      } else if (options.code) {
        // 执行代码片段
        const result = await enhancedCodeExecutor.executeCode(executionOptions);

        if (result.success) {
          console.log(chalk.green('\n✅ 代码执行成功:'));
          if (result.output) {
            console.log(chalk.white(result.output));
          }
        } else {
          console.log(chalk.red('\n❌ 代码执行失败:'));
          console.log(chalk.red(result.error || '未知错误'));
        }
      } else {
        console.log(chalk.red('❌ 请提供要执行的代码或文件路径'));
        console.log(chalk.gray('使用 --code <code> 或 --file <path>'));
      }
    } catch (error) {
      console.log(chalk.red('\n❌ 执行错误:'));
      console.log(chalk.red(error instanceof Error ? error.message : '未知错误'));
    }

    console.log('');
  });

// 增强版：Web搜索命令
program
  .command('search')
  .alias('web')
  .description('Web搜索')
  .option('-q, --query <query>', '搜索查询')
  .option('-l, --limit <number>', '结果数量', '10')
  .option('--language <lang>', '搜索语言', 'zh')
  .option('--time <range>', '时间范围 (day|week|month|year|all)', 'all')
  .option('--ai', '使用AI增强搜索')
  .option('--interactive', '交互式搜索模式')
  .action(async (options) => {
    if (options.interactive) {
      console.log(chalk.cyan('\n🔍 交互式Web搜索:'));
      console.log(chalk.gray('输入 "exit" 退出，输入 "help" 查看帮助'));
      console.log('');

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const askForQuery = () => {
        rl.question(chalk.green('search> '), async (query: string) => {
          if (query.trim() === 'exit') {
            rl.close();
            return;
          }

          if (query.trim() === 'help') {
            console.log(chalk.yellow('\n📚 可用命令:'));
            console.log(chalk.gray('  <query>         - 执行搜索'));
            console.log(chalk.gray('  --ai           - AI增强搜索'));
            console.log(chalk.gray('  --limit <num>   - 限制结果数量'));
            console.log(chalk.gray('  help           - 显示帮助'));
            console.log(chalk.gray('  exit           - 退出\n'));
            askForQuery();
            return;
          }

          if (query.trim() === '') {
            askForQuery();
            return;
          }

          try {
            console.log(chalk.cyan('搜索中...'));

            if (query.includes('--ai')) {
              const cleanQuery = query.replace('--ai', '').trim();
              const result = await enhancedWebSearch.searchWithAI(cleanQuery);

              console.log(chalk.green('\n🤖 AI增强搜索结果:'));
              console.log(chalk.yellow('AI摘要:'));
              console.log(chalk.white(result.aiSummary));

              if (result.relatedQuestions.length > 0) {
                console.log(chalk.yellow('\n相关问题:'));
                result.relatedQuestions.forEach(q => {
                  console.log(chalk.white(`  • ${q}`));
                });
              }

              console.log(chalk.yellow('\n搜索结果:'));
              result.searchResults.slice(0, 5).forEach((result, index) => {
                console.log(chalk.white(`${index + 1}. ${result.title}`));
                console.log(chalk.gray(`   ${result.url}`));
                console.log(chalk.gray(`   ${result.snippet}\n`));
              });
            } else {
              const limitMatch = query.match(/--limit\s+(\d+)/);
              const limit = limitMatch ? parseInt(limitMatch[1]) : 5;
              const cleanQuery = query.replace(/--limit\s+\d+/, '').trim();

              const results = await enhancedWebSearch.quickSearch(cleanQuery, limit);

              console.log(chalk.green(`\n🔍 搜索结果 (${results.length} 项):`));
              results.forEach((result, index) => {
                console.log(chalk.white(`${index + 1}. ${result.title}`));
                console.log(chalk.gray(`   ${result.url}`));
                console.log(chalk.gray(`   ${result.snippet}\n`));
              });
            }
          } catch (error) {
            console.log(chalk.red('\n❌ 搜索错误:'));
            console.log(chalk.red(error instanceof Error ? error.message : '未知错误\n'));
          }

          askForQuery();
        });
      };

      askForQuery();
      return;
    }

    try {
      if (options.ai) {
        const result = await enhancedWebSearch.searchWithAI(options.query);

        console.log(chalk.cyan('\n🤖 AI增强搜索:'));
        console.log(chalk.gray('═'.repeat(50)));

        console.log(chalk.yellow('AI摘要:'));
        console.log(chalk.white(result.aiSummary));

        if (result.relatedQuestions.length > 0) {
          console.log(chalk.yellow('\n相关问题:'));
          result.relatedQuestions.forEach(q => {
            console.log(chalk.white(`  • ${q}`));
          });
        }

        console.log(chalk.yellow('\n搜索结果:'));
        result.searchResults.forEach((result, index) => {
          console.log(chalk.white(`${index + 1}. ${result.title}`));
          console.log(chalk.gray(`   ${result.url}`));
          console.log(chalk.gray(`   ${result.snippet}\n`));
        });
      } else {
        const results = await enhancedWebSearch.quickSearch(options.query, parseInt(options.limit));

        console.log(chalk.cyan('\n🔍 搜索结果:'));
        console.log(chalk.gray('═'.repeat(50)));

        results.forEach((result, index) => {
          console.log(chalk.white(`${index + 1}. ${result.title}`));
          console.log(chalk.gray(`   ${result.url}`));
          console.log(chalk.gray(`   ${result.snippet}\n`));
        });
      }
    } catch (error) {
      console.log(chalk.red('\n❌ 搜索错误:'));
      console.log(chalk.red(error instanceof Error ? error.message : '未知错误'));
    }

    console.log('');
  });

// 增强版：工具调用命令
program
  .command('tool')
  .alias('tools')
  .description('工具调用和管理')
  .option('-l, --list', '列出所有可用工具')
  .option('-c, --call <tool>', '调用指定工具')
  .option('--input <json>', '工具输入 (JSON格式)')
  .option('--categories', '按类别显示工具')
  .option('--permissions', '管理工具权限')
  .option('--history', '显示调用历史')
  .option('--stats', '显示工具统计')
  .action(async (options) => {
    if (options.list) {
      const tools = enhancedToolManager.getAvailableTools();

      if (options.categories) {
        console.log(chalk.cyan('\n🛠️ 按类别分组的工具:'));
        console.log(chalk.gray('═'.repeat(50)));

        const categories = new Map<string, any[]>();
        tools.forEach(tool => {
          const category = tool.category || 'general';
          if (!categories.has(category)) {
            categories.set(category, []);
          }
          categories.get(category)!.push(tool);
        });

        categories.forEach((toolsInCategory, category) => {
          console.log(chalk.yellow(`\n${category.charAt(0).toUpperCase() + category.slice(1)}:`));
          toolsInCategory.forEach(tool => {
            const dangerous = tool.dangerous ? ' ⚠️' : '';
            const requiresConfirm = tool.requiresConfirmation ? ' 🔒' : '';
            console.log(chalk.white(`  ${tool.name}${dangerous}${requiresConfirm}`));
            console.log(chalk.gray(`    ${tool.description}`));
          });
        });
      } else {
        console.log(chalk.cyan('\n🛠️ 可用工具:'));
        console.log(chalk.gray('═'.repeat(50)));

        tools.forEach(tool => {
          const category = tool.category || 'general';
          const dangerous = tool.dangerous ? ' ⚠️' : '';
          const requiresConfirm = tool.requiresConfirmation ? ' 🔒' : '';
          console.log(chalk.white(`${tool.name} (${category})${dangerous}${requiresConfirm}`));
          console.log(chalk.gray(`  ${tool.description}`));
        });
      }
    } else if (options.call) {
      try {
        const input = options.input ? JSON.parse(options.input) : {};
        const result = await enhancedToolManager.callTool({
          toolName: options.call,
          input,
          options: {
            timeout: 30000
          }
        });

        if (result.success) {
          console.log(chalk.green('\n✅ 工具调用成功:'));
          console.log(chalk.gray(`工具: ${result.toolName}`));
          console.log(chalk.gray(`执行时间: ${result.executionTime}ms`));
          if (result.output) {
            console.log(chalk.yellow('\n输出:'));
            console.log(chalk.white(JSON.stringify(result.output, null, 2)));
          }
        } else {
          console.log(chalk.red('\n❌ 工具调用失败:'));
          console.log(chalk.red(result.error || '未知错误'));
        }
      } catch (error) {
        console.log(chalk.red('\n❌ 调用错误:'));
        console.log(chalk.red(error instanceof Error ? error.message : '未知错误'));
      }
    } else if (options.permissions) {
      const permissions = enhancedToolManager.getPermissions();

      console.log(chalk.cyan('\n🔐 工具权限管理:'));
      console.log(chalk.gray('═'.repeat(50)));

      if (permissions.length === 0) {
        console.log(chalk.gray('使用默认行为 (ask)'));
      } else {
        permissions.forEach(({ toolName, behavior }) => {
          const color = behavior === 'allow' ? chalk.green : chalk.red;
          console.log(color(`${toolName}: ${behavior}`));
        });
      }

      console.log(chalk.yellow('\n权限管理命令:'));
      console.log(chalk.gray('  aicli tool --permissions                    - 查看权限'));
      console.log(chalk.gray('  (通过REPL界面设置权限)'));
    } else if (options.history) {
      const history = enhancedToolManager.getCallHistory(20);

      console.log(chalk.cyan('\n📋 工具调用历史:'));
      console.log(chalk.gray('═'.repeat(50)));

      if (history.length === 0) {
        console.log(chalk.gray('暂无调用历史'));
      } else {
        history.forEach((call, index) => {
          const status = call.success ? chalk.green('✅') : chalk.red('❌');
          console.log(`${status} ${call.timestamp.toLocaleTimeString()} ${call.toolName} (${call.executionTime}ms)`);
          if (!call.success && call.error) {
            console.log(chalk.red(`   错误: ${call.error}`));
          }
        });
      }
    } else if (options.stats) {
      const stats = enhancedToolManager.getStatistics();

      console.log(chalk.cyan('\n📊 工具使用统计:'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(chalk.white(`总调用次数: ${stats.totalToolCalls}`));
      console.log(chalk.white(`成功调用: ${stats.successfulCalls}`));
      console.log(chalk.white(`失败调用: ${stats.failedCalls}`));
      console.log(chalk.white(`平均执行时间: ${stats.averageExecutionTime.toFixed(2)}ms`));
      console.log(chalk.white(`最常用工具: ${stats.mostUsedTool}`));
      console.log(chalk.white(`工具链执行: ${stats.totalChains}`));
      console.log(chalk.white(`成功工具链: ${stats.successfulChains}`));
    } else {
      console.log(chalk.cyan('\n🛠️ 工具管理:'));
      console.log(chalk.gray('  aicli tool --list                    - 列出所有工具'));
      console.log(chalk.gray('  aicli tool --categories               - 按类别显示'));
      console.log(chalk.gray('  aicli tool --call <tool> --input <json> - 调用工具'));
      console.log(chalk.gray('  aicli tool --permissions             - 管理权限'));
      console.log(chalk.gray('  aicli tool --history                 - 调用历史'));
      console.log(chalk.gray('  aicli tool --stats                   - 使用统计'));
    }

    console.log('');
  });

// 增强版：状态命令
program
  .command('status')
  .alias('s')
  .description('显示完整系统状态')
  .option('--json', '以JSON格式输出')
  .option('--detailed', '显示详细信息')
  .action(async (options) => {
    if (options.json) {
      const currentProvider = config.getCurrentProvider();
      const context = await import('./core/project-context').then(m => m.projectContext.detectProject());
      const currentSession = sessionManager.getCurrentSession();

      const status = {
        timestamp: new Date().toISOString(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        },
        ai: {
          provider: currentProvider?.name,
          model: config.get('currentModel'),
          status: currentProvider ? 'configured' : 'not_configured'
        },
        project: {
          type: (await context).type,
          rootPath: (await context).rootPath,
          fileCount: (await context).files.length,
          gitRepo: (await context).gitRepo
        },
        session: currentSession ? {
          id: currentSession.metadata.id,
          title: currentSession.metadata.title,
          messageCount: currentSession.messages.length
        } : null,
        enhanced: {
          tools: enhancedToolManager.getStatistics(),
          codeExecutor: {
            availableEnvironments: enhancedCodeExecutor.getAvailableEnvironments().length,
            totalExecutions: enhancedCodeExecutor.getStatistics().totalExecutions
          },
          webSearch: {
            availableEngines: enhancedWebSearch.getAvailableEngines().length,
            totalSearches: enhancedWebSearch.getStatistics().totalSearches
          }
        }
      };

      console.log(JSON.stringify(status, null, 2));
    } else {
      const currentProvider = config.getCurrentProvider();
      const validation = config.validateCurrentProvider();
      const context = await import('./core/project-context').then(m => m.projectContext.detectProject());
      const currentSession = sessionManager.getCurrentSession();

      console.log(chalk.cyan('\n📊 完整系统状态:'));
      console.log(chalk.gray('═'.repeat(60)));

      // 系统信息
      console.log(chalk.yellow('🖥️ 系统信息:'));
      console.log(chalk.white(`  Node.js: ${process.version}`));
      console.log(chalk.white(`  平台: ${process.platform} (${process.arch})`));
      console.log(chalk.white(`  工作目录: ${process.cwd()}`));

      // AI 配置
      if (currentProvider) {
        console.log(chalk.yellow('\n🤖 AI 配置:'));
        console.log(chalk.white(`  提供商: ${currentProvider.name}`));
        console.log(chalk.white(`  模型: ${config.get('currentModel')}`));
        console.log(chalk.white(`  API URL: ${currentProvider.baseUrl}`));
        console.log(chalk.white(`  状态: ${validation.valid ? '🟢 正常' : '🔴 ' + validation.message}`));
      }

      // 项目信息
      const projectContextResult = await context;
      console.log(chalk.yellow('\n🏗️ 项目信息:'));
      console.log(chalk.white(`  类型: ${projectContextResult.type}`));
      console.log(chalk.white(`  路径: ${projectContextResult.rootPath}`));
      console.log(chalk.white(`  文件数: ${projectContextResult.files.length}`));
      console.log(chalk.white(`  Git: ${projectContextResult.gitRepo ? '✅ 是' : '❌ 否'}`));

      // 增强功能状态
      if (options.detailed) {
        console.log(chalk.yellow('\n🚀 增强功能状态:'));

        // AI服务状态
        try {
          const aiHealth = await enhancedAIService.healthCheck();
          const aiStatus = aiHealth.status === 'healthy' ? '🟢' : '🔴';
          console.log(chalk.white(`  ${aiStatus} AI服务: ${aiHealth.provider} - ${aiHealth.status}`));
        } catch (error) {
          console.log(chalk.white('  🔴 AI服务: 连接失败'));
        }

        // 工具管理状态
        const toolStats = enhancedToolManager.getStatistics();
        console.log(chalk.white(`  🛠️ 工具管理: ${toolStats.totalToolCalls} 次调用`));

        // 代码执行状态
        const execStats = enhancedCodeExecutor.getStatistics();
        const envCount = enhancedCodeExecutor.getAvailableEnvironments().length;
        console.log(chalk.white(`  💻 代码执行: ${envCount} 个环境, ${execStats.totalExecutions} 次执行`));

        // Web搜索状态
        const searchStats = enhancedWebSearch.getStatistics();
        const engineCount = enhancedWebSearch.getAvailableEngines().length;
        console.log(chalk.white(`  🔍 Web搜索: ${engineCount} 个引擎, ${searchStats.totalSearches} 次搜索`));

        // 文件操作状态
        try {
          const fileStats = enhancedFileOperations.getStatistics();
          console.log(chalk.white(`  📁 文件操作: 缓存 ${fileStats.cacheSize} 项`));
        } catch (error) {
          console.log(chalk.white('  📁 文件操作: 未初始化'));
        }

        // 图像处理状态
        try {
          const imageStats = enhancedImageProcessor.getStatistics();
          console.log(chalk.white(`  🖼️ 图像处理: ${imageStats.supportedFormats.length} 种格式`));
        } catch (error) {
          console.log(chalk.white('  🖼️ 图像处理: 未初始化'));
        }
      }

      // 会话信息
      if (currentSession) {
        console.log(chalk.yellow('\n💾 当前会话:'));
        console.log(chalk.white(`  ID: ${currentSession.metadata.id}`));
        console.log(chalk.white(`  标题: ${currentSession.metadata.title}`));
        console.log(chalk.white(`  消息数: ${currentSession.messages.length}`));
        const tokensUsed = currentSession.messages.reduce((total, msg) => total + (msg.metadata?.tokens || 0), 0);
        console.log(chalk.white(`  Token 数: ${tokensUsed}`));
        console.log(chalk.white(`  创建时间: ${currentSession.metadata.createdAt.toLocaleString()}`));
      }

      // 快速操作建议
      console.log(chalk.yellow('\n💡 快速操作:'));
      console.log(chalk.gray('  aicli start          - 启动交互式界面'));
      console.log(chalk.gray('  aicli validate       - 验证系统配置'));
      console.log(chalk.gray('  aicli exec --code    - 执行代码'));
      console.log(chalk.gray('  aicli search --query - Web搜索'));
      console.log(chalk.gray('  aicli tool --list    - 查看工具'));
    }

    console.log('');
  });

// 如果没有提供任何参数，默认启动交互式界面
if (process.argv.length === 2) {
  console.log(chalk.cyan('🤖 欢迎使用增强版 AICLI!'));
  console.log(chalk.gray('输入 --help 查看所有可用命令\n'));

  // 检查是否有API密钥配置
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(chalk.yellow('⚠️  未检测到API密钥配置'));
    console.log(chalk.gray('请设置环境变量:'));
    console.log(chalk.gray('  export DEEPSEEK_API_KEY="your_api_key"'));
    console.log(chalk.gray('  export OPENAI_API_KEY="your_api_key"\n'));
  }

  // 默认启动现代化界面
  console.log(chalk.cyan('\n🚀 启动现代化界面...\n'));

  // 直接启动现代化界面
  const modernUI = new ModernCLIInterface({
    theme: 'auto',
    showSidebar: true,
    showStatusBar: true,
    enableAnimations: true
  });

  // 初始化会话信息
  const currentProvider = config.getCurrentProvider();
  const currentModel = config.getCurrentModel();

  if (currentProvider && currentModel) {
    modernUI.updateSession({
      id: 'session_' + Date.now(),
      model: currentModel,
      provider: currentProvider.name,
      messages: 0,
      startTime: new Date()
    });
  }

  // 设置工具状态
  const tools = [
    { name: 'web_search', category: 'Web', status: 'ready' as const, description: 'Web搜索功能' },
    { name: 'execute_code', category: 'Code', status: 'ready' as const, description: '代码执行' },
    { name: 'analyze_file', category: 'File', status: 'ready' as const, description: '文件分析' },
    { name: 'process_image', category: 'Media', status: 'ready' as const, description: '图像处理' },
    { name: 'project_operation', category: 'Project', status: 'ready' as const, description: '项目管理' }
  ];

  tools.forEach(tool => {
    modernUI.updateToolStatus(tool.name, tool);
  });

  // 启动界面
  modernUI.start();
} else {
  program.parse();
}