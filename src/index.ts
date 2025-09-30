#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ModernCLIInterface } from './ui/modern-cli-interface';
import { config } from './config';
import { getAllProviderNames } from './config/providers';

const program = new Command();

program
  .name('aicli')
  .description('智能编程助手终端工具')
  .version('1.0.0');

program
  .command('start')
  .alias('s')
  .description('启动传统交互式对话')
  .action(() => {
    // 使用现代化界面
    import('./ui/modern-cli-interface').then(({ ModernCLIInterface }) => {
      const terminalUI = new ModernCLIInterface({
        theme: 'auto',
        showSidebar: true,
        showStatusBar: true,
        enableAnimations: true
      });
      terminalUI.start();
    });
  });

program
  .command('claude')
  .alias('c')
  .description('启动 Claude CLI 风格界面')
  .action(() => {
    const claudeUI = new ModernCLIInterface({
      theme: 'claude',
      showSidebar: true,
      showStatusBar: true,
      enableAnimations: true
    });
    claudeUI.start();
  });

program
  .command('modern')
  .alias('m')
  .description('启动增强版现代CLI界面 (事件驱动架构)')
  .option('--no-screenshot-paste', '禁用截图粘贴功能')
  .action((options) => {
    // 动态导入以避免循环依赖
    import('./ui/modern-cli-interface').then(({ ModernCLIInterface }) => {
      const modernUI = new ModernCLIInterface({
        theme: 'auto',
        showSidebar: true,
        showStatusBar: true,
        enableAnimations: true,
        enableScreenshotPaste: options.screenshotPaste !== false
      });
      modernUI.start();
    });
  });

program
  .command('config')
  .alias('cfg')
  .description('配置管理')
  .option('-l, --list', '显示所有配置')
  .option('-r, --reset', '重置配置')
  .action((options) => {
    if (options.list) {
      console.log(chalk.cyan('\n当前配置:'));
      console.log(chalk.gray('─'.repeat(30)));

      const currentProvider = config.getCurrentProvider();
      if (currentProvider) {
        console.log(chalk.white('提供商: ') + chalk.green(currentProvider.name));
        console.log(chalk.white('模型: ') + chalk.green(config.get('currentModel')));
        console.log(chalk.white('主题: ') + chalk.green(config.get('theme')));
        console.log(chalk.white('自动保存: ') + chalk.green(config.get('autoSave') ? '开启' : '关闭'));
        console.log(chalk.white('历史记录: ') + chalk.green(`${config.get('sessionHistory')} 条`));
      }
    } else if (options.reset) {
      config.reset();
      console.log(chalk.green('✓ 配置已重置'));
    } else {
      console.log(chalk.cyan('\n配置选项:'));
      console.log(chalk.gray('  aicli config --list    显示配置'));
      console.log(chalk.gray('  aicli config --reset    重置配置'));
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
      console.log(chalk.cyan('\n可用的 AI 提供商:'));
      getAllProviderNames().forEach(provider => {
        const current = config.get('currentProvider') === provider ? chalk.green(' ✓') : '';
        console.log(chalk.white(`  ${provider}${current}`));
      });
    } else if (options.set) {
      const providerName = options.set;
      if (getAllProviderNames().includes(providerName)) {
        if (config.setCurrentProvider(providerName)) {
          console.log(chalk.green(`✓ 已切换到 ${providerName}`));
        }
      } else {
        console.log(chalk.red(`✗ 未知的提供商: ${providerName}`));
      }
    } else {
      console.log(chalk.cyan('\n提供商管理:'));
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
      console.log(chalk.red('✗ 没有配置提供商'));
      return;
    }

    if (options.list) {
      console.log(chalk.cyan(`\n${currentProvider.name} 可用的模型:`));
      currentProvider.models.forEach(model => {
        const current = config.get('currentModel') === model ? chalk.green(' ✓') : '';
        console.log(chalk.white(`  ${model}${current}`));
      });
    } else if (options.set) {
      const modelName = options.set;
      if (currentProvider.models.includes(modelName)) {
        if (config.setCurrentModel(modelName)) {
          console.log(chalk.green(`✓ 已切换到模型 ${modelName}`));
        }
      } else {
        console.log(chalk.red(`✗ 未知的模型: ${modelName}`));
      }
    } else {
      console.log(chalk.cyan('\n模型管理:'));
      console.log(chalk.gray('  aicli model --list    列出模型'));
      console.log(chalk.gray('  aicli model --set <name>    设置模型'));
    }
  });

program
  .command('status')
  .alias('st')
  .description('显示当前状态')
  .action(() => {
    const currentProvider = config.getCurrentProvider();
    const validation = config.validateCurrentProvider();

    console.log(chalk.cyan('\n当前状态:'));
    console.log(chalk.gray('─'.repeat(30)));

    if (currentProvider) {
      console.log(chalk.white('提供商: ') + chalk.green(currentProvider.name));
      console.log(chalk.white('模型: ') + chalk.green(config.get('currentModel')));
      console.log(chalk.white('API URL: ') + chalk.blue(currentProvider.baseUrl));

      const apiKey = config.getApiKey(currentProvider.name);
      console.log(chalk.white('API Key: ') + (apiKey ? chalk.green('已配置') : chalk.red('未配置')));

      console.log(chalk.white('状态: ') + (validation.valid ? chalk.green('正常') : chalk.red(validation.message)));
    } else {
      console.log(chalk.red('✗ 没有配置提供商'));
    }

    console.log('');
  });

program
  .command('env')
  .description('显示环境变量配置说明')
  .action(() => {
    console.log(chalk.cyan('\n环境变量配置:'));
    console.log(chalk.gray('─'.repeat(40)));

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

    console.log(chalk.green('示例配置:'));
    console.log(chalk.gray('  export ANTHROPIC_API_KEY=your_api_key_here'));
    console.log(chalk.gray('  # 或者添加到 ~/.bashrc 或 ~/.zshrc'));
  });

// 默认命令 - 启动增强版现代CLI界面
if (process.argv.length === 2) {
  program.action(() => {
    // 动态导入以避免循环依赖
    import('./ui/modern-cli-interface').then(({ ModernCLIInterface }) => {
      const modernUI = new ModernCLIInterface({
        theme: 'auto',
        showSidebar: true,
        showStatusBar: true,
        enableAnimations: true
      });
      modernUI.start();
    });
  });
}

program.parse();