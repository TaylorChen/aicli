/**
 * 零配置管理系统
 * 智能检测和默认配置，实现开箱即用
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

export interface ZeroConfigOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeout?: number;
  verbose?: boolean;
}

export interface ResolvedConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
  timeout: number;
  configSource: 'env' | 'file' | 'auto' | 'default';
  warnings: string[];
}

export class ZeroConfig {
  private static CONFIG_DIR = path.join(os.homedir(), '.config', 'aicli');
  private static CONFIG_FILE = path.join(ZeroConfig.CONFIG_DIR, 'config.json');

  /**
   * 智能解析配置
   * 优先级：命令行参数 > 环境变量 > 配置文件 > 自动检测 > 默认值
   */
  public static resolve(options: ZeroConfigOptions = {}): ResolvedConfig {
    const warnings: string[] = [];
    
    // 1. 检测提供商和API密钥
    const { provider, apiKey, source } = this.detectProviderAndKey(options);
    
    // 2. 确定模型
    const model = this.resolveModel(provider, options.model);
    
    // 3. 确定Base URL
    const baseUrl = this.resolveBaseUrl(provider, options.baseUrl);
    
    // 4. 其他配置使用默认值
    const config: ResolvedConfig = {
      provider,
      model,
      apiKey,
      baseUrl,
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? 60000,
      configSource: source,
      warnings,
    };

    // 5. 验证配置
    this.validateConfig(config, warnings);

    return config;
  }

  /**
   * 检测提供商和API密钥
   */
  private static detectProviderAndKey(
    options: ZeroConfigOptions
  ): { provider: string; apiKey: string; source: 'env' | 'file' | 'auto' | 'default' } {
    // 1. 命令行参数优先
    if (options.provider && options.apiKey) {
      return {
        provider: options.provider,
        apiKey: options.apiKey,
        source: 'env',
      };
    }

    // 2. 检查环境变量
    const envDetection = this.detectFromEnvironment();
    if (envDetection) {
      return envDetection;
    }

    // 3. 检查配置文件
    const fileDetection = this.detectFromConfigFile();
    if (fileDetection) {
      return fileDetection;
    }

    // 4. 使用默认值
    return {
      provider: options.provider || 'deepseek',
      apiKey: options.apiKey || '',
      source: 'default',
    };
  }

  /**
   * 从环境变量检测
   */
  private static detectFromEnvironment(): { provider: string; apiKey: string; source: 'env' } | null {
    const envMap = [
      { provider: 'deepseek', key: process.env.DEEPSEEK_API_KEY },
      { provider: 'openai', key: process.env.OPENAI_API_KEY },
      { provider: 'claude', key: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY },
      { provider: 'gemini', key: process.env.GOOGLE_API_KEY },
      { provider: 'kimi', key: process.env.MOONSHOT_API_KEY },
    ];

    for (const { provider, key } of envMap) {
      if (key) {
        return { provider, apiKey: key, source: 'env' };
      }
    }

    return null;
  }

  /**
   * 从配置文件检测
   */
  private static detectFromConfigFile(): { provider: string; apiKey: string; source: 'file' } | null {
    try {
      if (!fs.existsSync(this.CONFIG_FILE)) {
        return null;
      }

      const content = fs.readFileSync(this.CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content);

      if (config.provider && config.apiKey) {
        return {
          provider: config.provider,
          apiKey: config.apiKey,
          source: 'file',
        };
      }
    } catch (error) {
      // 配置文件读取失败，忽略
    }

    return null;
  }

  /**
   * 解析模型名称
   */
  private static resolveModel(provider: string, model?: string): string {
    if (model) {
      return model;
    }

    // 默认模型映射
    const defaultModels: Record<string, string> = {
      deepseek: 'deepseek-chat',
      openai: 'gpt-4-turbo-preview',
      claude: 'claude-3-sonnet-20240229',
      gemini: 'gemini-pro',
      kimi: 'moonshot-v1-8k',
    };

    return defaultModels[provider] || 'default';
  }

  /**
   * 解析Base URL
   */
  private static resolveBaseUrl(provider: string, baseUrl?: string): string {
    if (baseUrl) {
      return baseUrl;
    }

    // 默认Base URL映射
    const defaultBaseUrls: Record<string, string> = {
      deepseek: 'https://api.deepseek.com',
      openai: 'https://api.openai.com/v1',
      claude: 'https://api.anthropic.com',
      gemini: 'https://generativelanguage.googleapis.com',
      kimi: 'https://api.moonshot.cn/v1',
    };

    return defaultBaseUrls[provider] || '';
  }

  /**
   * 验证配置
   */
  private static validateConfig(config: ResolvedConfig, warnings: string[]): void {
    // 检查API密钥
    if (!config.apiKey) {
      warnings.push(
        `No API key found for ${config.provider}. ` +
        `Set ${this.getEnvKeyName(config.provider)} environment variable.`
      );
    }

    // 检查Base URL
    if (!config.baseUrl) {
      warnings.push(`No base URL configured for ${config.provider}.`);
    }
  }

  /**
   * 获取环境变量名称
   */
  private static getEnvKeyName(provider: string): string {
    const envNames: Record<string, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      openai: 'OPENAI_API_KEY',
      claude: 'CLAUDE_API_KEY',
      gemini: 'GOOGLE_API_KEY',
      kimi: 'MOONSHOT_API_KEY',
    };

    return envNames[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * 显示配置信息
   */
  public static display(config: ResolvedConfig, verbose: boolean = false): void {
    console.log(chalk.cyan('\nConfiguration:'));
    console.log(chalk.gray('  Provider:   ') + chalk.white(config.provider));
    console.log(chalk.gray('  Model:      ') + chalk.white(config.model));
    console.log(chalk.gray('  API Key:    ') + (config.apiKey ? chalk.green('✓ Set') : chalk.red('✗ Not set')));
    console.log(chalk.gray('  Base URL:   ') + chalk.white(config.baseUrl));
    console.log(chalk.gray('  Source:     ') + chalk.white(config.configSource));

    if (verbose) {
      console.log(chalk.gray('  Max Retries:') + chalk.white(config.maxRetries.toString()));
      console.log(chalk.gray('  Timeout:    ') + chalk.white(`${config.timeout / 1000}s`));
    }

    // 显示警告
    if (config.warnings.length > 0) {
      console.log('');
      config.warnings.forEach(warning => {
        console.log(chalk.yellow('  ⚠ ' + warning));
      });
    }

    console.log('');
  }

  /**
   * 保存配置到文件
   */
  public static save(config: Partial<ZeroConfigOptions>): void {
    try {
      // 确保配置目录存在
      if (!fs.existsSync(this.CONFIG_DIR)) {
        fs.mkdirSync(this.CONFIG_DIR, { recursive: true });
      }

      // 读取现有配置
      let existing: any = {};
      if (fs.existsSync(this.CONFIG_FILE)) {
        const content = fs.readFileSync(this.CONFIG_FILE, 'utf-8');
        existing = JSON.parse(content);
      }

      // 合并配置
      const merged = { ...existing, ...config };

      // 写入配置
      fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
      
      console.log(chalk.green(`✓ Configuration saved to ${this.CONFIG_FILE}`));
    } catch (error) {
      console.error(chalk.red(`✗ Failed to save configuration: ${error}`));
    }
  }

  /**
   * 重置配置
   */
  public static reset(): void {
    try {
      if (fs.existsSync(this.CONFIG_FILE)) {
        fs.unlinkSync(this.CONFIG_FILE);
        console.log(chalk.green('✓ Configuration reset'));
      } else {
        console.log(chalk.gray('No configuration file to reset'));
      }
    } catch (error) {
      console.error(chalk.red(`✗ Failed to reset configuration: ${error}`));
    }
  }

  /**
   * 交互式配置向导
   */
  public static async wizard(): Promise<void> {
    console.log(chalk.cyan('\n🧙 Configuration Wizard\n'));
    console.log(chalk.gray('Let\'s set up your AICLI configuration.\n'));

    // 这里可以使用 inquirer 实现交互式配置
    // 简化版本，直接显示说明
    console.log(chalk.white('To configure AICLI, you can:'));
    console.log(chalk.gray('  1. Set environment variables:'));
    console.log(chalk.gray('     export DEEPSEEK_API_KEY=your_key'));
    console.log(chalk.gray('  2. Use command line options:'));
    console.log(chalk.gray('     aicli --api-key your_key --provider deepseek'));
    console.log(chalk.gray('  3. Edit configuration file:'));
    console.log(chalk.gray(`     ${this.CONFIG_FILE}`));
    console.log('');
  }

  /**
   * 自动修复常见配置问题
   */
  public static autoFix(config: ResolvedConfig): ResolvedConfig {
    const fixed = { ...config };

    // 修复缺失的Base URL
    if (!fixed.baseUrl) {
      fixed.baseUrl = this.resolveBaseUrl(fixed.provider);
    }

    // 修复缺失的模型
    if (!fixed.model || fixed.model === 'default') {
      fixed.model = this.resolveModel(fixed.provider);
    }

    return fixed;
  }

  /**
   * 健康检查
   */
  public static healthCheck(config: ResolvedConfig): {
    healthy: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 检查API密钥
    if (!config.apiKey) {
      issues.push('No API key configured');
      suggestions.push(`Set ${this.getEnvKeyName(config.provider)} environment variable`);
    }

    // 检查Base URL
    if (!config.baseUrl) {
      issues.push('No base URL configured');
      suggestions.push('Provider may not be supported or configured correctly');
    }

    // 检查超时设置
    if (config.timeout < 10000) {
      issues.push('Timeout too short (< 10s)');
      suggestions.push('Consider increasing timeout for better reliability');
    }

    return {
      healthy: issues.length === 0,
      issues,
      suggestions,
    };
  }
}

