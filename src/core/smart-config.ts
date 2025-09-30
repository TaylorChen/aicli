import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { config } from '../config';

export interface ConfigSource {
  name: string;
  priority: number;
  load(): Promise<Record<string, any>>;
}

export interface ConfigOptions {
  projectPath?: string;
  userProfile?: string;
  environment?: Record<string, string>;
}

export class SmartConfig extends EventEmitter {
  private sources: ConfigSource[] = [];
  private cache: Map<string, any> = new Map();
  private configPath: string;
  private projectConfigPath: string;

  constructor(options: ConfigOptions = {}) {
    super();
    this.configPath = path.join(os.homedir(), '.aicli', 'config.json');
    this.projectConfigPath = options.projectPath
      ? path.join(options.projectPath, '.aicli.json')
      : path.join(process.cwd(), '.aicli.json');

    this.initializeSources(options);
  }

  private initializeSources(options: ConfigOptions): void {
    // 配置源按优先级排序（数字越小优先级越高）
    this.sources = [
      {
        name: 'environment',
        priority: 1,
        load: async () => this.loadEnvironmentConfig(options.environment || process.env)
      },
      {
        name: 'project',
        priority: 2,
        load: async () => this.loadProjectConfig()
      },
      {
        name: 'user',
        priority: 3,
        load: async () => this.loadUserConfig()
      },
      {
        name: 'defaults',
        priority: 4,
        load: async () => this.getDefaultConfig()
      }
    ];
  }

  async load(): Promise<void> {
    for (const source of this.sources) {
      try {
        const config = await source.load();
        this.mergeConfig(config);
      } catch (error) {
        console.warn(`Failed to load config from ${source.name}:`, error);
      }
    }
  }

  private async loadEnvironmentConfig(env: NodeJS.ProcessEnv): Promise<Record<string, any>> {
    const config: Record<string, any> = {};

    // AI提供商配置
    if (env.AICLI_PROVIDER) {
      config.currentProvider = env.AICLI_PROVIDER;
    }

    if (env.AICLI_MODEL) {
      config.currentModel = env.AICLI_MODEL;
    }

    // API密钥
    if (env.OPENAI_API_KEY) {
      config.providers = config.providers || {};
      config.providers.openai = config.providers.openai || {};
      config.providers.openai.apiKey = env.OPENAI_API_KEY;
    }

    if (env.DEEPSEEK_API_KEY) {
      config.providers = config.providers || {};
      config.providers.deepseek = config.providers.deepseek || {};
      config.providers.deepseek.apiKey = env.DEEPSEEK_API_KEY;
    }

    if (env.ANTHROPIC_API_KEY) {
      config.providers = config.providers || {};
      config.providers.claude = config.providers.claude || {};
      config.providers.claude.apiKey = env.ANTHROPIC_API_KEY;
    }

    if (env.MOONSHOT_API_KEY) {
      config.providers = config.providers || {};
      config.providers.kimi = config.providers.kimi || {};
      config.providers.kimi.apiKey = env.MOONSHOT_API_KEY;
    }

    if (env.GOOGLE_API_KEY) {
      config.providers = config.providers || {};
      config.providers.gemini = config.providers.gemini || {};
      config.providers.gemini.apiKey = env.GOOGLE_API_KEY;
    }

    if (env.GROK_API_KEY) {
      config.providers = config.providers || {};
      config.providers.grok = config.providers.grok || {};
      config.providers.grok.apiKey = env.GROK_API_KEY;
    }

    // 行为配置
    if (env.AICLI_THEME) {
      config.ui = config.ui || {};
      config.ui.theme = env.AICLI_THEME;
    }

    if (env.AICLI_VERBOSE) {
      config.verbose = env.AICLI_VERBOSE.toLowerCase() === 'true';
    }

    return config;
  }

  private async loadProjectConfig(): Promise<Record<string, any>> {
    if (!fs.existsSync(this.projectConfigPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.projectConfigPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to parse project config: ${error}`);
      return {};
    }
  }

  private async loadUserConfig(): Promise<Record<string, any>> {
    if (!fs.existsSync(this.configPath)) {
      await this.createDefaultUserConfig();
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to parse user config: ${error}`);
      return {};
    }
  }

