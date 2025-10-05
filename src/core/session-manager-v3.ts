#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Array<{
    id: string;
    type: string;
    filename: string;
    size: number;
  }>;
}

export interface Session {
  id: string;
  title: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  metadata?: {
    totalMessages: number;
    totalTokens?: number;
    lastQuery?: string;
  };
}

export class SessionManagerV3 {
  private sessionsDir: string;
  private currentSessionId: string | null = null;
  private maxSessions: number = 100;
  private maxSessionAge: number = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(maxSessions: number = 100, maxSessionAge: number = 30) {
    this.sessionsDir = join(homedir(), '.config', 'aicli', 'sessions');
    this.maxSessions = maxSessions;
    this.maxSessionAge = maxSessionAge * 24 * 60 * 60 * 1000;

    // 确保目录存在
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // 创建新会话
  createSession(options: {
    title?: string;
    provider?: string;
    model?: string;
    systemPrompt?: string;
  } = {}): string {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session: Session = {
      id: sessionId,
      title: options.title || this.generateTitle(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      provider: options.provider || 'deepseek',
      model: options.model || 'deepseek-chat',
      metadata: {
        totalMessages: 0
      }
    };

    // 如果有系统提示，添加到消息列表
    if (options.systemPrompt) {
      session.messages.push({
        role: 'system',
        content: options.systemPrompt,
        timestamp: now
      });
      if (!session.metadata) session.metadata = { totalMessages: 0 };
      session.metadata.totalMessages = 1;
    }

    this.saveSession(session);
    this.currentSessionId = sessionId;
    return sessionId;
  }

  // 获取会话
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const sessionFile = join(this.sessionsDir, `${sessionId}.json`);
      if (!existsSync(sessionFile)) {
        return null;
      }

      const content = readFileSync(sessionFile, 'utf8');
      return JSON.parse(content) as Session;
    } catch (error) {
      console.error(`Error loading session ${sessionId}:`, error);
      return null;
    }
  }

  // 保存会话
  saveSession(session: Session): void {
    try {
      const sessionFile = join(this.sessionsDir, `${session.id}.json`);
      writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error(`Error saving session ${session.id}:`, error);
    }
  }

  // 添加消息到会话
  async addMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    if (!session.metadata) session.metadata = { totalMessages: 0 };
    session.metadata.totalMessages = session.messages.length;

    // 更新最后查询
    if (message.role === 'user') {
      if (!session.metadata) session.metadata = { totalMessages: 0 };
      session.metadata.lastQuery = message.content;
    }

    this.saveSession(session);
  }

  // 继续最近的对话
  async continueLastSession(): Promise<string | null> {
    const sessions = await this.getAllSessions();
    if (sessions.length === 0) {
      return null;
    }

    // 按更新时间排序，获取最新的会话
    const latestSession = sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];

    this.currentSessionId = latestSession.id;
    return latestSession.id;
  }

  // 恢复特定会话
  async resumeSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    this.currentSessionId = sessionId;
    return true;
  }

  // 获取所有会话
  async getAllSessions(): Promise<Session[]> {
    try {
      const files = readdirSync(this.sessionsDir);
      const sessions: Session[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = readFileSync(join(this.sessionsDir, file), 'utf8');
            const session = JSON.parse(content) as Session;

            // 检查会话是否过期
            const sessionAge = Date.now() - new Date(session.updatedAt).getTime();
            if (sessionAge <= this.maxSessionAge) {
              sessions.push(session);
            } else {
              // 删除过期会话
              unlinkSync(join(this.sessionsDir, file));
            }
          } catch (error) {
            // 忽略损坏的会话文件
            console.warn(`Failed to load session file ${file}:`, error);
          }
        }
      }

      // 清理超过最大数量的会话
      if (sessions.length > this.maxSessions) {
        const sortedSessions = sessions.sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        const sessionsToDelete = sortedSessions.slice(this.maxSessions);
        for (const session of sessionsToDelete) {
          try {
            unlinkSync(join(this.sessionsDir, `${session.id}.json`));
          } catch (error) {
            console.warn(`Failed to delete session ${session.id}:`, error);
          }
        }

        return sortedSessions.slice(0, this.maxSessions);
      }

      return sessions;
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionFile = join(this.sessionsDir, `${sessionId}.json`);
      if (existsSync(sessionFile)) {
        unlinkSync(sessionFile);

        if (this.currentSessionId === sessionId) {
          this.currentSessionId = null;
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  // 清空所有会话
  async clearAllSessions(): Promise<void> {
    try {
      const files = readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          unlinkSync(join(this.sessionsDir, file));
        }
      }
      this.currentSessionId = null;
    } catch (error) {
      console.error('Error clearing sessions:', error);
    }
  }

  // 获取当前会话ID
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // 设置当前会话ID
  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  // 生成会话标题
  private generateTitle(): string {
    const titles = [
      '新对话',
      'AI助手对话',
      '编程助手',
      '代码审查',
      '项目讨论',
      '技术问答',
      '学习对话',
      '创意头脑风暴'
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  // 导出会话
  async exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (format === 'json') {
      return JSON.stringify(session, null, 2);
    } else if (format === 'markdown') {
      let markdown = `# ${session.title}\n\n`;
      markdown += `**创建时间:** ${new Date(session.createdAt).toLocaleString()}\n\n`;
      markdown += `**最后更新:** ${new Date(session.updatedAt).toLocaleString()}\n\n`;
      markdown += `**模型:** ${session.provider}/${session.model}\n\n`;
      markdown += `---\n\n`;

      for (const message of session.messages) {
        const role = message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统';
        markdown += `## ${role}\n\n`;
        markdown += `${message.content}\n\n`;
        markdown += `*${new Date(message.timestamp).toLocaleString()}*\n\n`;
        markdown += `---\n\n`;
      }

      return markdown;
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // 导入会话
  async importSession(sessionData: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    let session: Session;

    if (format === 'json') {
      session = JSON.parse(sessionData) as Session;
      // 生成新的ID避免冲突
      session.id = uuidv4();
      session.createdAt = new Date().toISOString();
      session.updatedAt = new Date().toISOString();
    } else {
      throw new Error('Markdown import not yet implemented');
    }

    this.saveSession(session);
    return session.id;
  }

  // 获取会话统计
  async getSessionStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    oldestSession: Date | null;
    newestSession: Date | null;
    providerStats: Record<string, number>;
  }> {
    const sessions = await this.getAllSessions();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        oldestSession: null,
        newestSession: null,
        providerStats: {}
      };
    }

    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
    const timestamps = sessions.map(s => new Date(s.createdAt).getTime());
    const providerStats = sessions.reduce((stats, session) => {
      stats[session.provider] = (stats[session.provider] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);

    return {
      totalSessions: sessions.length,
      totalMessages,
      oldestSession: new Date(Math.min(...timestamps)),
      newestSession: new Date(Math.max(...timestamps)),
      providerStats
    };
  }
}