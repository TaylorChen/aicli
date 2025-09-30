import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { smartConfig } from './smart-config';

export interface ExecutionEnvironment {
  name: string;
  type: 'node' | 'python' | 'bash' | 'deno' | 'bun' | 'ruby' | 'php' | 'java' | 'go' | 'rust';
  command: string;
  args: string[];
  version?: string;
  available: boolean;
  path?: string;
}

export interface CodeExecutionOptions {
  code: string;
  language: string;
  environment?: string;
  timeout?: number;
  workingDirectory?: string;
  env?: Record<string, string>;
  runInBackground?: boolean;
  captureOutput?: boolean;
  stdin?: string;
  allowNetwork?: boolean;
  allowFileSystem?: boolean;
  maxMemory?: number;
}

export interface ExecutionResult {
  id: string;
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  signal?: string;
  executionTime: number;
  memoryUsage?: number;
  warnings?: string[];
  environment: string;
  language: string;
  timestamp: Date;
}

export interface ExecutionSession {
  id: string;
  code: string;
  language: string;
  environment: string;
  results: ExecutionResult[];
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  metadata?: {
    executionCount: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

export class EnhancedCodeExecutor extends EventEmitter {
  private environments: Map<string, ExecutionEnvironment> = new Map();
  private activeSessions: Map<string, ExecutionSession> = new Map();
  private executionHistory: ExecutionResult[] = [];
  private isExecuting: boolean = false;

  constructor() {
    super();
    this.initializeEnvironments();
    this.detectAvailableEnvironments();
  }

  private initializeEnvironments(): void {
    // 初始化支持的执行环境
    const baseEnvironments: ExecutionEnvironment[] = [
      {
        name: 'Node.js',
        type: 'node',
        command: 'node',
        args: ['-e', '{code}'],
        available: false
      },
      {
        name: 'Python',
        type: 'python',
        command: 'python3',
        args: ['-c', '{code}'],
        available: false
      },
      {
        name: 'Bash',
        type: 'bash',
        command: 'bash',
        args: ['-c', '{code}'],
        available: false
      },
      {
        name: 'Deno',
        type: 'deno',
        command: 'deno',
        args: ['eval', '{code}'],
        available: false
      },
      {
        name: 'Bun',
        type: 'bun',
        command: 'bun',
        args: ['eval', '{code}'],
        available: false
      },
      {
        name: 'Ruby',
        type: 'ruby',
        command: 'ruby',
        args: ['-e', '{code}'],
        available: false
      },
      {
        name: 'PHP',
        type: 'php',
        command: 'php',
        args: ['-r', '{code}'],
        available: false
      },
      {
        name: 'Java',
        type: 'java',
        command: 'java',
        args: ['-e', '{code}'],
        available: false
      },
      {
        name: 'Go',
        type: 'go',
        command: 'go',
        args: ['run', '{code}'],
        available: false
      },
      {
        name: 'Rust',
        type: 'rust',
        command: 'rustc',
        args: ['-e', '{code}'],
        available: false
      }
    ];

    baseEnvironments.forEach(env => {
      this.environments.set(env.type, env);
    });
  }

  private async detectAvailableEnvironments(): Promise<void> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    for (const [envType, env] of this.environments.entries()) {
      try {
        const { stdout } = await execAsync(`${env.command} --version`);
        env.available = true;
        env.path = env.command;

        // 尝试提取版本信息
        const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          env.version = versionMatch[1];
        }

        this.emit('environmentDetected', { type: envType, available: true, version: env.version });
      } catch (error) {
        env.available = false;
        this.emit('environmentDetectionFailed', { type: envType, error });
      }
    }
  }

