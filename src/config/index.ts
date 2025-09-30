import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AICLIConfig, AIProvider } from '../types';
import { AI_PROVIDERS, getProviderByName } from './providers';

const DEFAULT_CONFIG: AICLIConfig = {
  providers: AI_PROVIDERS,
  currentProvider: 'claude',
  currentModel: 'claude-3-sonnet-20240229',
  theme: 'dark',
  autoSave: true,
  sessionHistory: 100
};

const CONFIG_DIR = path.join(os.homedir(), '.aicli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class ConfigManager {
  private config: AICLIConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AICLIConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults');
    }

    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.warn('Failed to save config');
    }
  }

  get<K extends keyof AICLIConfig>(key: K): AICLIConfig[K] {
    return this.config[key];
  }

  set<K extends keyof AICLIConfig>(key: K, value: AICLIConfig[K]): void {
    this.config[key] = value;
    this.saveConfig();
  }

  getAll(): AICLIConfig {
    return { ...this.config };
  }

  getCurrentProvider(): AIProvider | undefined {
    const providerName = this.get('currentProvider');
    return getProviderByName(providerName);
  }

  setCurrentProvider(providerName: string): boolean {
    const provider = getProviderByName(providerName);
    if (provider) {
      this.set('currentProvider', providerName);
      this.set('currentModel', provider.defaultModel);
      return true;
    }
    return false;
  }

  getCurrentModel(): string {
    return this.get('currentModel');
  }

  setCurrentModel(modelName: string): boolean {
    const currentProvider = this.getCurrentProvider();
    if (currentProvider && currentProvider.models.includes(modelName)) {
      this.set('currentModel', modelName);
      return true;
    }
    return false;
  }

  getApiKey(providerName: string): string | undefined {
    const provider = getProviderByName(providerName);
    if (provider) {
      return process.env[provider.apiKeyEnvVar];
    }
    return undefined;
  }

  validateCurrentProvider(): { valid: boolean; message: string } {
    const provider = this.getCurrentProvider();
    if (!provider) {
      return { valid: false, message: `Provider not found` };
    }

    const apiKey = this.getApiKey(provider.name);
    if (!apiKey) {
      return {
        valid: false,
        message: `API key not found. Please set ${provider.apiKeyEnvVar} environment variable.`
      };
    }

    return { valid: true, message: 'Provider configuration is valid' };
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
  }
}

export const config = new ConfigManager();