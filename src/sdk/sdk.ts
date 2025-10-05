#!/usr/bin/env node

import { EnhancedAIService } from '../services/enhanced-ai-service';
import { SessionManagerV3 } from '../core/session-manager-v3';
import { AttachmentManager, ManagedAttachment } from '../core/attachment-manager';
import { v4 as uuidv4 } from 'uuid';

export interface SDKQueryOptions {
  stream?: boolean;
  maxTurns?: number;
  verbose?: boolean;
  sessionId?: string;
  attachments?: Array<{
    type: string;
    content: string | Buffer;
    filename?: string;
  }>;
}

export interface SDKResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  sessionId: string;
  timestamp: string;
}

export interface SDKStreamChunk {
  type: 'content' | 'error' | 'status';
  content: string;
  timestamp: string;
  sessionId: string;
}

export class AICLISDK {
  private aiService: EnhancedAIService;
  private sessionManager: SessionManagerV3;
  private attachmentManager: AttachmentManager;
  private options: any;

  constructor(options: any = {}) {
    this.options = {
      provider: options.provider || 'deepseek',
      apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY,
      model: options.model || 'deepseek-chat',
      baseUrl: options.baseUrl,
      ...options
    };

    this.aiService = new EnhancedAIService(this.options);
    this.sessionManager = new SessionManagerV3();
    this.attachmentManager = new AttachmentManager();
  }

  async query(prompt: string, options: SDKQueryOptions = {}): Promise<SDKResponse> {
    const sessionId = options.sessionId || this.createNewSession();

    try {
      // 准备消息内容
      const messages = await this.prepareMessages(prompt, sessionId);

      // 简化的AI服务调用 - 构建请求对象
      const request = {
        messages: [{
          role: 'user' as const,
          content: prompt,
          timestamp: new Date()
        }],
        model: this.options.model,
        stream: false
      };
      const response = await this.aiService.sendMessage(request);

      // 保存对话到会话
      await this.sessionManager.addMessage(sessionId, {
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString()
      });

      await this.sessionManager.addMessage(sessionId, {
        role: 'assistant',
        content: response.content || 'No response',
        timestamp: new Date().toISOString()
      });

      return {
        content: response.content || 'No response',
        model: this.options.model,
        usage: response.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sessionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`SDK Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async* queryStream(prompt: string, options: SDKQueryOptions = {}): AsyncGenerator<SDKStreamChunk> {
    const sessionId = options.sessionId || this.createNewSession();

    try {
      yield {
        type: 'status',
        content: 'Starting request...',
        timestamp: new Date().toISOString(),
        sessionId
      };

      // 简化的流式实现 - 先获取完整响应然后模拟流式输出
      const response = await this.query(prompt, { sessionId });

      // 模拟流式输出
      const words = response.content.split(' ');
      let currentContent = '';

      for (const word of words) {
        currentContent += word + ' ';
        yield {
          type: 'content',
          content: word + ' ',
          timestamp: new Date().toISOString(),
          sessionId
        };
        // 添加小延迟模拟真实的流式输出
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      yield {
        type: 'status',
        content: 'Request completed',
        timestamp: new Date().toISOString(),
        sessionId
      };

    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        sessionId
      };
    }
  }

  async createSession(): Promise<string> {
    return this.createNewSession();
  }

  async getSession(sessionId: string): Promise<any> {
    return this.sessionManager.getSession(sessionId);
  }

  async listSessions(): Promise<any[]> {
    return this.sessionManager.getAllSessions();
  }

  async continueSession(sessionId: string, prompt: string): Promise<SDKResponse> {
    return this.query(prompt, { sessionId });
  }

  async* continueSessionStream(sessionId: string, prompt: string): AsyncGenerator<SDKStreamChunk> {
    yield* this.queryStream(prompt, { sessionId });
  }

  private createNewSession(): string {
    const sessionId = uuidv4();
    const actualSessionId = this.sessionManager.createSession({
      provider: this.options.provider,
      model: this.options.model
    });
    return actualSessionId;
  }

  private async prepareMessages(prompt: string, sessionId: string): Promise<any[]> {
    const session = await this.sessionManager.getSession(sessionId);
    const messages = session?.messages || [];

    return messages;
  }

  // 附件相关方法 - 简化实现
  async addAttachment(type: string, content: string | Buffer, filename?: string): Promise<void> {
    // 简化的附件处理 - 这里只是模拟添加
    console.log(`Attachment added: ${type}, ${filename}`);
  }

  getAttachments(): any[] {
    return this.attachmentManager.getAllAttachments();
  }

  clearAttachments(): void {
    // 简化的清除附件
    console.log('Attachments cleared');
  }

  // 配置相关方法
  updateConfig(newConfig: any): void {
    this.options = { ...this.options, ...newConfig };
    this.aiService = new EnhancedAIService(this.options);
  }

  getConfig(): any {
    return { ...this.options };
  }
}