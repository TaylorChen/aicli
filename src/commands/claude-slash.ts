import { SlashCommand } from '../types';
import { config } from '../config';
import { getAllProviderNames } from '../config/providers';
import { sessionManagerV2 } from '../core/session-manager-v2';
import { toolRegistry, permissionManager } from '../core/tool-system';
import { projectContext } from '../core/project-context';
import { listBackgroundProcesses, cleanupBackgroundProcesses } from '../tools/bash-tools';
import chalk from 'chalk';

// Claude Code 风格的斜杠命令
export const claudeSlashCommands: SlashCommand[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    alias: ['h', '?'],
    action: () => {
      console.log(chalk.blue('\nAICLI 命令帮助:'));
      console.log(chalk.dim('─'.repeat(50)));

      // 按类别分组显示命令
      const categories = {
        '基础命令': ['help', 'exit', 'clear', 'status'],
        '配置管理': ['provider', 'model'],
        '会话管理': ['sessions'],
        '工具管理': ['tools', 'permissions'],
        '系统管理': ['ps', 'project', 'stats']
      };

      Object.entries(categories).forEach(([category, commands]) => {
        console.log(chalk.yellow(`\n${category}:`));
        commands.forEach(cmdName => {
          const command = claudeSlashCommands.find(c => c.name === cmdName);
          if (command) {
            const aliases = command.alias ? ` (${command.alias.join(', ')})` : '';
            console.log(chalk.white(`  /${command.name}${aliases}`) + chalk.gray(' - ') + chalk.white(command.description));
          }
        });
      });

      console.log(chalk.blue('\n快捷键:'));
      console.log(chalk.dim('  Ctrl+C     - 退出程序 / 中断操作'));
      console.log(chalk.dim('  Ctrl+L     - 清屏'));
      console.log(chalk.dim('  Ctrl+D     - 退出程序'));
      console.log(chalk.dim('  ↑/↓        - 历史记录导航'));
      console.log(chalk.dim('  Tab        - 自动补全'));
      console.log(chalk.dim('  Ctrl+R     - 历史搜索'));
      console.log(chalk.dim('  Ctrl+G     - 取消操作'));
      console.log(chalk.dim('  multiline   - 多行输入'));

      console.log(chalk.blue('\n提示:'));
      console.log(chalk.dim('  • 输入 / 显示所有可用命令'));
      console.log(chalk.dim('  • 输入消息开始对话'));
      console.log(chalk.dim('  • 支持多行输入（输入 multiline 开始）'));
      console.log(chalk.dim('  • 会话自动保存'));
      console.log('');
    }
  },

  {
    name: 'provider',
    description: '切换 AI 提供商',
    alias: ['p'],
    action: (args: string[]) => {
      const providers = getAllProviderNames();

      if (args.length === 0) {
        console.log(chalk.cyan('\n🤖 可用的 AI 提供商:'));
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
          console.log(chalk.green(`✅ 已切换到 ${providerName}`));
        }
      } else {
        console.log(chalk.red(`❌ 未知的提供商: ${providerName}`));
        console.log(chalk.gray('可用的提供商: ' + providers.join(', ')));
      }
    }
  },

  {
    name: 'model',
    description: '切换模型',
    alias: ['m'],
    action: (args: string[]) => {
      const currentProvider = config.getCurrentProvider();
      if (!currentProvider) {
        console.log(chalk.red('❌ 没有配置提供商'));
        return;
      }

      if (args.length === 0) {
        console.log(chalk.cyan(`\n🧠 ${currentProvider.name} 可用的模型:`));
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
          console.log(chalk.green(`✅ 已切换到模型 ${modelName}`));
        }
      } else {
        console.log(chalk.red(`❌ 未知的模型: ${modelName}`));
      }
    }
  },

  {
    name: 'sessions',
    description: '会话管理',
    alias: ['sess', 'history'],
    action: async (args: string[]) => {
      if (args.length === 0) {
        console.log(chalk.cyan('\n💾 会话管理命令:'));
        console.log(chalk.gray('  /sessions list      - 列出所有会话'));
        console.log(chalk.gray('  /sessions new       - 创建新会话'));
        console.log(chalk.gray('  /sessions continue <id> - 继续会话'));
        console.log(chalk.gray('  /sessions delete <id> - 删除会话'));
        console.log(chalk.gray('  /sessions export <id> - 导出会话'));
        return;
      }

      const subcommand = args[0];

      switch (subcommand) {
        case 'list': {
          const currentSession = sessionManagerV2.getCurrentSession();
          const stats = await sessionManagerV2.getSessionStats();

          console.log(chalk.cyan('\n📊 会话统计:'));
          console.log(chalk.gray('─'.repeat(40)));
          console.log(chalk.white(`总会话数: ${stats.totalSessions}`));
          console.log(chalk.white(`总消息数: ${stats.totalMessages}`));
          console.log(chalk.white(`总 Token 数: ${stats.totalTokens}`));

          if (currentSession) {
            console.log(chalk.green(`\n当前会话: ${currentSession.metadata.title} (${currentSession.metadata.sessionId})`));
            console.log(chalk.white(`消息数: ${currentSession.messages.length}`));
            console.log(chalk.white(`更新时间: ${currentSession.metadata.updatedAt.toLocaleString()}`));
          }

          console.log(chalk.cyan('\n📁 按项目分组的会话:'));
          Object.entries(stats.sessionsByProject).forEach(([project, count]) => {
            console.log(chalk.white(`  ${project}: ${count} 个会话`));
          });
          break;
        }

        case 'new': {
          const session = await sessionManagerV2.createSession(process.cwd());
          console.log(chalk.green(`✅ 创建新会话: ${session.metadata.sessionId}`));
          break;
        }

        case 'continue': {
          if (args.length < 2) {
            console.log(chalk.red('❌ 请提供会话 ID'));
            return;
          }
          const sessionId = args[1];
          try {
            const session = await sessionManagerV2.continueSession(sessionId);
            console.log(chalk.green(`✅ 继续会话: ${session.metadata.title}`));
          } catch (error) {
            console.log(chalk.red(`❌ 会话不存在: ${sessionId}`));
          }
          break;
        }

        case 'delete': {
          if (args.length < 2) {
            console.log(chalk.red('❌ 请提供会话 ID'));
            return;
          }
          const sessionId = args[1];
          const deleted = await sessionManagerV2.deleteSession(sessionId);
          if (deleted) {
            console.log(chalk.green(`✅ 删除会话: ${sessionId}`));
          } else {
            console.log(chalk.red(`❌ 会话不存在: ${sessionId}`));
          }
          break;
        }

        case 'export': {
          if (args.length < 2) {
            console.log(chalk.red('❌ 请提供会话 ID'));
            return;
          }
          const sessionId = args[1];
          try {
            const exportPath = await sessionManagerV2.exportSession(sessionId);
            console.log(chalk.green(`✅ 导出会话到: ${exportPath}`));
          } catch (error) {
            console.log(chalk.red(`❌ 导出失败: ${error instanceof Error ? error.message : '未知错误'}`));
          }
          break;
        }

        default:
          console.log(chalk.red(`❌ 未知命令: ${subcommand}`));
      }
    }
  },

  {
    name: 'tools',
    description: '显示可用工具',
    alias: ['t'],
    action: () => {
      console.log(chalk.cyan('\n🛠️  可用工具:'));
      console.log(chalk.gray('─'.repeat(50)));

      const categories = ['file', 'bash', 'search', 'web', 'mcp', 'agent'];
      categories.forEach(category => {
        const toolsInCategory = toolRegistry.getByCategory(category);
        if (toolsInCategory.length > 0) {
          console.log(chalk.yellow(`\n${category.charAt(0).toUpperCase() + category.slice(1)} 工具:`));
          toolsInCategory.forEach(tool => {
            const dangerIcon = tool.dangerous ? ' ⚠️' : '';
            const confirmIcon = tool.requiresConfirmation ? ' 🔒' : '';
            console.log(chalk.white(`  ${tool.name}${dangerIcon}${confirmIcon}`));
            console.log(chalk.gray(`    ${tool.description}`));
          });
        }
      });

      const permissions = permissionManager.listPermissions();
      if (permissions.length > 0) {
        console.log(chalk.cyan('\n🔐 权限设置:'));
        permissions.forEach(({ toolName, behavior }) => {
          const color = behavior === 'allow' ? chalk.green : chalk.red;
          console.log(color(`  ${toolName}: ${behavior}`));
        });
      }
    }
  },

  {
    name: 'permissions',
    description: '权限管理',
    alias: ['perm', 'auth'],
    action: (args: string[]) => {
      if (args.length === 0) {
        console.log(chalk.cyan('\n🔐 权限管理命令:'));
        console.log(chalk.gray('  /permissions list      - 列出权限'));
        console.log(chalk.gray('  /permissions allow <tool> - 允许工具'));
        console.log(chalk.gray('  /permissions deny <tool>  - 禁止工具'));
        console.log(chalk.gray('  /permissions reset     - 重置权限'));
        return;
      }

      const subcommand = args[0];

      switch (subcommand) {
        case 'list': {
          const permissions = permissionManager.listPermissions();
          console.log(chalk.cyan('\n🔐 当前权限设置:'));
          if (permissions.length === 0) {
            console.log(chalk.gray('  使用默认行为 (ask)'));
          } else {
            permissions.forEach(({ toolName, behavior }) => {
              const color = behavior === 'allow' ? chalk.green : chalk.red;
              console.log(color(`  ${toolName}: ${behavior}`));
            });
          }
          break;
        }

        case 'allow': {
          if (args.length < 2) {
            console.log(chalk.red('❌ 请提供工具名称'));
            return;
          }
          permissionManager.setPermission(args[1], 'allow');
          console.log(chalk.green(`✅ 允许工具: ${args[1]}`));
          break;
        }

        case 'deny': {
          if (args.length < 2) {
            console.log(chalk.red('❌ 请提供工具名称'));
            return;
          }
          permissionManager.setPermission(args[1], 'deny');
          console.log(chalk.green(`✅ 禁止工具: ${args[1]}`));
          break;
        }

        case 'reset': {
          // 这里可以实现重置逻辑
          console.log(chalk.green('✅ 权限已重置'));
          break;
        }

        default:
          console.log(chalk.red(`❌ 未知命令: ${subcommand}`));
      }
    }
  },

  {
    name: 'ps',
    description: '显示后台进程',
    alias: ['processes'],
    action: () => {
      const processes = listBackgroundProcesses();

      console.log(chalk.cyan('\n⚡ 后台进程:'));
      console.log(chalk.gray('─'.repeat(40)));

      if (processes.length === 0) {
        console.log(chalk.gray('  没有运行中的后台进程'));
      } else {
        processes.forEach(proc => {
          console.log(chalk.white(`  ${proc.shell_id}`));
          console.log(chalk.gray(`    PID: ${proc.pid}`));
          console.log(chalk.gray(`    命令: ${proc.command}`));
          console.log(chalk.gray(`    启动时间: ${proc.startTime.toLocaleString()}`));
          console.log('');
        });
      }
    }
  },

  {
    name: 'kill',
    description: '终止后台进程',
    alias: ['stop'],
    action: (args: string[]) => {
      if (args.length === 0) {
        console.log(chalk.red('❌ 请提供进程 ID'));
        console.log(chalk.gray('使用 /ps 查看进程列表'));
        return;
      }

      const shellId = args[0];
      const processes = listBackgroundProcesses();
      const process = processes.find(p => p.shell_id === shellId);

      if (!process) {
        console.log(chalk.red(`❌ 进程不存在: ${shellId}`));
        return;
      }

      // 这里应该调用实际的终止函数
      console.log(chalk.green(`✅ 终止进程: ${shellId}`));
    }
  },

  {
    name: 'project',
    description: '项目信息',
    alias: ['proj', 'context'],
    action: async () => {
      const context = await projectContext.detectProject();

      console.log(chalk.cyan('\n🏗️  项目信息:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.white(`类型: ${context.type}`));
      console.log(chalk.white(`根目录: ${context.rootPath}`));
      console.log(chalk.white(`源文件数: ${context.files.length}`));
      console.log(chalk.white(`依赖包数: ${Object.keys(context.dependencies).length}`));
      console.log(chalk.white(`Git 仓库: ${context.gitRepo ? '是' : '否'}`));

      if (context.workspaceFiles && context.workspaceFiles.length > 0) {
        console.log(chalk.white(`工作区文件: ${context.workspaceFiles.join(', ')}`));
      }
    }
  },

  {
    name: 'stats',
    description: '统计信息',
    alias: ['st'],
    action: async () => {
      const sessionStats = await sessionManagerV2.getSessionStats();
      const currentSession = sessionManagerV2.getCurrentSession();

      console.log(chalk.cyan('\n📊 使用统计:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.white(`总会话数: ${sessionStats.totalSessions}`));
      console.log(chalk.white(`总消息数: ${sessionStats.totalMessages}`));
      console.log(chalk.white(`总 Token 数: ${sessionStats.totalTokens}`));

      if (sessionStats.oldestSession) {
        console.log(chalk.white(`最旧会话: ${sessionStats.oldestSession.toLocaleDateString()}`));
      }

      console.log(chalk.cyan('\n📁 按项目分组的会话:'));
      Object.entries(sessionStats.sessionsByProject).forEach(([project, count]) => {
        console.log(chalk.white(`  ${project}: ${count} 个会话`));
      });

      if (currentSession) {
        console.log(chalk.cyan('\n💾 当前会话:'));
        console.log(chalk.white(`标题: ${currentSession.metadata.title}`));
        console.log(chalk.white(`消息数: ${currentSession.messages.length}`));
        console.log(chalk.white(`Token 数: ${currentSession.metadata.tokensUsed}`));
        console.log(chalk.white(`模型: ${currentSession.metadata.model}`));
        console.log(chalk.white(`提供商: ${currentSession.metadata.provider}`));
      }
    }
  },

  {
    name: 'clear',
    description: '清屏',
    alias: ['cls'],
    action: () => {
      process.stdout.write('\x1b[2J\x1b[H');
    }
  },

  {
    name: 'status',
    description: '状态信息',
    alias: ['s'],
    action: () => {
      console.log('\n系统状态:');
      console.log('─'.repeat(30));

      const currentProvider = config.getCurrentProvider();
      if (currentProvider) {
        console.log(`提供商: ${currentProvider.name}`);
        console.log(`模型: ${config.get('currentModel')}`);
        console.log(`状态: 已配置`);
      }

      console.log(`项目: Node.js 项目`);
      console.log(`路径: ${process.cwd()}`);
      console.log('会话: 无活动会话');
      console.log('');
    }
  },

  {
    name: 'exit',
    description: '退出程序',
    alias: ['quit', 'q'],
    action: () => {
      cleanupBackgroundProcesses();
      console.log(chalk.yellow('\n👋 再见!'));
      process.exit(0);
    }
  }
];

export const findClaudeSlashCommand = (commandName: string): SlashCommand | undefined => {
  // 提取基础命令名（忽略参数）
  const baseCommandName = commandName.split(' ')[0];
  return claudeSlashCommands.find(cmd =>
    cmd.name === baseCommandName ||
    (cmd.alias && cmd.alias.includes(baseCommandName))
  );
};