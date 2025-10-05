#!/usr/bin/env node

import { AICLISDK } from './sdk';
import { SessionManagerV3 } from '../core/session-manager-v3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface SDKOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  outputFormat?: 'text' | 'json' | 'stream-json';
  inputFormat?: 'text' | 'stream-json';
  includePartialMessages?: boolean;
  appendSystemPrompt?: string;
  maxTurns?: number;
  verbose?: boolean;
}

export class PrintModeHandler {
  private sdk: AICLISDK;
  private sessionManager: SessionManagerV3;
  private options: SDKOptions;

  constructor(options: SDKOptions) {
    this.options = options;
    this.sdk = new AICLISDK(options);
    this.sessionManager = new SessionManagerV3();
  }

  async handleQuery(query: string, stdinContent?: string): Promise<void> {
    try {
      let finalQuery = query;

      // 处理管道输入
      if (stdinContent) {
        finalQuery = `Context from stdin:\n${stdinContent}\n\nUser query: ${query}`;
      }

      // 附加系统提示
      if (this.options.appendSystemPrompt) {
        finalQuery = `${this.options.appendSystemPrompt}\n\n${finalQuery}`;
      }

      // 根据输出格式处理响应
      if (this.options.outputFormat === 'json') {
        await this.handleJSONMode(finalQuery);
      } else if (this.options.outputFormat === 'stream-json') {
        await this.handleStreamJSONMode(finalQuery);
      } else {
        await this.handleTextMode(finalQuery);
      }

    } catch (error) {
      this.outputError(error);
    }
  }

  private async handleTextMode(query: string): Promise<void> {
    const response = await this.sdk.query(query, {
      stream: false,
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose
    });

    if (this.options.outputFormat === 'text') {
      console.log(response.content);
    } else {
      console.log(JSON.stringify({
        type: 'response',
        content: response.content,
        model: response.model,
        usage: response.usage,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  }

  private async handleJSONMode(query: string): Promise<void> {
    const response = await this.sdk.query(query, {
      stream: false,
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose
    });

    const output = {
      type: 'response',
      content: response.content,
      model: response.model,
      usage: response.usage,
      timestamp: new Date().toISOString(),
      provider: this.options.provider,
      query: query
    };

    console.log(JSON.stringify(output, null, 2));
  }

  private async handleStreamJSONMode(query: string): Promise<void> {
    const stream = this.sdk.queryStream(query, {
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose
    });

    for await (const chunk of stream) {
      const output = {
        type: chunk.type,
        content: chunk.content,
        timestamp: chunk.timestamp,
        ...(this.options.includePartialMessages && { partial: true })
      };

      console.log(JSON.stringify(output));
    }
  }

  private outputError(error: any): void {
    if (this.options.outputFormat === 'json' || this.options.outputFormat === 'stream-json') {
      console.error(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, null, 2));
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    process.exit(1);
  }

  // 继续最近的会话
  async continueLastSession(query: string, stdinContent?: string): Promise<void> {
    try {
      const sessionId = await this.sessionManager.continueLastSession();

      if (!sessionId) {
        // 如果没有最近的会话，创建一个新的
        const newSessionId = this.sessionManager.createSession({
          provider: this.options.provider,
          model: this.options.model
        });
        await this.handleQueryWithSession(query, newSessionId, stdinContent);
        return;
      }

      await this.handleQueryWithSession(query, sessionId, stdinContent);
    } catch (error) {
      this.outputError(error);
    }
  }

  // 恢复特定会话
  async resumeSession(sessionId: string, query: string, stdinContent?: string): Promise<void> {
    try {
      const success = await this.sessionManager.resumeSession(sessionId);

      if (!success) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await this.handleQueryWithSession(query, sessionId, stdinContent);
    } catch (error) {
      this.outputError(error);
    }
  }

  // 使用指定会话处理查询
  private async handleQueryWithSession(query: string, sessionId: string, stdinContent?: string): Promise<void> {
    try {
      let finalQuery = query;

      // 处理管道输入
      if (stdinContent) {
        finalQuery = `Context from stdin:\n${stdinContent}\n\nUser query: ${query}`;
      }

      // 附加系统提示
      if (this.options.appendSystemPrompt) {
        finalQuery = `${this.options.appendSystemPrompt}\n\n${finalQuery}`;
      }

      // 根据输出格式处理响应
      if (this.options.outputFormat === 'json') {
        await this.handleJSONModeWithSession(finalQuery, sessionId);
      } else if (this.options.outputFormat === 'stream-json') {
        await this.handleStreamJSONModeWithSession(finalQuery, sessionId);
      } else {
        await this.handleTextModeWithSession(finalQuery, sessionId);
      }

    } catch (error) {
      this.outputError(error);
    }
  }

  private async handleTextModeWithSession(query: string, sessionId: string): Promise<void> {
    const response = await this.sdk.query(query, {
      stream: false,
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose,
      sessionId
    });

    // 添加用户消息到会话
    await this.sessionManager.addMessage(sessionId, {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    });

    // 添加助手回复到会话
    await this.sessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString()
    });

    if (this.options.outputFormat === 'text') {
      console.log(response.content);
    } else {
      console.log(JSON.stringify({
        type: 'response',
        content: response.content,
        model: response.model,
        usage: response.usage,
        sessionId,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  }

  private async handleJSONModeWithSession(query: string, sessionId: string): Promise<void> {
    const response = await this.sdk.query(query, {
      stream: false,
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose,
      sessionId
    });

    // 添加消息到会话
    await this.sessionManager.addMessage(sessionId, {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    });

    await this.sessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString()
    });

    const output = {
      type: 'response',
      content: response.content,
      model: response.model,
      usage: response.usage,
      sessionId,
      timestamp: new Date().toISOString(),
      provider: this.options.provider,
      query: query
    };

    console.log(JSON.stringify(output, null, 2));
  }

  private async handleStreamJSONModeWithSession(query: string, sessionId: string): Promise<void> {
    const stream = this.sdk.queryStream(query, {
      maxTurns: this.options.maxTurns,
      verbose: this.options.verbose,
      sessionId
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const output = {
        type: chunk.type,
        content: chunk.content,
        timestamp: chunk.timestamp,
        sessionId,
        ...(this.options.includePartialMessages && { partial: true })
      };

      console.log(JSON.stringify(output));

      if (chunk.type === 'content') {
        fullContent += chunk.content;
      }
    }

    // 添加消息到会话
    await this.sessionManager.addMessage(sessionId, {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    });

    await this.sessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString()
    });
  }

  // 列出所有会话
  async listSessions(): Promise<void> {
    try {
      const sessions = await this.sessionManager.getAllSessions();

      if (this.options.outputFormat === 'json') {
        console.log(JSON.stringify({
          type: 'sessions',
          sessions: sessions.map(session => ({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            provider: session.provider,
            model: session.model,
            messageCount: session.messages.length
          }))
        }, null, 2));
      } else {
        console.log('可用会话:');
        sessions.forEach((session, index) => {
          console.log(`${index + 1}. ${session.title} (${session.id})`);
          console.log(`   创建: ${new Date(session.createdAt).toLocaleString()}`);
          console.log(`   更新: ${new Date(session.updatedAt).toLocaleString()}`);
          console.log(`   消息数: ${session.messages.length}`);
          console.log(`   模型: ${session.provider}/${session.model}`);
          console.log('');
        });
      }
    } catch (error) {
      this.outputError(error);
    }
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const success = await this.sessionManager.deleteSession(sessionId);

      if (this.options.outputFormat === 'json') {
        console.log(JSON.stringify({
          type: 'delete_session',
          sessionId,
          success,
          timestamp: new Date().toISOString()
        }, null, 2));
      } else {
        if (success) {
          console.log(`会话 ${sessionId} 已删除`);
        } else {
          console.error(`会话 ${sessionId} 未找到`);
        }
      }
    } catch (error) {
      this.outputError(error);
    }
  }
}

// 处理标准输入
function getStdinContent(): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(undefined);
      return;
    }

