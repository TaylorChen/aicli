import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { smartConfig } from './smart-config';

export interface SessionMessage {
  id: string;
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

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  project?: {
    type: string;
    language: string;
    path: string;
    framework?: string;
  };
  tags: string[];
  isPinned: boolean;
  lastActivity: Date;
}

export interface Session {
  id: string;
  metadata: SessionMetadata;
  messages: SessionMessage[];
  context: {
    currentDirectory: string;
    environment: Record<string, string>;
    detectedProject?: any;
  };
  config: {
    model: string;
    provider: string;
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
  };
}

export interface SessionManagerConfig {
  maxSessions: number;
  maxMessagesPerSession: number;
  autoSave: boolean;
  saveInterval: number;
  sessionDirectory: string;
  enableCompression: boolean;
  enableEncryption: boolean;
  defaultSystemPrompt: string;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private config: SessionManagerConfig;
  private autoSaveTimer?: NodeJS.Timeout;
  private sessionFile: string;

  constructor(config?: Partial<SessionManagerConfig>) {
    super();
    this.config = this.loadConfig(config);
    this.sessionFile = path.join(this.config.sessionDirectory, 'sessions.json');

    this.initialize();
  }

  private loadConfig(userConfig?: Partial<SessionManagerConfig>): SessionManagerConfig {
    const baseConfig: SessionManagerConfig = {
      maxSessions: smartConfig.getWithDefault('session.maxSessions', 50),
      maxMessagesPerSession: smartConfig.getWithDefault('session.maxMessagesPerSession', 1000),
      autoSave: smartConfig.getWithDefault('session.autoSave', true),
      saveInterval: smartConfig.getWithDefault('session.saveInterval', 30000), // 30秒
      sessionDirectory: path.join(os.homedir(), '.aicli', 'sessions'),
      enableCompression: smartConfig.getWithDefault('session.enableCompression', false),
      enableEncryption: smartConfig.getWithDefault('session.enableEncryption', false),
      defaultSystemPrompt: smartConfig.getWithDefault('session.defaultSystemPrompt',
        '你是一个AI编程助手，可以帮助用户解决编程问题、解释代码、优化算法等。')
    };

    return { ...baseConfig, ...userConfig };
  }

  private async initialize(): Promise<void> {
    // 确保会话目录存在
    await this.ensureDirectoryExists(this.config.sessionDirectory);

    // 加载已保存的会话
    await this.loadSessions();

    // 启动自动保存
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    // 监听配置变化
    smartConfig.on('change', (key: string, value: any) => {
      this.handleConfigChange(key, value);
    });
  }

  private async ensureDirectoryExists(directory: string): Promise<void> {
    try {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create session directory:', error);
    }
  }

