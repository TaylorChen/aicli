import { EventEmitter } from 'events';
import { smartConfig } from './smart-config';
import { AI_PROVIDERS, getProviderByName } from '../config/providers';

export interface AIServiceConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    thinking?: string;
    toolCalls?: any[];
  };
}

export interface AIResponse {
  id: string;
  content: string;
  role: 'assistant';
  timestamp: Date;
  metadata: {
    model: string;
    provider: string;
    tokens?: number;
    timing?: number;
    usage?: any;
  };
  isComplete: boolean;
}

export interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_call' | 'error';
  content: string;
  metadata?: any;
}

export interface StreamResponse {
  id: string;
  chunks: StreamChunk[];
  isComplete: boolean;
  metadata?: {
    model?: string;
    provider?: string;
    usage?: any;
    timing?: number;
  };
}

export class EnhancedAIService extends EventEmitter {
  private config: AIServiceConfig;
  private isStreaming: boolean = false;

  constructor(config?: Partial<AIServiceConfig>) {
    super();
    this.config = this.loadConfig(config);
  }

  private loadConfig(userConfig?: Partial<AIServiceConfig>): AIServiceConfig {
    const providerName = userConfig?.provider || smartConfig.getWithDefault('currentProvider', 'deepseek');
    const provider = getProviderByName(providerName);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const providerConfig = smartConfig.get(`providers.${providerName}`) || {};

    return {
      provider: providerName,
      model: userConfig?.model || smartConfig.getWithDefault('currentModel', provider.defaultModel),
      apiKey: providerConfig.apiKey || process.env[provider.apiKeyEnvVar],
      baseUrl: provider.baseUrl,
      temperature: smartConfig.getWithDefault('ai.temperature', 0.7),
      maxTokens: smartConfig.getWithDefault('ai.maxTokens', 4000),
      systemPrompt: userConfig?.systemPrompt || smartConfig.getWithDefault('ai.systemPrompt',
        '你是一个AI编程助手，可以帮助用户解决编程问题、解释代码、优化算法等。')
    };
  }

