import { SlashCommand } from '../types';
import { config } from '../config';
import { getAllProviderNames } from '../config/providers';
import chalk from 'chalk';

export const slashCommands: SlashCommand[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    alias: ['h'],
    action: () => {
      console.log(chalk.cyan('\n可用命令:'));
      console.log(chalk.gray('─'.repeat(50)));

      slashCommands.forEach(cmd => {
        const aliases = cmd.alias ? ` (${cmd.alias.join(', ')})` : '';
        console.log(chalk.green(`/${cmd.name}${aliases}`) + chalk.gray(' - ') + chalk.white(cmd.description));
      });

      console.log(chalk.gray('\n快捷键:'));
      console.log(chalk.yellow('Ctrl+C') + chalk.gray(' - 退出程序'));
      console.log(chalk.yellow('Ctrl+L') + chalk.gray(' - 清屏'));
      console.log(chalk.yellow('↑/↓') + chalk.gray(' - 历史记录导航'));
      console.log('');
    }
  },
  {
    name: 'provider',
    description: '切换 AI 提供商',
    alias: ['p'],
    action: (args) => {
      const providers = getAllProviderNames();

      if (args.length === 0) {
        console.log(chalk.cyan('\n可用的 AI 提供商:'));
        providers.forEach(provider => {
          const current = config.get('currentProvider') === provider ? chalk.green(' ✓') : '';
          console.log(chalk.white(`  ${provider}${current}`));
        });
        console.log(chalk.gray('\n用法: /provider <provider_name>'));
        return;
      }

      const providerName = args[0];
      if (providers.includes(providerName)) {
        if (config.setCurrentProvider(providerName)) {
          console.log(chalk.green(`✓ 已切换到 ${providerName}`));
        }
      } else {
        console.log(chalk.red(`✗ 未知的提供商: ${providerName}`));
        console.log(chalk.gray('可用的提供商: ' + providers.join(', ')));
      }
    }
  },
  {
    name: 'model',
    description: '切换模型',
    alias: ['m'],
    action: (args) => {
      const currentProvider = config.getCurrentProvider();
      if (!currentProvider) {
        console.log(chalk.red('✗ 没有配置提供商'));
        return;
      }

      if (args.length === 0) {
        console.log(chalk.cyan(`\n${currentProvider.name} 可用的模型:`));
        currentProvider.models.forEach(model => {
          const current = config.get('currentModel') === model ? chalk.green(' ✓') : '';
          console.log(chalk.white(`  ${model}${current}`));
        });
        console.log(chalk.gray('\n用法: /model <model_name>'));
        return;
      }

      const modelName = args[0];
      if (currentProvider.models.includes(modelName)) {
        if (config.setCurrentModel(modelName)) {
          console.log(chalk.green(`✓ 已切换到模型 ${modelName}`));
        }
      } else {
        console.log(chalk.red(`✗ 未知的模型: ${modelName}`));
      }
    }
  },
  {
    name: 'status',
    description: '显示当前状态',
    alias: ['s'],
    action: () => {
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
    }
  },
  {
    name: 'clear',
    description: '清屏',
    alias: ['c'],
    action: () => {
      process.stdout.write('\x1b[2J\x1b[H');
    }
  },
  {
    name: 'exit',
    description: '退出程序',
    alias: ['quit', 'q'],
    action: () => {
      console.log(chalk.yellow('再见! 👋'));
      process.exit(0);
    }
  },
  {
    name: 'config',
    description: '显示配置信息',
    alias: ['cfg'],
    action: () => {
      const currentProvider = config.getCurrentProvider();
      console.log(chalk.cyan('\n配置信息:'));
      console.log(chalk.gray('─'.repeat(30)));

      if (currentProvider) {
        console.log(chalk.white('环境变量: ') + chalk.yellow(currentProvider.apiKeyEnvVar));
        console.log(chalk.white('主题: ') + chalk.green(config.get('theme')));
        console.log(chalk.white('自动保存: ') + chalk.green(config.get('autoSave') ? '开启' : '关闭'));
        console.log(chalk.white('历史记录: ') + chalk.green(`${config.get('sessionHistory')} 条`));
      }

      console.log('');
    }
  }
];

export const findSlashCommand = (commandName: string): SlashCommand | undefined => {
  return slashCommands.find(cmd =>
    cmd.name === commandName ||
    (cmd.alias && cmd.alias.includes(commandName))
  );
};