  private handleConfigChange(key: string, value: any): void {
    const configMapping: Record<string, keyof SessionManagerConfig> = {
      'session.maxSessions': 'maxSessions',
      'session.maxMessagesPerSession': 'maxMessagesPerSession',
      'session.autoSave': 'autoSave',
      'session.saveInterval': 'saveInterval',
      'session.enableCompression': 'enableCompression',
      'session.enableEncryption': 'enableEncryption',
      'session.defaultSystemPrompt': 'defaultSystemPrompt'
    };

    const configKey = configMapping[key];
    if (configKey) {
      (this.config as any)[configKey] = value;

      // 如果是自动保存配置变化，重新启动定时器
      if (configKey === 'autoSave' || configKey === 'saveInterval') {
        this.restartAutoSave();
      }
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.saveAllSessions();
    }, this.config.saveInterval);
  }

  private restartAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const content = fs.readFileSync(this.sessionFile, 'utf-8');
        const data = JSON.parse(content);

        if (Array.isArray(data)) {
          for (const sessionData of data) {
            try {
              const session = this.deserializeSession(sessionData);
              this.sessions.set(session.id, session);
            } catch (error) {
              console.warn('Failed to load session:', error);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load sessions:', error);
    }
  }

  private async saveAllSessions(): Promise<void> {
    try {
      const sessionsData = Array.from(this.sessions.values()).map(session =>
        this.serializeSession(session)
      );

      // 压缩数据（如果启用）
      let dataToSave = JSON.stringify(sessionsData, null, 2);
      if (this.config.enableCompression) {
        // TODO: 实现压缩
      }

      fs.writeFileSync(this.sessionFile, dataToSave);

      this.emit('sessionsSaved', { count: sessionsData.length });
    } catch (error) {
      console.error('Failed to save sessions:', error);
      this.emit('sessionSaveError', error);
    }
  }

  private serializeSession(session: Session): any {
    return {
      id: session.id,
      metadata: {
        ...session.metadata,
        createdAt: session.metadata.createdAt.toISOString(),
        updatedAt: session.metadata.updatedAt.toISOString(),
        lastActivity: session.metadata.lastActivity.toISOString()
      },
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      })),
      context: session.context,
      config: session.config
    };
  }

  private deserializeSession(data: any): Session {
    return {
      id: data.id,
      metadata: {
        ...data.metadata,
        createdAt: new Date(data.metadata.createdAt),
        updatedAt: new Date(data.metadata.updatedAt),
        lastActivity: new Date(data.metadata.lastActivity)
      },
      messages: data.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })),
      context: data.context,
      config: data.config
    };
  }

  // 创建新会话
  async createSession(options?: {
    title?: string;
    systemPrompt?: string;
    model?: string;
    provider?: string;
    project?: any;
  }): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date();

    const session: Session = {
      id: sessionId,
      metadata: {
        id: sessionId,
        title: options?.title || this.generateSessionTitle(),
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        project: options?.project,
        tags: [],
        isPinned: false,
        lastActivity: now
      },
      messages: [],
      context: {
        currentDirectory: process.cwd(),
        environment: Object.fromEntries(
          Object.entries(process.env).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>,
        detectedProject: options?.project
      },
      config: {
        model: options?.model || smartConfig.getWithDefault('ai.model', 'gpt-3.5-turbo'),
        provider: options?.provider || smartConfig.getWithDefault('ai.provider', 'openai'),
        temperature: smartConfig.getWithDefault('ai.temperature', 0.7),
        maxTokens: smartConfig.getWithDefault('ai.maxTokens', 4000),
        systemPrompt: options?.systemPrompt || this.config.defaultSystemPrompt
      }
    };

    this.sessions.set(sessionId, session);

    // 清理过期的会话
    await this.cleanupOldSessions();

    this.emit('sessionCreated', session);
    return sessionId;
  }

  // 生成会话标题
  private generateSessionTitle(): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `新会话 ${timeStr}`;
  }

  // 获取当前会话
  getCurrentSession(): Session | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }

  // 设置当前会话
  setCurrentSession(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) {
      return false;
    }

    this.currentSessionId = sessionId;
    const session = this.sessions.get(sessionId)!;
    session.metadata.lastActivity = new Date();

    this.emit('sessionSwitched', session);
    return true;
  }

  // 获取会话
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  // 列出所有会话
  listSessions(): SessionMetadata[] {
    return Array.from(this.sessions.values())
      .map(session => session.metadata)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  // 添加消息到会话
  async addMessage(sessionId: string, message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messageId = uuidv4();
    const fullMessage: SessionMessage = {
      ...message,
      id: messageId,
      timestamp: new Date()
    };

    session.messages.push(fullMessage);
    session.metadata.messageCount += 1;
    session.metadata.updatedAt = new Date();
    session.metadata.lastActivity = new Date();

    // 限制消息数量
    if (session.messages.length > this.config.maxMessagesPerSession) {
      session.messages = session.messages.slice(-this.config.maxMessagesPerSession);
    }

    // 更新会话标题（基于第一条用户消息）
    if (message.role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
      session.metadata.title = this.generateTitleFromMessage(message.content);
    }

    this.emit('messageAdded', { session, message: fullMessage });

    return messageId;
  }

  // 从消息内容生成标题
  private generateTitleFromMessage(content: string): string {
    // 简单的标题生成逻辑
    const words = content.split(/\s+/).slice(0, 6);
    let title = words.join(' ');

    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }

    return title || '新会话';
  }

  // 处理用户消息
  async processMessage(sessionId: string, content: string): Promise<StreamResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 添加用户消息
    await this.addMessage(sessionId, {
      role: 'user',
      content,
      metadata: {}
    });

    // TODO: 实现实际的AI响应处理
    // 这里返回一个模拟的响应
    const response: StreamResponse = {
      id: uuidv4(),
      chunks: [
        {
          type: 'text',
          content: '这是一个模拟的AI响应。实际实现中，这里会调用真实的AI服务。',
          metadata: { timestamp: new Date() }
        }
      ],
      isComplete: true,
      metadata: {
        model: session.config.model,
        provider: session.config.provider,
        timing: 1000
      }
    };

    // 添加助手消息
    await this.addMessage(sessionId, {
      role: 'assistant',
      content: response.chunks.map(chunk => chunk.content).join(''),
      metadata: {
        model: session.config.model,
        provider: session.config.provider,
        tokens: 150
      }
    });

    return response;
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }

    const session = this.sessions.get(sessionId)!;
    this.sessions.delete(sessionId);

    // 如果删除的是当前会话，切换到最新的会话
    if (this.currentSessionId === sessionId) {
      const latestSession = this.getLatestSession();
      if (latestSession) {
        this.setCurrentSession(latestSession.id);
      } else {
        this.currentSessionId = null;
      }
    }

    this.emit('sessionDeleted', session);
    return true;
  }

  // 获取最新的会话
  private getLatestSession(): Session | null {
    const sessions = Array.from(this.sessions.values())
      .sort((a, b) => b.metadata.lastActivity.getTime() - a.metadata.lastActivity.getTime());

    return sessions.length > 0 ? sessions[0] : null;
  }

  // 清理过期会话
  async cleanupOldSessions(): Promise<void> {
    const sessionCount = this.sessions.size;
    if (sessionCount <= this.config.maxSessions) {
      return;
    }

    const sessions = Array.from(this.sessions.values())
      .sort((a, b) => b.metadata.lastActivity.getTime() - a.metadata.lastActivity.getTime());

    const sessionsToDelete = sessions.slice(this.config.maxSessions);
    for (const session of sessionsToDelete) {
      if (!session.metadata.isPinned) {
        this.sessions.delete(session.id);
      }
    }
  }

  // 保存会话
  async saveSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      await this.saveAllSessions();
      this.emit('sessionSaved', session);
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  // 加载会话
  async loadSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.setCurrentSession(sessionId);
    return sessionId;
  }

  // 导出会话
  exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (format === 'json') {
      return JSON.stringify(this.serializeSession(session), null, 2);
    } else if (format === 'markdown') {
      return this.exportToMarkdown(session);
    }

    throw new Error('Unsupported export format');
  }

  private exportToMarkdown(session: Session): string {
    let markdown = `# ${session.metadata.title}\n\n`;
    markdown += `**创建时间:** ${session.metadata.createdAt.toLocaleString()}\n`;
    markdown += `**更新时间:** ${session.metadata.updatedAt.toLocaleString()}\n`;
    markdown += `**消息数量:** ${session.metadata.messageCount}\n\n`;

    if (session.metadata.project) {
      markdown += `**项目:** ${session.metadata.project.type} (${session.metadata.project.language})\n\n`;
    }

    markdown += '---\n\n';

    for (const message of session.messages) {
      const role = message.role === 'user' ? '用户' : '助手';
      markdown += `## ${role}\n\n`;
      markdown += `${message.content}\n\n`;
      markdown += `*${message.timestamp.toLocaleString()}*\n\n`;
      markdown += '---\n\n';
    }

    return markdown;
  }

  // 搜索会话
  searchSessions(query: string): SessionMetadata[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.sessions.values())
      .filter(session => {
        // 搜索标题
        if (session.metadata.title.toLowerCase().includes(lowerQuery)) {
          return true;
        }

        // 搜索消息内容
        return session.messages.some(msg =>
          msg.content.toLowerCase().includes(lowerQuery)
        );
      })
      .map(session => session.metadata)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  // 获取统计信息
  getStatistics(): {
    totalSessions: number;
    totalMessages: number;
    currentSession: string | null;
    oldestSession: Date | null;
    newestSession: Date | null;
    pinnedSessions: number;
    config: SessionManagerConfig;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);

    let oldestSession: Date | null = null;
    let newestSession: Date | null = null;

    if (sessions.length > 0) {
      oldestSession = new Date(Math.min(...sessions.map(s => s.metadata.createdAt.getTime())));
      newestSession = new Date(Math.max(...sessions.map(s => s.metadata.lastActivity.getTime())));
    }

    return {
      totalSessions: sessions.length,
      totalMessages,
      currentSession: this.currentSessionId,
      oldestSession,
      newestSession,
      pinnedSessions: sessions.filter(s => s.metadata.isPinned).length,
      config: { ...this.config }
    };
  }

  // 销毁会话管理器
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    // 保存所有会话
    this.saveAllSessions();

    this.emit('destroyed');
  }

  // 继续会话 (兼容旧版本)
  async continueSession(sessionId: string): Promise<void> {
    await this.loadSession(sessionId);
  }

  // 获取会话统计信息
  getSessionStats(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      messageCount: session.messages.length,
      createdAt: session.metadata.createdAt,
      updatedAt: session.metadata.updatedAt,
      tokensUsed: session.messages.reduce((total, msg) => total + (msg.metadata?.tokens || 0), 0)
    };
  }

  // 导入会话
  async importSession(sessionData: any): Promise<string> {
    try {
      const session = this.deserializeSession(sessionData);
      this.sessions.set(session.id, session);
      await this.saveAllSessions();
      this.emit('sessionImported', session);
      return session.id;
    } catch (error) {
      throw new Error(`Failed to import session: ${error}`);
    }
  }

  // 获取整体统计信息
  getOverallStats(): any {
    const sessions = Array.from(this.sessions.values());
    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
    const totalTokens = sessions.reduce((sum, session) =>
      sum + session.messages.reduce((msgSum, msg) => msgSum + (msg.metadata?.tokens || 0), 0), 0);

    return {
      totalSessions: sessions.length,
      totalMessages,
      totalTokens,
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.metadata.createdAt.getTime())) : null,
      newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.metadata.updatedAt.getTime())) : null
    };
  }
}

// 流响应接口
export interface StreamResponse {
  id: string;
  chunks: any[];
  isComplete: boolean;
  metadata?: {
    model?: string;
    provider?: string;
    usage?: any;
    timing?: number;
  };
}

// 向后兼容的导出
export const sessionManager = new SessionManager();