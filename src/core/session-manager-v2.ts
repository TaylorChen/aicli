import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  uuid: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: any;
    error?: string;
  }>;
}

export interface SessionMetadata {
  sessionId: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  model: string;
  provider: string;
  tokensUsed: number;
  compressed: boolean;
  lastMessageCount: number;
}

export interface Session {
  metadata: SessionMetadata;
  messages: SessionMessage[];
}

export class SessionManagerV2 {
  private sessionsDir: string;
  private projectsDir: string;
  private currentSession: Session | null = null;
  private sessionHistory: SessionMessage[] = [];

  constructor() {
    const claudeDir = path.join(os.homedir(), '.aicli');
    this.sessionsDir = path.join(claudeDir, 'sessions');
    this.projectsDir = path.join(claudeDir, 'projects');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.sessionsDir, this.projectsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // 创建新会话
  async createSession(projectId: string, options: {
    title?: string;
    model?: string;
    provider?: string;
  } = {}): Promise<Session> {
    const sessionId = uuidv4();
    const session: Session = {
      metadata: {
        sessionId,
        projectId,
        title: options.title || 'New Session',
        createdAt: new Date(),
        updatedAt: new Date(),
        model: options.model || 'claude-3-sonnet-20240229',
        provider: options.provider || 'claude',
        tokensUsed: 0,
        compressed: false,
        lastMessageCount: 0
      },
      messages: []
    };

    this.currentSession = session;
    this.sessionHistory = [];
    await this.saveSession(session);
    return session;
  }

  // 获取当前会话
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // 设置当前会话
  setCurrentSession(session: Session): void {
    this.currentSession = session;
    this.sessionHistory = [...session.messages];
  }

  // 添加消息到当前会话
  async addMessage(message: Omit<SessionMessage, 'uuid' | 'timestamp'>): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const sessionMessage: SessionMessage = {
      ...message,
      uuid: uuidv4(),
      timestamp: new Date()
    };

    this.currentSession.messages.push(sessionMessage);
    this.currentSession.metadata.updatedAt = new Date();
    this.currentSession.metadata.lastMessageCount = this.currentSession.messages.length;

    await this.saveSession(this.currentSession);
  }

  // 保存会话
  async saveSession(session: Session): Promise<void> {
    const projectDir = path.join(this.projectsDir, this.sanitizePath(session.metadata.projectId));
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const sessionFile = path.join(projectDir, `${session.metadata.sessionId}.jsonl`);
    const data = {
      type: 'session',
      sessionId: session.metadata.sessionId,
      metadata: session.metadata,
      timestamp: new Date().toISOString()
    };

    // 写入元数据
    fs.appendFileSync(sessionFile, JSON.stringify(data) + '\n');

    // 写入消息
    for (const message of session.messages) {
      const messageData = {
        type: 'message',
        sessionId: session.metadata.sessionId,
        message,
        timestamp: message.timestamp.toISOString()
      };
      fs.appendFileSync(sessionFile, JSON.stringify(messageData) + '\n');
    }
  }

  // 加载会话
  async loadSession(sessionId: string): Promise<Session | null> {
    // 在所有项目目录中查找会话
    const projects = fs.readdirSync(this.projectsDir);

    for (const project of projects) {
      const projectDir = path.join(this.projectsDir, project);
      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

      if (fs.existsSync(sessionFile)) {
        return this.loadSessionFromFile(sessionFile);
      }
    }

    return null;
  }