    let content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      content += chunk;
    });
    process.stdin.on('end', () => {
      resolve(content.trim());
    });
  });
}

// 主函数
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 解析命令行参数
  const options: SDKOptions = {};
  let queryIndex = -1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--provider':
      case '-p':
        options.provider = args[++i];
        break;
      case '--api-key':
      case '-k':
        options.apiKey = args[++i];
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--base-url':
      case '-u':
        options.baseUrl = args[++i];
        break;
      case '--print':
        // 这是触发打印模式的标志
        break;
      case '--output-format':
        options.outputFormat = args[++i] as any;
        break;
      case '--input-format':
        options.inputFormat = args[++i] as any;
        break;
      case '--include-partial-messages':
        options.includePartialMessages = true;
        break;
      case '--append-system-prompt':
        options.appendSystemPrompt = args[++i];
        break;
      case '--max-turns':
        options.maxTurns = parseInt(args[++i]);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (!arg.startsWith('--') && !arg.startsWith('-')) {
          queryIndex = i;
        }
    }
  }

  // 获取查询内容
  let query = '';
  if (queryIndex >= 0) {
    query = args[queryIndex];
  } else if (!process.stdin.isTTY) {
    // 从管道读取
    query = await getStdinContent() || '';
  }

  if (!query) {
    console.error('Error: No query provided');
    process.exit(1);
  }

  // 获取标准输入内容（如果有）
  const stdinContent = await getStdinContent();

  // 创建打印模式处理器
  const handler = new PrintModeHandler(options);
  await handler.handleQuery(query, stdinContent);
}