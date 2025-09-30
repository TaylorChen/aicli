import axios from 'axios';
import { AIProvider, ChatMessage, FileAttachment } from '../types';
import { config } from '../config';
import { FileProcessor } from '../core/file-processor';

interface AIResponse {
  content: string;
  tokens?: number;
  model: string;
  attachmentsInfo?: string;
}

export class AIService {
  private provider: AIProvider;
  private apiKey: string;

  constructor(provider: AIProvider, apiKey: string) {
    this.provider = provider;
    this.apiKey = apiKey;
  }

  async sendMessage(messages: ChatMessage[], model?: string): Promise<AIResponse> {
    const selectedModel = model || this.provider.defaultModel;

    // 处理附件信息
    const attachmentsInfo = this.extractAttachmentsInfo(messages);

    switch (this.provider.name) {
      case 'claude':
        return this.sendClaudeMessage(messages, selectedModel, attachmentsInfo);
      case 'deepseek':
      case 'kimi':
      case 'openai':
        return this.sendOpenAIMessage(messages, selectedModel, attachmentsInfo);
      case 'gemini':
        return this.sendGeminiMessage(messages, selectedModel, attachmentsInfo);
      case 'grok':
        return this.sendGrokMessage(messages, selectedModel, attachmentsInfo);
      default:
        throw new Error(`Unsupported provider: ${this.provider.name}`);
    }
  }

  private extractAttachmentsInfo(messages: ChatMessage[]): string {
    const allAttachments: FileAttachment[] = [];

    messages.forEach(msg => {
      if (msg.attachments) {
        allAttachments.push(...msg.attachments);
      }
    });

    if (allAttachments.length === 0) {
      return '';
    }

    let info = `\n\n📎 附件信息 (${allAttachments.length} 个文件):\n`;
    allAttachments.forEach((attachment, index) => {
      info += `${index + 1}. ${FileProcessor.formatFileInfo(attachment)}\n`;

      if (attachment.type === 'file') {
        const preview = FileProcessor.getFilePreview(attachment.content, 200);
        info += `   内容预览: ${preview}\n`;
      } else if (attachment.type === 'image') {
        info += `   图片格式: ${attachment.mimeType}\n`;
        info += `   图片大小: ${(attachment.size! / 1024).toFixed(1)}KB\n`;
      }
    });

    return info;
  }

  private async sendClaudeMessage(messages: ChatMessage[], model: string, attachmentsInfo: string): Promise<AIResponse> {
    try {
      // 在演示版本中，我们只返回模拟响应
      return {
        content: `我收到了你的消息${attachmentsInfo ? '和附件' : ''}。

${attachmentsInfo}

这是一个演示版本，实际的 Claude API 集成需要配置有效的 API Key。

如果你配置了有效的 API Key，我将能够：
• 理解文件内容并回答相关问题
• 分析图片并提供描述
• 基于文件内容提供建议和修改

当前配置的提供商: ${this.provider.name}
当前模型: ${model}`,
        tokens: 100,
        model,
        attachmentsInfo
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Claude API Error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private async sendOpenAIMessage(messages: ChatMessage[], model: string, attachmentsInfo: string): Promise<AIResponse> {
    try {
      const response = await axios.post(
        `${this.provider.baseUrl}/v1/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: 4096,
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        content: response.data.choices[0].message.content,
        tokens: response.data.usage?.total_tokens,
        model
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`${this.provider.name} API Error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private async sendGeminiMessage(messages: ChatMessage[], model: string, attachmentsInfo: string): Promise<AIResponse> {
    try {
      const lastMessage = messages[messages.length - 1];
      const response = await axios.post(
        `${this.provider.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          contents: [{
            parts: [{ text: lastMessage.content }]
          }]
        }
      );

      return {
        content: response.data.candidates[0].content.parts[0].text,
        model
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Gemini API Error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private async sendGrokMessage(messages: ChatMessage[], model: string, attachmentsInfo: string): Promise<AIResponse> {
    try {
      const response = await axios.post(
        `${this.provider.baseUrl}/v1/chat/completions`,
        {
          model: model,
          messages: messages,
          max_tokens: 4096,
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        content: response.data.choices[0].message.content,
        tokens: response.data.usage?.total_tokens,
        model
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Grok API Error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
}

export const createAIService = () => {
  const provider = config.getCurrentProvider();
  if (!provider) {
    throw new Error('No provider configured');
  }

  const apiKey = config.getApiKey(provider.name);
  if (!apiKey) {
    throw new Error(`API key not found for provider ${provider.name}`);
  }

  return new AIService(provider, apiKey);
};