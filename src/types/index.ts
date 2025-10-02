export interface AIModel {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  apiKeyEnvVar: string;
}

export interface AICLIConfig {
  providers: AIProvider[];
  currentProvider: string;
  currentModel: string;
  theme: 'light' | 'dark';
  autoSave: boolean;
  sessionHistory: number;
}

export interface SlashCommand {
  name: string;
  description: string;
  action: (args: string[]) => Promise<void> | void;
  alias?: string[];
}

export interface FileAttachment {
  type: 'file' | 'image';
  filename: string;
  content: string | Buffer;
  mimeType?: string;
  size?: number;
  tempPath?: string;
}

export interface AttachmentSource {
  type: 'paste' | 'drag' | 'upload' | 'file';
  originalPath?: string;
  timestamp: Date;
}

export interface ManagedAttachment extends FileAttachment {
  id: string;
  source: AttachmentSource;
  isTempFile: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  attachments?: FileAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types that were in enhanced.ts
export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'move' | 'copy' | 'create' | 'rename';
  path: string;
  content?: string;
  oldPath?: string;
  timestamp: Date;
}

export interface SessionState {
  id: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  startTime: Date;
}

export interface StatusBarState {
  provider: string;
  model: string;
  isConnected: boolean;
  tokensUsed: number;
  streaming: boolean;
  lastResponseTime: Date;
}

export interface ProjectContext {
  rootPath: string;
  name: string;
  type: string;
  language: string;
  lastModified: Date;
  files: string[];
  dependencies: Record<string, string>;
  gitRepo: boolean;
  workspaceFiles: string[];
}

export interface StreamingResponse {
  content: string;
  done: boolean;
  error?: string;
  metadata?: Record<string, any>;
}