  private async createDefaultUserConfig(): Promise<void> {
    const defaultConfig = this.getDefaultConfig();
    const configDir = path.dirname(this.configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
  }

  private getDefaultConfig(): Record<string, any> {
    return {
      currentProvider: 'deepseek',
      currentModel: 'deepseek-coder',
      providers: {
        deepseek: {
          name: 'DeepSeek',
          models: ['deepseek-coder', 'deepseek-chat'],
          baseUrl: 'https://api.deepseek.com',
          apiKeyEnvVar: 'DEEPSEEK_API_KEY'
        },
        openai: {
          name: 'OpenAI',
          models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          baseUrl: 'https://api.openai.com',
          apiKeyEnvVar: 'OPENAI_API_KEY'
        },
        claude: {
          name: 'Claude',
          models: ['claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
          baseUrl: 'https://api.anthropic.com',
          apiKeyEnvVar: 'ANTHROPIC_API_KEY'
        },
        kimi: {
          name: 'Kimi',
          models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
          baseUrl: 'https://api.moonshot.cn',
          apiKeyEnvVar: 'MOONSHOT_API_KEY'
        },
        gemini: {
          name: 'Gemini',
          models: ['gemini-pro', 'gemini-pro-vision'],
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKeyEnvVar: 'GOOGLE_API_KEY'
        },
        grok: {
          name: 'Grok',
          models: ['grok-beta'],
          baseUrl: 'https://api.x.ai',
          apiKeyEnvVar: 'GROK_API_KEY'
        }
      },
      ui: {
        theme: 'auto',
        colors: true,
        emoji: true,
        syntaxHighlighting: true,
        maxOutputLines: 1000
      },
      behavior: {
        autoSave: true,
        historySize: 1000,
        confirmBeforeExit: false,
        smartSuggestions: true,
        autoDetectProject: true
      },
      performance: {
        cacheEnabled: true,
        cacheSize: 100,
        streamingEnabled: true,
        parallelProcessing: false
      },
      features: {
        codeAnalysis: true,
        fileOperations: true,
        webSearch: false,
        imageProcessing: true
      }
    };
  }

  private mergeConfig(newConfig: Record<string, any>): void {
    // 深度合并配置
    const deepMerge = (target: any, source: any) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };

    deepMerge(this.cache, newConfig);
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  getWithDefault<T>(key: string, defaultValue: T): T {
    return this.cache.get(key) ?? defaultValue;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  getAll(): Record<string, any> {
    return Object.fromEntries(this.cache);
  }

  async save(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const userConfig = this.extractUserConfig();
      fs.writeFileSync(this.configPath, JSON.stringify(userConfig, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  private extractUserConfig(): Record<string, any> {
    // 只保存用户级别的配置，不包括环境变量和项目配置
    const userConfig: Record<string, any> = {};
    const excludeKeys = ['environment', 'project'];

    for (const [key, value] of this.cache) {
      if (!excludeKeys.includes(key)) {
        userConfig[key] = value;
      }
    }

    return userConfig;
  }

  // 智能默认值解析
  resolveWithDefaults(key: string): any {
    const value = this.get(key);

    if (value !== undefined) {
      return value;
    }

    // 根据key返回智能默认值
    switch (key) {
      case 'ui.theme':
        return this.detectTerminalTheme();
      case 'currentModel':
        return this.detectBestModel();
      case 'ui.maxOutputLines':
        return this.detectTerminalHeight() - 5;
      default:
        return undefined;
    }
  }

  private detectTerminalTheme(): string {
    // 检测终端主题偏好
    if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
      return 'light';
    }

    // 简单的深色模式检测
    if (process.env.COLORFGBG && process.env.COLORFGBG.startsWith('0;')) {
      return 'dark';
    }

    return 'auto';
  }

  private detectBestModel(): string {
    // 根据项目类型和内容选择最佳模型
    const currentProvider = this.get('currentProvider') || 'deepseek';
    const providers = this.get('providers') || {};

    if (providers[currentProvider] && providers[currentProvider].models) {
      return providers[currentProvider].models[0];
    }

    return 'deepseek-chat';
  }

  private detectTerminalHeight(): number {
    return process.stdout.rows || 24;
  }

  // 获取项目特定配置
  getProjectConfig(): Record<string, any> {
    if (fs.existsSync(this.projectConfigPath)) {
      try {
        const content = fs.readFileSync(this.projectConfigPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to parse project config: ${error}`);
      }
    }
    return {};
  }

  // 创建项目配置
  async createProjectConfig(projectConfig: Record<string, any>): Promise<void> {
    try {
      const existingConfig = this.getProjectConfig();
      const mergedConfig = { ...existingConfig, ...projectConfig };

      fs.writeFileSync(this.projectConfigPath, JSON.stringify(mergedConfig, null, 2));
      console.log(`Project config created at: ${this.projectConfigPath}`);
    } catch (error) {
      console.error('Failed to create project config:', error);
    }
  }

  // 重置配置
  async reset(): Promise<void> {
    this.cache.clear();
    await this.load();
  }

  // 验证配置
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证必需的配置项
    if (!this.get('currentProvider')) {
      errors.push('Current provider is not set');
    }

    if (!this.get('currentModel')) {
      errors.push('Current model is not set');
    }

    // 验证提供商配置
    const providers = this.get('providers') || {};
    const currentProvider = this.get('currentProvider');

    if (currentProvider && !providers[currentProvider]) {
      errors.push(`Provider '${currentProvider}' is not configured`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 导出单例实例
export const smartConfig = new SmartConfig();