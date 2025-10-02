import { FileAttachment } from '../core/terminal-file-uploader';
import chalk from 'chalk';
import ora from 'ora';

// 定义基础接口
export interface AIRequest {
  message: string;
  attachments?: FileAttachment[];
}

export interface AIResponse {
  content: string;
  role: string;
  timestamp: Date;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: any;
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekIntegration {
  private config: DeepSeekConfig;
  private supportedImageFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

  constructor(config: DeepSeekConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.deepseek.com',
      model: config.model || 'deepseek-chat',
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.7
    };
  }

  public async sendMessageWithAttachments(
    message: string,
    attachments: FileAttachment[]
  ): Promise<AIResponse> {
    console.log(chalk.blue('🤖 正在发送消息到 DeepSeek...'));

    const spinner = ora('处理附件中...').start();

    try {
      // 构建消息内容
      const messageContent = await this.buildMessageContent(message, attachments);
      spinner.succeed('附件处理完成');

      // 构建请求
      const request: DeepSeekRequest = {
        model: this.config.model || 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ],
        max_tokens: this.config.maxTokens || 4000,
        temperature: this.config.temperature || 0.7,
        stream: false
      };

      // 显示附件信息
      if (attachments.length > 0) {
        console.log(chalk.cyan(`📎 已包含 ${attachments.length} 个附件:`));
        attachments.forEach((attachment, index) => {
          const icon = this.getFileIcon(attachment.type);
          console.log(chalk.gray(`   ${index + 1}. ${icon} ${attachment.filename} (${this.formatFileSize(attachment.size)})`));
        });
        console.log('');
      }

      // 发送请求
      const responseSpinner = ora('DeepSeek 处理中...').start();

      const response = await this.makeDeepSeekRequest(request);
      responseSpinner.stop();

      // 提取响应内容
      const content = response.choices[0]?.message?.content || '';

      console.log(chalk.green('\n🤖 DeepSeek 回复:'));
      console.log('─'.repeat(60));
      console.log(content);
      console.log('─'.repeat(60));

      // 返回标准化的响应
      return {
        content,
        role: 'assistant',
        timestamp: new Date(),
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        },
        metadata: {
          model: response.model,
          provider: 'deepseek',
          attachmentsProcessed: attachments.length,
          requestId: response.id
        }
      };

    } catch (error) {
      spinner.fail('处理失败');
      throw new Error(`DeepSeek API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async buildMessageContent(
    text: string,
    attachments: FileAttachment[]
  ): Promise<string> {
    let content = text;

    // 处理附件 - DeepSeek目前主要支持文本内容，图片转换为描述
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        // 对于图片附件，添加文件信息说明
        content += `\n\n[图片附件: ${attachment.filename} (${this.formatFileSize(attachment.size)})]`;

        // 如果是图片，提示用户描述内容
        content += `\n请我帮你分析这张图片的内容。图片格式: ${attachment.mimeType}`;
      } else if (attachment.type === 'text' || attachment.type === 'document') {
        // 处理文本和文档附件
        const textContent = this.processTextAttachment(attachment);
        if (textContent) {
          content += `\n\n--- 文档附件: ${attachment.filename} ---\n${textContent}\n--- 文档附件结束 ---`;
        }
      } else {
        // 其他类型的附件
        content += `\n\n[附件: ${attachment.filename} (${this.formatFileSize(attachment.size)}) - ${attachment.mimeType}]`;
      }
    }

    return content;
  }

  private isImageFormatSupported(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return this.supportedImageFormats.includes(ext);
  }

  private async processImageAttachment(attachment: FileAttachment): Promise<string | null> {
    try {
      if (attachment.content) {
        return attachment.content.toString('base64');
      }

      // 如果没有内容，尝试读取文件
      const fs = require('fs');
      if (fs.existsSync(attachment.originalPath)) {
        const imageBuffer = fs.readFileSync(attachment.originalPath);
        return imageBuffer.toString('base64');
      }

      return null;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ 处理图片附件失败: ${attachment.filename}`));
      return null;
    }
  }

  private processTextAttachment(attachment: FileAttachment): string | null {
    try {
      if (attachment.content) {
        const text = attachment.content.toString('utf8');
        // 限制文本长度
        return text.length > 10000 ? text.substring(0, 10000) + '\n... (内容已截断)' : text;
      }

      // 如果没有内容，尝试读取文件
      const fs = require('fs');
      if (fs.existsSync(attachment.originalPath)) {
        const text = fs.readFileSync(attachment.originalPath, 'utf8');
        return text.length > 10000 ? text.substring(0, 10000) + '\n... (内容已截断)' : text;
      }

      return null;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ 处理文本附件失败: ${attachment.filename}`));
      return null;
    }
  }

  private async makeDeepSeekRequest(request: DeepSeekRequest): Promise<DeepSeekResponse> {
    const response = await fetch(`${this.config.baseUrl || 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data as DeepSeekResponse;
  }

  private getFileIcon(type: string): string {
    const icons = {
      image: '🖼️',
      document: '📄',
      text: '📝',
      binary: '💾',
      unknown: '📎'
    };
    return icons[type as keyof typeof icons] || icons.unknown;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // 流式响应支持
  public async sendMessageWithAttachmentsStream(
    message: string,
    attachments: FileAttachment[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log(chalk.blue('🤖 正在发送消息到 DeepSeek (流式)...'));

    try {
      // 构建消息内容
      const messageContent = await this.buildMessageContent(message, attachments);

      // 构建请求
      const request: DeepSeekRequest = {
        model: this.config.model || 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ],
        max_tokens: this.config.maxTokens || 4000,
        temperature: this.config.temperature || 0.7,
        stream: true
      };

      // 发送流式请求
      const response = await fetch(`${this.config.baseUrl || 'https://api.deepseek.com'}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (error) {
              // 忽略解析错误
            }
          }
        }
      }

    } catch (error) {
      throw new Error(`DeepSeek 流式 API 调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 验证 API 密钥
  public async validateApiKey(): Promise<boolean> {
    try {
      const testRequest: DeepSeekRequest = {
        model: this.config.model || 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 1,
        temperature: 0
      };

      const response = await this.makeDeepSeekRequest(testRequest);
      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ DeepSeek API 验证失败: ${error instanceof Error ? error.message : '未知错误'}`));
      return false;
    }
  }

  // 获取模型信息
  public getModelInfo(): { model: string; provider: string; capabilities: string[] } {
    return {
      model: this.config.model || 'deepseek-chat',
      provider: 'deepseek',
      capabilities: [
        'text-generation',
        'image-analysis',
        'document-processing',
        'code-generation',
        'streaming'
      ]
    };
  }
}