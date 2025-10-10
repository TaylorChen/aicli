import { EventEmitter } from 'events';
import axios from 'axios';

export interface SimpleAIConfig {
  provider: 'deepseek' | 'openai' | 'claude';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SimpleAIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * 简化的AI服务集成
 * 专注于基本的聊天功能
 */
export class SimpleAIIntegration extends EventEmitter {
  private config: SimpleAIConfig | null = null;

  constructor() {
    super();
  }

  /**
   * 配置AI服务
   */
  public configure(config: SimpleAIConfig): void {
    this.config = config;
    this.emit('configured', config);
  }

  /**
   * 发送消息并获取回复
   */
  public async sendMessage(message: string, options: {
    messages?: SimpleMessage[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<SimpleAIResponse> {
    if (!this.config) {
      throw new Error('AI服务未配置，请先调用 configure()');
    }

    try {
      const messages: SimpleMessage[] = [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        ...(options.messages || []),
        { role: 'user' as const, content: message }
      ];

      let response: SimpleAIResponse;

      switch (this.config.provider) {
        case 'deepseek':
          response = await this.callDeepSeek(messages, options);
          break;
        case 'openai':
          response = await this.callOpenAI(messages, options);
          break;
        case 'claude':
          response = await this.callClaude(messages, options);
          break;
        default:
          throw new Error(`不支持的AI提供商: ${this.config.provider}`);
      }

      this.emit('response', response);
      return response;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async callDeepSeek(messages: SimpleMessage[], options: any): Promise<SimpleAIResponse> {
    const baseUrl = this.config?.baseUrl || 'https://api.deepseek.com';
    const url = `${baseUrl}/chat/completions`;

    const response = await axios.post(url, {
      model: this.config?.model || 'deepseek-chat',
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${this.config?.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const choice = response.data.choices[0];
    return {
      content: choice.message.content,
      model: response.data.model,
      provider: 'deepseek',
      usage: response.data.usage
    };
  }

  private async callOpenAI(messages: SimpleMessage[], options: any): Promise<SimpleAIResponse> {
    const baseUrl = this.config?.baseUrl || 'https://api.openai.com';
    const url = `${baseUrl}/v1/chat/completions`;

    const response = await axios.post(url, {
      model: this.config?.model || 'gpt-3.5-turbo',
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${this.config?.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const choice = response.data.choices[0];
    return {
      content: choice.message.content,
      model: response.data.model,
      provider: 'openai',
      usage: response.data.usage
    };
  }

  private async callClaude(messages: SimpleMessage[], options: any): Promise<SimpleAIResponse> {
    const baseUrl = this.config?.baseUrl || 'https://api.anthropic.com';
    const url = `${baseUrl}/v1/messages`;

    // 转换消息格式为Claude格式
    const claudeMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

    const systemMessage = messages.find(msg => msg.role === 'system');

    const response = await axios.post(url, {
      model: this.config?.model || 'claude-3-sonnet-20240229',
      messages: claudeMessages,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      system: systemMessage?.content
    }, {
      headers: {
        'x-api-key': this.config?.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      }
    });

    return {
      content: response.data.content[0].text,
      model: response.data.model,
      provider: 'claude',
      usage: response.data.usage
    };
  }

  /**
   * 获取当前配置
   */
  public getConfig(): SimpleAIConfig | null {
    return this.config;
  }

  /**
   * 检查是否已配置
   */
  public isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * 测试连接
   */
  public async testConnection(): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    try {
      await this.sendMessage('你好，请简单回复', { maxTokens: 50 });
      return true;
    } catch (error) {
      return false;
    }
  }
}