  async executeCode(options: CodeExecutionOptions): Promise<ExecutionResult> {
    if (this.isExecuting && !options.runInBackground) {
      throw new Error('Already executing code');
    }

    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    try {
      this.isExecuting = true;
      this.emit('executionStarted', { executionId, ...options });

      const environment = this.getBestEnvironment(options.language, options.environment);

      if (!environment.available) {
        throw new Error(`Execution environment '${environment.name}' is not available`);
      }

      // 创建或获取执行会话
      let session = this.findOrCreateSession(options.code, options.language, environment.name);

      const result = await this.performExecution(executionId, options, environment);
      const executionTime = Date.now() - startTime;

      result.executionTime = executionTime;
      result.timestamp = new Date();

      // 更新会话
      session.results.push(result);
      session.metadata = this.calculateSessionMetadata(session);

      if (result.success) {
        session.status = 'completed';
      } else {
        session.status = 'failed';
      }

      session.endTime = new Date();
      this.activeSessions.set(session.id, session);

      // 添加到历史记录
      this.executionHistory.push(result);

      // 限制历史记录大小
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(-1000);
      }

      this.emit('executionCompleted', result);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: ExecutionResult = {
        id: executionId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        environment: options.environment || 'unknown',
        language: options.language,
        timestamp: new Date()
      };

      this.executionHistory.push(result);
      this.emit('executionError', result);
      return result;
    } finally {
      this.isExecuting = false;
    }
  }

  private async performExecution(
    executionId: string,
    options: CodeExecutionOptions,
    environment: ExecutionEnvironment
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || smartConfig.getWithDefault('execution.timeout', 30000);
      const workingDir = options.workingDirectory || process.cwd();
      const env = { ...process.env, ...options.env };

      // 准备命令参数
      const args = environment.args.map(arg =>
        arg.replace('{code}', options.code)
      );

      const child = spawn(environment.command, args, {
        cwd: workingDir,
        env,
        stdio: options.captureOutput !== false ? ['pipe', 'pipe', 'pipe'] : 'inherit',
        timeout
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      if (options.captureOutput !== false) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }

      child.on('exit', (code, signal) => {
        const result: ExecutionResult = {
          id: executionId,
          success: code === 0,
          exitCode: code || undefined,
          signal: signal || undefined,
          output: stdout.trim(),
          error: stderr.trim() || undefined,
          environment: environment.name,
          language: options.language,
          executionTime: 0, // 将在外部设置
          timestamp: new Date()
        };

        if (timedOut) {
          result.error = result.error || 'Execution timed out';
          result.success = false;
        }

        resolve(result);
      });

      child.on('error', (error) => {
        resolve({
          id: executionId,
          success: false,
          error: error.message,
          environment: environment.name,
          language: options.language,
          executionTime: 0,
          timestamp: new Date()
        });
      });

      // 超时处理
      child.on('timeout', () => {
        timedOut = true;
        child.kill('SIGTERM');
      });
    });
  }

  private getBestEnvironment(language: string, preferredEnvironment?: string): ExecutionEnvironment {
    // 语言到环境的映射
    const languageToEnv: Record<string, string[]> = {
      'javascript': ['node', 'deno', 'bun'],
      'typescript': ['deno', 'bun', 'node'],
      'python': ['python'],
      'bash': ['bash'],
      'shell': ['bash'],
      'ruby': ['ruby'],
      'php': ['php'],
      'java': ['java'],
      'go': ['go'],
      'rust': ['rust']
    };

    const envTypes = languageToEnv[language.toLowerCase()] || [preferredEnvironment || 'node'];

    // 优先使用指定的环境
    if (preferredEnvironment) {
      const env = this.environments.get(preferredEnvironment);
      if (env?.available) {
        return env;
      }
    }

    // 查找第一个可用的环境
    for (const envType of envTypes) {
      const env = this.environments.get(envType);
      if (env?.available) {
        return env;
      }
    }

    // 回退到默认环境
    const fallbackEnv = this.environments.get('bash');
    if (fallbackEnv?.available) {
      return fallbackEnv;
    }

    throw new Error('No suitable execution environment available');
  }

  private findOrCreateSession(code: string, language: string, environment: string): ExecutionSession {
    // 查找现有的会话（相同的代码和环境）
    for (const session of this.activeSessions.values()) {
      if (session.code === code && session.language === language &&
          session.environment === environment && session.status === 'running') {
        return session;
      }
    }

    // 创建新会话
    const session: ExecutionSession = {
      id: this.generateSessionId(),
      code,
      language,
      environment,
      results: [],
      startTime: new Date(),
      status: 'running'
    };

    this.activeSessions.set(session.id, session);
    this.emit('sessionCreated', session);
    return session;
  }

  private calculateSessionMetadata(session: ExecutionSession) {
    const results = session.results;
    const executionCount = results.length;
    const totalExecutionTime = results.reduce((sum, result) => sum + result.executionTime, 0);
    const averageExecutionTime = executionCount > 0 ? totalExecutionTime / executionCount : 0;
    const successRate = executionCount > 0 ?
      results.filter(r => r.success).length / executionCount : 0;

    return {
      executionCount,
      totalExecutionTime,
      averageExecutionTime,
      successRate
    };
  }

  async executeSnippet(snippet: {
    code: string;
    language: string;
    description?: string;
  }): Promise<ExecutionResult> {
    return this.executeCode({
      code: snippet.code,
      language: snippet.language,
      timeout: 10000, // 代码片段较短，使用较短超时
      captureOutput: true
    });
  }

  async executeFile(filePath: string, options?: {
    language?: string;
    environment?: string;
    timeout?: number;
    workingDirectory?: string;
    args?: string[];
  }): Promise<ExecutionResult> {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const extname = path.extname(filePath).toLowerCase();

    // 根据文件扩展名推断语言
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.sh': 'bash',
      '.rb': 'ruby',
      '.php': 'php',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust'
    };

    const language = options?.language || languageMap[extname] || 'javascript';

    return this.executeCode({
      code: content,
      language,
      environment: options?.environment,
      timeout: options?.timeout,
      workingDirectory: options?.workingDirectory || path.dirname(filePath)
    });
  }

  getAvailableEnvironments(): ExecutionEnvironment[] {
    return Array.from(this.environments.values()).filter(env => env.available);
  }

  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSession(sessionId: string): ExecutionSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  cancelSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session && session.status === 'running') {
      session.status = 'cancelled';
      session.endTime = new Date();
      this.emit('sessionCancelled', session);
      return true;
    }
    return false;
  }

  getExecutionHistory(limit: number = 50): ExecutionResult[] {
    return this.executionHistory.slice(-limit).reverse();
  }

  clearHistory(): void {
    this.executionHistory = [];
    this.emit('historyCleared');
  }

  getStatistics(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    mostUsedLanguage: string;
    mostUsedEnvironment: string;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(r => r.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;

    const averageExecutionTime = totalExecutions > 0 ?
      this.executionHistory.reduce((sum, r) => sum + r.executionTime, 0) / totalExecutions : 0;

    const languageCounts = new Map<string, number>();
    const environmentCounts = new Map<string, number>();

    this.executionHistory.forEach(result => {
      languageCounts.set(result.language, (languageCounts.get(result.language) || 0) + 1);
      environmentCounts.set(result.environment, (environmentCounts.get(result.environment) || 0) + 1);
    });

    const mostUsedLanguage = Array.from(languageCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    const mostUsedEnvironment = Array.from(environmentCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      mostUsedLanguage,
      mostUsedEnvironment
    };
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 安全检查
  validateCodeSafety(code: string, language: string): {
    safe: boolean;
    warnings: string[];
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const warnings: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    const lowerCode = code.toLowerCase();

    // 检查危险操作
    const dangerousPatterns = [
      /rm\s+-rf/i,    // 删除文件
      /format/i,      // 格式化
      /del\s+/i,      // 删除
      /shutdown/i,    // 关机
      /reboot/i,      // 重启
      /\.exec\(/i,    // 执行代码
      /eval\s*\(/i,   // 动态执行
      /system\s*\(/i, // 系统调用
      /exec\s*\(/i    // 执行命令
    ];

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(lowerCode)) {
        warnings.push(`检测到潜在危险操作: ${pattern}`);
        riskLevel = 'high';
      }
    });

    // 检查网络操作
    const networkPatterns = [
      /fetch\s*\(/i,
      /axios\./i,
      /request\s*\(/i,
      /http/i,
      /ftp/i,
      /socket/i
    ];

    networkPatterns.forEach(pattern => {
      if (pattern.test(lowerCode)) {
        warnings.push(`检测到网络操作: ${pattern}`);
        if (riskLevel === 'low') { riskLevel = 'medium'; }
      }
    });

    // 检查文件系统操作
    const fsPatterns = [
      /fs\./i,
      /require\s*\(['""]fs['""]\)/i,
      /import\s+.*fs/i,
      /open\s*\(/i,
      /read\s*file/i,
      /write\s*file/i
    ];

    fsPatterns.forEach(pattern => {
      if (pattern.test(lowerCode)) {
        warnings.push(`检测到文件系统操作: ${pattern}`);
        if (riskLevel === 'low') { riskLevel = 'medium'; }
      }
    });

    return {
      safe: riskLevel === 'low' || riskLevel === 'medium',
      warnings,
      riskLevel: riskLevel as 'low' | 'medium' | 'high'
    };
  }

  // 性能监控
  async benchmarkExecution(
    code: string,
    language: string,
    iterations: number = 10
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
    successRate: number;
  }> {
    const times: number[] = [];
    let successCount = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const result = await this.executeCode({
          code,
          language,
          timeout: 5000
        });

        if (result.success) {
          times.push(result.executionTime);
          successCount++;
        }
      } catch (error) {
        // 忽略基准测试中的错误
      }
    }

    const averageTime = times.length > 0 ?
      times.reduce((sum, time) => sum + time, 0) / times.length : 0;
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const successRate = successCount / iterations;

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      successRate
    };
  }
}

// 导出单例实例
export const enhancedCodeExecutor = new EnhancedCodeExecutor();