  // 从文件加载会话
  private async loadSessionFromFile(filePath: string): Promise<Session> {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');

    let metadata: SessionMetadata | null = null;
    const messages: SessionMessage[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.type === 'session') {
          metadata = {
            ...data.metadata,
            createdAt: new Date(data.metadata.createdAt),
            updatedAt: new Date(data.metadata.updatedAt)
          };
        } else if (data.type === 'message') {
          messages.push({
            ...data.message,
            timestamp: new Date(data.message.timestamp)
          });
        }
      } catch (error) {
        // 忽略解析错误的行
        continue;
      }
    }

    if (!metadata) {
      throw new Error('Invalid session file: missing metadata');
    }

    const session: Session = { metadata, messages };
    this.currentSession = session;
    this.sessionHistory = [...messages];
    return session;
  }

  // 列出所有会话
  async listAllSessions(): Promise<SessionMetadata[]> {
    const projects = fs.readdirSync(this.projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const allSessions: SessionMetadata[] = [];

    for (const project of projects) {
      const projectDir = path.join(this.projectsDir, project);
      const sessions = await this.listProjectSessions(project);
      allSessions.push(...sessions);
    }

    return allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // 列出项目的所有会话
  async listProjectSessions(projectId: string): Promise<SessionMetadata[]> {
    const projectDir = path.join(this.projectsDir, this.sanitizePath(projectId));
    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const files = fs.readdirSync(projectDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        try {
          const sessionId = file.replace('.jsonl', '');
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.push(session.metadata);
          }
        } catch (error) {
          // 忽略损坏的会话文件
          continue;
        }
      }
    }

    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // 切换到指定会话
  async switchToSession(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return false;
    }

    this.currentSession = session;
    this.sessionHistory = [...session.messages];
    return true;
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<boolean> {
    const projects = fs.readdirSync(this.projectsDir);

    for (const project of projects) {
      const projectDir = path.join(this.projectsDir, project);
      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);

        if (this.currentSession?.metadata.sessionId === sessionId) {
          this.currentSession = null;
          this.sessionHistory = [];
        }

        return true;
      }
    }

    return false;
  }

  // 压缩会话历史
  async compressSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 保留最近 50 条消息，其余的压缩成摘要
    const recentMessages = session.messages.slice(-50);
    const oldMessages = session.messages.slice(0, -50);

    let summary = '';
    if (oldMessages.length > 0) {
      summary = `[Compressed ${oldMessages.length} messages from ${oldMessages[0].timestamp.toDateString()} to ${oldMessages[oldMessages.length - 1].timestamp.toDateString()}]`;
    }

    const compressedSession: Session = {
      metadata: {
        ...session.metadata,
        compressed: true,
        updatedAt: new Date(),
        lastMessageCount: recentMessages.length
      },
      messages: summary ? [{
        role: 'system',
        content: summary,
        timestamp: new Date(),
        uuid: uuidv4()
      }, ...recentMessages] : recentMessages
    };

    await this.saveSession(compressedSession);
  }

  // 获取会话统计
  async getSessionStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalTokens: number;
    oldestSession?: Date;
    sessionsByProject: Record<string, number>;
  }> {
    const projects = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    let totalSessions = 0;
    let totalMessages = 0;
    let totalTokens = 0;
    let oldestSession: Date | undefined;
    const sessionsByProject: Record<string, number> = {};

    for (const project of projects) {
      if (project.isDirectory()) {
        const projectDir = path.join(this.projectsDir, project.name);
        const files = fs.readdirSync(projectDir);

        let projectSessions = 0;
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            projectSessions++;
            totalSessions++;

            try {
              const session = await this.loadSessionFromFile(path.join(projectDir, file));
              totalMessages += session.messages.length;
              totalTokens += session.metadata.tokensUsed;

              if (!oldestSession || session.metadata.createdAt < oldestSession) {
                oldestSession = session.metadata.createdAt;
              }
            } catch (error) {
              // 忽略损坏的会话
            }
          }
        }

        if (projectSessions > 0) {
          sessionsByProject[project.name] = projectSessions;
        }
      }
    }

    return {
      totalSessions,
      totalMessages,
      totalTokens,
      oldestSession,
      sessionsByProject
    };
  }

  // 清理旧会话
  async cleanupOldSessions(maxAge: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    const projects = fs.readdirSync(this.projectsDir);

    for (const project of projects) {
      const projectDir = path.join(this.projectsDir, project);
      const files = fs.readdirSync(projectDir);

      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const sessionFile = path.join(projectDir, file);
          const stats = fs.statSync(sessionFile);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(sessionFile);
            deletedCount++;
          }
        }
      }
    }

    return deletedCount;
  }

  // 导出会话
  async exportSession(sessionId: string, format: 'json' | 'jsonl' = 'json'): Promise<string> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exportDir = path.join(os.homedir(), '.aicli', 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFile = path.join(exportDir, `session-${sessionId}-${timestamp}.${format}`);

    if (format === 'json') {
      fs.writeFileSync(exportFile, JSON.stringify(session, null, 2));
    } else {
      // JSONL 格式
      const lines = [
        JSON.stringify({ type: 'session', metadata: session.metadata }) + '\n'
      ];

      for (const message of session.messages) {
        lines.push(JSON.stringify({ type: 'message', message }) + '\n');
      }

      fs.writeFileSync(exportFile, lines.join(''));
    }

    return exportFile;
  }

  // 导入会话
  async importSession(filePath: string): Promise<string> {
    const content = fs.readFileSync(filePath, 'utf8');
    const sessionId = uuidv4();

    if (filePath.endsWith('.jsonl')) {
      // JSONL 格式导入
      const projectDir = path.join(this.projectsDir, 'imported');
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
      fs.copyFileSync(filePath, sessionFile);

      // 更新会话 ID
      const session = await this.loadSessionFromFile(sessionFile);
      session.metadata.sessionId = sessionId;
      session.metadata.projectId = 'imported';
      await this.saveSession(session);
    } else {
      // JSON 格式导入
      const session = JSON.parse(content);
      session.metadata.sessionId = sessionId;
      session.metadata.projectId = 'imported';
      await this.saveSession(session);
    }

    return sessionId;
  }

  // 继续会话
  async continueSession(sessionId: string): Promise<Session> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.currentSession = session;
    this.sessionHistory = [...session.messages];
    return session;
  }

  private sanitizePath(pathString: string): string {
    // 替换路径中的特殊字符，确保文件系统安全
    return pathString.replace(/[^a-zA-Z0-9\-_.]/g, '_');
  }
}

// 全局会话管理器实例
export const sessionManagerV2 = new SessionManagerV2();