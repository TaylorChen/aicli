import { AIModel, ChatMessage, FileAttachment, ManagedAttachment } from '../types';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface EnhancedAIRequest {
  messages: ChatMessage[];
  attachments?: FileAttachment[];
  model: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface EnhancedAIResponse {
  content: string;
  done: boolean;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface MultiModalContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export class EnhancedAIService {
  private model: AIModel;

  constructor(model: AIModel) {
    this.model = model;
  }

  async sendMessage(request: EnhancedAIRequest): Promise<EnhancedAIResponse> {
    try {
      const processedMessages = await this.processMessagesWithAttachments(request.messages, request.attachments || []);

      // 根据不同的 AI 提供商处理请求
      if (this.model.name.toLowerCase().includes('claude')) {
        return await this.sendToClaude(processedMessages, request);
      } else if (this.model.name.toLowerCase().includes('gpt') || this.model.name.toLowerCase().includes('openai')) {
        return await this.sendToOpenAI(processedMessages, request);
      } else if (this.model.name.toLowerCase().includes('gemini')) {
        return await this.sendToGemini(processedMessages, request);
      } else {
        // 默认处理，支持基础文本
        return await this.sendTextMessage(processedMessages, request);
      }
    } catch (error) {
      return {
        content: '',
        done: true,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  async sendStreamMessage(
    request: EnhancedAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<EnhancedAIResponse> {
    try {
      const processedMessages = await this.processMessagesWithAttachments(request.messages, request.attachments || []);

      if (this.model.name.toLowerCase().includes('claude')) {
        return await this.streamToClaude(processedMessages, request, onChunk);
      } else if (this.model.name.toLowerCase().includes('gpt') || this.model.name.toLowerCase().includes('openai')) {
        return await this.streamToOpenAI(processedMessages, request, onChunk);
      } else {
        // 对于不支持流式响应的模型，回退到普通响应
        const response = await this.sendMessage(request);
        onChunk(response.content);
        return response;
      }
    } catch (error) {
      return {
        content: '',
        done: true,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  private async processMessagesWithAttachments(
    messages: ChatMessage[],
    attachments: FileAttachment[]
  ): Promise<ChatMessage[]> {
    const processedMessages: ChatMessage[] = [];

    for (const message of messages) {
      // 如果是用户消息且包含附件，需要重新格式化
      if (message.role === 'user' && (message.attachments?.length || attachments?.length)) {
        const allAttachments = [
          ...(message.attachments || []),
          ...attachments
        ];

        const processedContent = await this.formatMessageWithAttachments(message.content, allAttachments);

        processedMessages.push({
          ...message,
          content: processedContent.text,
          attachments: allAttachments
        });
      } else {
        processedMessages.push(message);
      }
    }

    return processedMessages;
  }

  private async formatMessageWithAttachments(
    text: string,
    attachments: FileAttachment[]
  ): Promise<{ text: string; hasImages: boolean }> {
    let hasImages = false;
    let formattedText = text;

    // 为每个附件生成引用
    for (const attachment of attachments) {
      const reference = this.generateAttachmentReference(attachment);
      if (attachment.type === 'image') {
        hasImages = true;
        formattedText += `\n\n${reference}`;
      } else {
        formattedText += `\n\n${reference}`;
      }
    }

    return { text: formattedText, hasImages };
  }

  private generateAttachmentReference(attachment: FileAttachment): string {
    const icon = attachment.type === 'image' ? '🖼️' : '📄';
    const size = attachment.size ? this.formatFileSize(attachment.size) : '未知大小';

    let reference = `${icon} **附件: ${attachment.filename}** (${size})`;

    if (attachment.type === 'image') {
      reference += '\n[图片已包含在消息中]';
    } else {
      // 对于文本文件，显示内容预览
      if (typeof attachment.content === 'string' && attachment.content.length < 500) {
        reference += '\n```';
        reference += attachment.content;
        reference += '\n```';
      } else {
        reference += '\n[文件内容已包含在消息中]';
      }
    }

    return reference;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private async sendToClaude(messages: ChatMessage[], request: EnhancedAIRequest): Promise<EnhancedAIResponse> {
    try {
      const claudeMessages = await this.convertToClaudeFormat(messages);

      const requestBody = {
        model: this.model.model,
        messages: claudeMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
        stream: false
      };

      const response = await axios.post(
        `${this.model.baseUrl || 'https://api.anthropic.com'}/v1/messages`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.model.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 60000
        }
      );

      return {
        content: response.data.content[0]?.text || '',
        done: true,
        usage: response.data.usage ? {
          promptTokens: response.data.usage.input_tokens,
          completionTokens: response.data.usage.output_tokens,
          totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens
        } : undefined
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        return {
          content: '',
          done: true,
          error: `Claude API 错误: ${errorMsg}`
        };
      }
      throw error;
    }
  }

  private async streamToClaude(
    messages: ChatMessage[],
    request: EnhancedAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<EnhancedAIResponse> {
    try {
      const claudeMessages = await this.convertToClaudeFormat(messages);

      const requestBody = {
        model: this.model.model,
        messages: claudeMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
        stream: true
      };

      const response = await axios.post(
        `${this.model.baseUrl || 'https://api.anthropic.com'}/v1/messages`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.model.apiKey,
            'anthropic-version': '2023-06-01'
          },
          responseType: 'stream',
          timeout: 60000
        }
      );

      let fullContent = '';

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                resolve({
                  content: fullContent,
                  done: true
                });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  const text = parsed.delta.text;
                  fullContent += text;
                  onChunk(text);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        response.data.on('error', (error: Error) => {
          reject(error);
        });

        response.data.on('end', () => {
          resolve({
            content: fullContent,
            done: true
          });
        });
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        return {
          content: '',
          done: true,
          error: `Claude API 错误: ${errorMsg}`
        };
      }
      throw error;
    }
  }

  private async sendToOpenAI(messages: ChatMessage[], request: EnhancedAIRequest): Promise<EnhancedAIResponse> {
    try {
      const openAIMessages = await this.convertToOpenAIFormat(messages);

      const requestBody = {
        model: this.model.model,
        messages: openAIMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
        stream: false
      };

      const response = await axios.post(
        `${this.model.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.model.apiKey}`
          },
          timeout: 60000
        }
      );

      return {
        content: response.data.choices[0]?.message?.content || '',
        done: true,
        usage: response.data.usage ? {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        } : undefined
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        return {
          content: '',
          done: true,
          error: `OpenAI API 错误: ${errorMsg}`
        };
      }
      throw error;
    }
  }

  private async streamToOpenAI(
    messages: ChatMessage[],
    request: EnhancedAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<EnhancedAIResponse> {
    try {
      const openAIMessages = await this.convertToOpenAIFormat(messages);

      const requestBody = {
        model: this.model.model,
        messages: openAIMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
        stream: true
      };

      const response = await axios.post(
        `${this.model.baseUrl || 'https://api.openai.com'}/v1/chat/completions`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.model.apiKey}`
          },
          responseType: 'stream',
          timeout: 60000
        }
      );

      let fullContent = '';

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                resolve({
                  content: fullContent,
                  done: true
                });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  const text = parsed.choices[0].delta.content;
                  fullContent += text;
                  onChunk(text);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        response.data.on('error', (error: Error) => {
          reject(error);
        });

        response.data.on('end', () => {
          resolve({
            content: fullContent,
            done: true
          });
        });
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        return {
          content: '',
          done: true,
          error: `OpenAI API 错误: ${errorMsg}`
        };
      }
      throw error;
    }
  }

  private async sendToGemini(messages: ChatMessage[], request: EnhancedAIRequest): Promise<EnhancedAIResponse> {
    // Gemini API 实现
    // 这里可以添加具体的 Gemini API 调用逻辑
    return {
      content: 'Gemini 支持正在开发中...',
      done: true,
      error: 'Gemini API 集成待完成'
    };
  }

  private async sendTextMessage(messages: ChatMessage[], request: EnhancedAIRequest): Promise<EnhancedAIResponse> {
    // 对于不支持附件的模型，只发送文本内容
    const textMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 使用通用 OpenAI 兼容格式
    try {
      const requestBody = {
        model: this.model.model,
        messages: textMessages,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.7,
        stream: false
      };

      const response = await axios.post(
        `${this.model.baseUrl}/chat/completions`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.model.apiKey}`
          },
          timeout: 60000
        }
      );

      return {
        content: response.data.choices[0]?.message?.content || '',
        done: true
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        return {
          content: '',
          done: true,
          error: `API 错误: ${errorMsg}`
        };
      }
      throw error;
    }
  }

  private async convertToClaudeFormat(messages: ChatMessage[]): Promise<any[]> {
    const claudeMessages: any[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Claude 系统消息需要特殊处理
        continue;
      }

      const claudeMessage: any = {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: []
      };

      // 添加文本内容
      if (message.content) {
        claudeMessage.content.push({
          type: 'text',
          text: message.content
        });
      }

      // 添加图片附件
      if (message.attachments) {
        for (const attachment of message.attachments) {
          if (attachment.type === 'image' && attachment.tempPath) {
            try {
              const imageBase64 = fs.readFileSync(attachment.tempPath).toString('base64');
              const mimeType = attachment.mimeType || 'image/png';

              claudeMessage.content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBase64
                }
              });
            } catch (error) {
              console.warn(`无法读取图片文件: ${attachment.tempPath}`);
            }
          }
        }
      }

      claudeMessages.push(claudeMessage);
    }

    return claudeMessages;
  }

  private async convertToOpenAIFormat(messages: ChatMessage[]): Promise<any[]> {
    const openAIMessages: any[] = [];

    for (const message of messages) {
      const openAIMessage: any = {
        role: message.role,
        content: []
      };

      // 添加文本内容
      if (message.content) {
        openAIMessage.content.push({
          type: 'text',
          text: message.content
        });
      }

      // 添加图片附件
      if (message.attachments) {
        for (const attachment of message.attachments) {
          if (attachment.type === 'image' && attachment.tempPath) {
            try {
              const imageBase64 = fs.readFileSync(attachment.tempPath).toString('base64');
              const mimeType = attachment.mimeType || 'image/png';

              openAIMessage.content.push({
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: 'auto'
                }
              });
            } catch (error) {
              console.warn(`无法读取图片文件: ${attachment.tempPath}`);
            }
          }
        }
      }

      // 如果没有图片内容，简化为纯文本格式
      if (openAIMessage.content.length === 1 && openAIMessage.content[0].type === 'text') {
        openAIMessage.content = openAIMessage.content[0].text;
      }

      openAIMessages.push(openAIMessage);
    }

    return openAIMessages;
  }
}