/**
 * 快速配置帮助
 */
export function quickConfigHelp(provider: string = 'deepseek'): void {
  console.log(chalk.cyan(`\n📖 Quick Configuration Guide for ${provider}\n`));
  
  const guides: Record<string, any> = {
    deepseek: {
      envVar: 'DEEPSEEK_API_KEY',
      getKeyUrl: 'https://platform.deepseek.com',
      example: 'export DEEPSEEK_API_KEY=sk-xxx',
    },
    openai: {
      envVar: 'OPENAI_API_KEY',
      getKeyUrl: 'https://platform.openai.com/api-keys',
      example: 'export OPENAI_API_KEY=sk-xxx',
    },
    claude: {
      envVar: 'CLAUDE_API_KEY',
      getKeyUrl: 'https://console.anthropic.com',
      example: 'export CLAUDE_API_KEY=sk-ant-xxx',
    },
  };

  const guide = guides[provider] || guides.deepseek;
  
  console.log(chalk.white('1. Get your API key:'));
  console.log(chalk.gray(`   Visit: ${guide.getKeyUrl}`));
  console.log('');
  console.log(chalk.white('2. Set environment variable:'));
  console.log(chalk.gray(`   ${guide.example}`));
  console.log('');
  console.log(chalk.white('3. Verify configuration:'));
  console.log(chalk.gray('   aicli "test message"'));
  console.log('');
}