  async sendMessage(messages: ChatMessage[], options?: {
    stream?: boolean;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse | StreamResponse> {
    const stream = options?.stream ?? false;

    if (stream) {
      return this.sendStreamMessage(messages, options);
    } else {
      return this.sendSingleMessage(messages, options);
    }
  }

  private async sendSingleMessage(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse> {
    const temperature = options?.temperature ?? this.config.temperature;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;

    try {
      // 模拟AI响应 - 在实际实现中这里会调用真实的API
      const lastMessage = messages[messages.length - 1];
      const responseContent = await this.generateResponse(lastMessage.content, messages);

      const response: AIResponse = {
        id: this.generateId(),
        content: responseContent,
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          model: this.config.model,
          provider: this.config.provider,
          tokens: this.estimateTokens(responseContent),
          timing: Date.now()
        },
        isComplete: true
      };

      this.emit('response', response);
      return response;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async sendStreamMessage(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<StreamResponse> {
    if (this.isStreaming) {
      throw new Error('Already streaming a response');
    }

    this.isStreaming = true;
    const responseId = this.generateId();
    const chunks: StreamChunk[] = [];

    try {
      const lastMessage = messages[messages.length - 1];
      const fullResponse = await this.generateResponse(lastMessage.content, messages);

      // 模拟流式响应
      const words = fullResponse.split(' ');
      let currentContent = '';

      for (const word of words) {
        if (!this.isStreaming) break;

        currentContent += word + ' ';

        const chunk: StreamChunk = {
          type: 'text',
          content: word + ' ',
          metadata: { timestamp: Date.now() }
        };

        chunks.push(chunk);
        this.emit('chunk', { responseId, chunk });

        // 添加小延迟以模拟流式效果
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const response: StreamResponse = {
        id: responseId,
        chunks,
        isComplete: true,
        metadata: {
          model: this.config.model,
          provider: this.config.provider,
          timing: Date.now()
        }
      };

      this.emit('streamComplete', response);
      return response;
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isStreaming = false;
    }
  }

  private async generateResponse(content: string, context: ChatMessage[]): Promise<string> {
    // 模拟AI响应生成 - 在实际实现中这里会调用真实的AI API
    const projectContext = this.getProjectContext();
    const systemPrompt = this.config.systemPrompt || '';

    // 简单的响应生成逻辑
    if (content.includes('代码') || content.includes('code')) {
      return `我看到你提到了代码相关的问题。让我帮你分析一下：

\`\`\`javascript
// 示例代码
function example() {
  console.log('Hello, World!');
}
\`\`\`

这是一个简单的示例代码。${projectContext ? '基于你的项目上下文，' : ''}我建议：

1. 理解代码的功能和目的
2. 检查是否有潜在的问题
3. 考虑性能优化可能性
4. 确保代码符合最佳实践

有什么具体的问题需要我帮助解决吗？`;
    }

    if (content.includes('项目') || content.includes('project')) {
      return `关于项目方面的问题，我注意到${projectContext || '当前目录'}。

我可以帮助你：
- 分析项目结构和依赖
- 优化构建配置
- 代码重构建议
- 性能优化
- 添加新功能

请告诉我具体需要什么帮助？`;
    }

    return `我收到了你的消息："${content}"。

${systemPrompt}

${projectContext ? `当前项目上下文：${projectContext}` : ''}

作为一个AI编程助手，我可以帮助你：
- 编写和调试代码
- 解释代码逻辑
- 优化算法性能
- 项目架构建议
- 代码审查和重构

请告诉我你需要什么帮助？`;
  }

  private getProjectContext(): string {
    const cwd = process.cwd();
    // 这里可以添加项目检测逻辑
    return `工作目录：${cwd}`;
  }

  private generateId(): string {
    return `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateTokens(text: string): number {
    // 简单的token估算
    return Math.ceil(text.length / 4);
  }

  // 更新配置
  updateConfig(newConfig: Partial<AIServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  // 获取当前配置
  getConfig(): AIServiceConfig {
    return { ...this.config };
  }

  // 获取可用的模型列表
  getAvailableModels(): string[] {
    const provider = getProviderByName(this.config.provider);
    return provider?.models || [];
  }

  // 切换提供商
  async switchProvider(providerName: string, model?: string): Promise<void> {
    const provider = getProviderByName(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const providerConfig = smartConfig.get(`providers.${providerName}`) || {};
    const apiKey = providerConfig.apiKey || process.env[provider.apiKeyEnvVar];

    if (!apiKey) {
      throw new Error(`API key not found for provider ${providerName}. Please set ${provider.apiKeyEnvVar} environment variable.`);
    }

    const selectedModel = model || provider.defaultModel;
    if (!provider.models.includes(selectedModel)) {
      throw new Error(`Model ${selectedModel} not available for provider ${providerName}`);
    }

    this.config.provider = providerName;
    this.config.model = selectedModel;
    this.config.apiKey = apiKey;
    this.config.baseUrl = provider.baseUrl;

    smartConfig.set('currentProvider', providerName);
    smartConfig.set('currentModel', selectedModel);
    await smartConfig.save();

    this.emit('providerChanged', { provider: providerName, model: selectedModel });
  }

  // 获取提供商信息
  getProviderInfo(): Array<{
    name: string;
    models: string[];
    configured: boolean;
    current: boolean;
  }> {
    return AI_PROVIDERS.map(provider => {
      const providerConfig = smartConfig.get(`providers.${provider.name}`) || {};
      const apiKey = providerConfig.apiKey || process.env[provider.apiKeyEnvVar];

      return {
        name: provider.name,
        models: provider.models,
        configured: !!apiKey,
        current: provider.name === this.config.provider
      };
    });
  }

  // 健康检查
  async healthCheck(): Promise<{
    status: 'healthy' | 'error';
    provider: string;
    model: string;
    message?: string;
  }> {
    try {
      // 检查API密钥
      if (!this.config.apiKey) {
        return {
          status: 'error',
          provider: this.config.provider,
          model: this.config.model,
          message: 'API key not configured'
        };
      }

      // 模拟API连接检查
      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        status: 'healthy',
        provider: this.config.provider,
        model: this.config.model
      };
    } catch (error) {
      return {
        status: 'error',
        provider: this.config.provider,
        model: this.config.model,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 取消流式响应
  cancelStream(): void {
    this.isStreaming = false;
    this.emit('streamCancelled');
  }
}

// 导出单例实例
export const enhancedAIService = new EnhancedAIService();