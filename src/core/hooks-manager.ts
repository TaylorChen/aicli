/**
 * Hooks系统管理器
 * 支持在关键执行点插入自定义逻辑
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export type HookType = 
  | 'beforeCommand'
  | 'afterCommand'
  | 'onError'
  | 'onFileChange'
  | 'onAgentCall'
  | 'onToolUse'
  | 'beforeAIRequest'
  | 'afterAIResponse';

export interface HookConfig {
  type: 'command' | 'script' | 'notification' | 'log' | 'http';
  command?: string;
  script?: string;
  url?: string;
  message?: string;
  file?: string;
  enabled?: boolean;
}

export interface HookContext {
  type: HookType;
  input?: string;
  output?: string;
  error?: string;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface HooksSettings {
  hooks?: {
    [key in HookType]?: HookConfig[];
  };
}

export class HooksManager {
  private settings: HooksSettings = {};
  private workspacePath: string;
  private enabled: boolean = true;

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
    this.loadSettings();
  }

  /**
   * 加载Hooks配置
   */
  private loadSettings(): void {
    // 加载用户级配置
    const userSettingsPath = path.join(process.env.HOME || '', '.aicli', 'settings.json');
    if (fs.existsSync(userSettingsPath)) {
      try {
        const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf-8'));
        this.mergeSettings(userSettings);
      } catch (error) {
        console.error(chalk.yellow('⚠️  加载用户级Hooks配置失败'));
      }
    }

    // 加载项目级配置
    const projectSettingsPath = path.join(this.workspacePath, '.aicli', 'settings.json');
    if (fs.existsSync(projectSettingsPath)) {
      try {
        const projectSettings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf-8'));
        this.mergeSettings(projectSettings);
      } catch (error) {
        console.error(chalk.yellow('⚠️  加载项目级Hooks配置失败'));
      }
    }

    // 加载本地配置（优先级最高）
    const localSettingsPath = path.join(this.workspacePath, '.aicli', 'settings.local.json');
    if (fs.existsSync(localSettingsPath)) {
      try {
        const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'));
        this.mergeSettings(localSettings);
      } catch (error) {
        console.error(chalk.yellow('⚠️  加载本地Hooks配置失败'));
      }
    }
  }

  /**
   * 合并配置
   */
  private mergeSettings(newSettings: HooksSettings): void {
    if (newSettings.hooks) {
      this.settings.hooks = {
        ...this.settings.hooks,
        ...newSettings.hooks
      };
    }
  }

  /**
   * 触发Hook
   */
  async trigger(type: HookType, context: Partial<HookContext>): Promise<void> {
    if (!this.enabled) return;

    const hooks = this.settings.hooks?.[type];
    if (!hooks || hooks.length === 0) return;

    const fullContext: HookContext = {
      type,
      timestamp: new Date(),
      ...context
    };

    // 并行执行所有Hooks
    await Promise.all(
      hooks
        .filter(h => h.enabled !== false)
        .map(hook => this.executeHook(hook, fullContext))
    );
  }

  /**
   * 执行单个Hook
   */
  private async executeHook(hook: HookConfig, context: HookContext): Promise<void> {
    try {
      switch (hook.type) {
        case 'command':
          await this.executeCommand(hook.command!, context);
          break;

        case 'script':
          await this.executeScript(hook.script!, context);
          break;

        case 'notification':
          this.showNotification(hook.message || 'Hook执行', context);
          break;

        case 'log':
          this.writeLog(hook.file || 'hooks.log', context);
          break;

        case 'http':
          await this.sendHttpRequest(hook.url!, context);
          break;

        default:
          console.warn(chalk.yellow(`⚠️  未知的Hook类型: ${hook.type}`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Hook执行失败: ${error instanceof Error ? error.message : '未知错误'}`));
    }
  }

  /**
   * 执行命令
   */
  private async executeCommand(command: string, context: HookContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        cwd: this.workspacePath,
        env: {
          ...process.env,
          AICLI_HOOK_TYPE: context.type,
          AICLI_SESSION_ID: context.sessionId || '',
          AICLI_TIMESTAMP: context.timestamp.toISOString()
        }
      });

      // 将上下文作为JSON发送到stdin
      child.stdin.write(JSON.stringify(context));
      child.stdin.end();

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`命令退出码: ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * 执行脚本
   */
  private async executeScript(scriptPath: string, context: HookContext): Promise<void> {
    // 解析路径
    let fullPath = scriptPath.startsWith('~')
      ? scriptPath.replace('~', process.env.HOME || '')
      : scriptPath;

    if (!path.isAbsolute(fullPath)) {
      fullPath = path.resolve(this.workspacePath, fullPath);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`脚本不存在: ${fullPath}`);
    }

    return this.executeCommand(fullPath, context);
  }

  /**
   * 显示通知
   */
  private showNotification(message: string, context: HookContext): void {
    // macOS通知
    if (process.platform === 'darwin') {
      const title = 'AICLI Hook';
      const subtitle = context.type;
      
      spawn('osascript', [
        '-e',
        `display notification "${message}" with title "${title}" subtitle "${subtitle}"`
      ]);
    } else {
      // 控制台通知
      console.log(chalk.cyan(`\n🔔 ${message}\n`));
    }
  }

  /**
   * 写入日志
   */
  private writeLog(logFile: string, context: HookContext): void {
    try {
      let fullPath = logFile.startsWith('~')
        ? logFile.replace('~', process.env.HOME || '')
        : logFile;

      if (!path.isAbsolute(fullPath)) {
        fullPath = path.resolve(this.workspacePath, fullPath);
      }

      const logEntry = `[${context.timestamp.toISOString()}] ${context.type}: ${JSON.stringify(context)}\n`;
      
      fs.appendFileSync(fullPath, logEntry);
    } catch (error) {
      console.error(chalk.red(`❌ 写入日志失败: ${error instanceof Error ? error.message : '未知错误'}`));
    }
  }

  /**
   * 发送HTTP请求
   */
  private async sendHttpRequest(url: string, context: HookContext): Promise<void> {
    try {
      const https = require('https');
      const http = require('http');
      
      const protocol = url.startsWith('https') ? https : http;
      const data = JSON.stringify(context);

      return new Promise((resolve, reject) => {
        const req = protocol.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
          }
        }, (res: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });
    } catch (error) {
      throw new Error(`HTTP请求失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 启用Hooks
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * 禁用Hooks
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * 检查是否已启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 获取已配置的Hooks
   */
  getConfiguredHooks(): { [key in HookType]?: number } {
    const result: { [key in HookType]?: number } = {};
    
    if (this.settings.hooks) {
      for (const [type, hooks] of Object.entries(this.settings.hooks)) {
        result[type as HookType] = hooks.length;
      }
    }

    return result;
  }

  /**
   * 显示Hooks状态
   */
  showStatus(): void {
    console.log(chalk.bold('\n🪝 Hooks系统状态\n'));
    
    console.log(chalk.cyan('状态:'));
    console.log(chalk.gray(`  ${this.enabled ? '✓ 已启用' : '✗ 已禁用'}\n`));

    const configured = this.getConfiguredHooks();
    const hookTypes = Object.keys(configured) as HookType[];

    if (hookTypes.length === 0) {
      console.log(chalk.yellow('  没有配置Hooks\n'));
      console.log(chalk.gray('  配置文件位置:'));
      console.log(chalk.gray(`    ~/.aicli/settings.json`));
      console.log(chalk.gray(`    ${this.workspacePath}/.aicli/settings.json\n`));
      return;
    }

    console.log(chalk.cyan('已配置的Hooks:'));
    hookTypes.forEach(type => {
      const count = configured[type] || 0;
      console.log(chalk.gray(`  ${type}: ${count}个`));
    });
    console.log();
  }

  /**
   * 创建示例配置
   */
  createExampleConfig(): string {
    return `{
  "hooks": {
    "afterCommand": [
      {
        "type": "notification",
        "message": "命令执行完成",
        "enabled": true
      }
    ],
    "onError": [
      {
        "type": "log",
        "file": "~/.aicli/error.log",
        "enabled": true
      }
    ],
    "beforeAIRequest": [
      {
        "type": "log",
        "file": "./ai-requests.log",
        "enabled": true
      }
    ],
    "afterAIResponse": [
      {
        "type": "script",
        "script": "~/scripts/process-response.sh",
        "enabled": false
      }
    ]
  }
}`;
  }
}

