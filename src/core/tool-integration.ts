import { EventEmitter } from 'events';
import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'system' | 'development' | 'analysis' | 'utility';
  dangerous: boolean;
  parameters: ToolParameter[];
  handler: (params: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: any;
}

export interface ToolContext {
  cwd: string;
  env: Record<string, string>;
  session: any;
  history: string[];
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  executionTime: number;
}

export interface ToolExecutionOptions {
  timeout?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export class ToolIntegration extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private executionHistory: ToolExecutionRecord[] = [];
  private maxHistorySize = 100;

  constructor() {
    super();
    this.initializeBuiltInTools();
  }

  /**
   * 初始化内置工具
   */
  private initializeBuiltInTools(): void {
    // 文件系统工具
    this.registerTool({
      name: 'read_file',
      description: '读取文件内容',
      category: 'system',
      dangerous: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: '文件路径',
          required: true
        }
      ],
      handler: this.handleReadFile.bind(this)
    });

    this.registerTool({
      name: 'write_file',
      description: '写入文件内容',
      category: 'system',
      dangerous: true,
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: '文件路径',
          required: true
        },
        {
          name: 'content',
          type: 'string',
          description: '文件内容',
          required: true
        },
        {
          name: 'append',
          type: 'boolean',
          description: '是否追加模式',
          required: false,
          default: false
        }
      ],
      handler: this.handleWriteFile.bind(this)
    });

    this.registerTool({
      name: 'list_files',
      description: '列出目录内容',
      category: 'system',
      dangerous: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: '目录路径',
          required: false,
          default: '.'
        },
        {
          name: 'recursive',
          type: 'boolean',
          description: '是否递归列出',
          required: false,
          default: false
        }
      ],
      handler: this.handleListFiles.bind(this)
    });

    // 开发工具
    this.registerTool({
      name: 'execute_command',
      description: '执行系统命令',
      category: 'development',
      dangerous: true,
      parameters: [
        {
          name: 'command',
          type: 'string',
          description: '要执行的命令',
          required: true
        },
        {
          name: 'args',
          type: 'array',
          description: '命令参数',
          required: false,
          default: []
        },
        {
          name: 'cwd',
          type: 'string',
          description: '工作目录',
          required: false
        }
      ],
      handler: this.handleExecuteCommand.bind(this)
    });

    this.registerTool({
      name: 'npm_install',
      description: '安装npm包',
      category: 'development',
      dangerous: true,
      parameters: [
        {
          name: 'packages',
          type: 'array',
          description: '要安装的包列表',
          required: true
        },
        {
          name: 'dev',
          type: 'boolean',
          description: '是否作为开发依赖',
          required: false,
          default: false
        }
      ],
      handler: this.handleNpmInstall.bind(this)
    });

    // 分析工具
    this.registerTool({
      name: 'analyze_code',
      description: '分析代码文件',
      category: 'analysis',
      dangerous: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: '代码文件路径',
          required: true
        },
        {
          name: 'language',
          type: 'string',
          description: '编程语言',
          required: false
        }
      ],
      handler: this.handleAnalyzeCode.bind(this)
    });

    // 实用工具
    this.registerTool({
      name: 'search_text',
      description: '在文件中搜索文本',
      category: 'utility',
      dangerous: false,
      parameters: [
        {
          name: 'pattern',
          type: 'string',
          description: '搜索模式',
          required: true
        },
        {
          name: 'path',
          type: 'string',
          description: '搜索路径',
          required: false,
          default: '.'
        },
        {
          name: 'file_pattern',
          type: 'string',
          description: '文件匹配模式',
          required: false,
          default: '*'
        }
      ],
      handler: this.handleSearchText.bind(this)
    });
  }

  /**
   * 注册工具
   */
  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.emit('tool_registered', tool);
  }

  /**
   * 注销工具
   */
  public unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      this.emit('tool_unregistered', name);
    }
    return removed;
  }

  /**
   * 获取所有工具
   */
  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取指定分类的工具
   */
  public getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * 执行工具
   */
  public async executeTool(
    toolName: string,
    parameters: Record<string, any>,
    options: ToolExecutionOptions = {}
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具 ${toolName} 不存在`,
        executionTime: 0
      };
    }

    // 验证参数
    const validationError = this.validateParameters(tool, parameters);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        executionTime: 0
      };
    }

    // 危险工具确认
    if (tool.dangerous && !options.dryRun) {
      const confirmation = await this.requestConfirmation(tool, parameters);
      if (!confirmation) {
        return {
          success: false,
          error: '用户取消了操作',
          executionTime: 0
        };
      }
    }

    const startTime = Date.now();
    const executionRecord: ToolExecutionRecord = {
      toolName,
      parameters,
      startTime,
      status: 'running'
    };

    this.emit('tool_execution_started', executionRecord);

    try {
      const context: ToolContext = {
        cwd: process.cwd(),
        env: { ...process.env } as Record<string, string>,
        session: {},
        history: []
      };

      let result: ToolResult;

      if (options.dryRun) {
        result = {
          success: true,
          output: `[DRY RUN] 将要执行 ${toolName}，参数: ${JSON.stringify(parameters)}`,
          executionTime: 0
        };
      } else {
        result = await Promise.race([
          tool.handler(parameters, context),
          new Promise<ToolResult>((_, reject) =>
            setTimeout(() => reject(new Error('工具执行超时')), options.timeout || 30000)
          )
        ]);
      }

      result.executionTime = Date.now() - startTime;

      executionRecord.endTime = Date.now();
      executionRecord.status = result.success ? 'completed' : 'failed';
      executionRecord.result = result;

      this.addToHistory(executionRecord);
      this.emit('tool_execution_completed', executionRecord);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: ToolResult = {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        executionTime
      };

      executionRecord.endTime = Date.now();
      executionRecord.status = 'failed';
      executionRecord.result = result;

      this.addToHistory(executionRecord);
      this.emit('tool_execution_failed', executionRecord);

      return result;
    }
  }

  /**
   * 验证参数
   */
  private validateParameters(tool: ToolDefinition, parameters: Record<string, any>): string | null {
    for (const param of tool.parameters) {
      if (param.required && !(param.name in parameters)) {
        return `缺少必需参数: ${param.name}`;
      }

      if (param.name in parameters) {
        const value = parameters[param.name];
        const expectedType = param.type;

        // 简单的类型检查
        if (expectedType === 'number' && typeof value !== 'number') {
          return `参数 ${param.name} 应该是数字类型`;
        }
        if (expectedType === 'boolean' && typeof value !== 'boolean') {
          return `参数 ${param.name} 应该是布尔类型`;
        }
        if (expectedType === 'array' && !Array.isArray(value)) {
          return `参数 ${param.name} 应该是数组类型`;
        }
      }
    }

    return null;
  }

  /**
   * 请求用户确认
   */
  private async requestConfirmation(tool: ToolDefinition, parameters: Record<string, any>): Promise<boolean> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const question = chalk.yellow(`⚠️  工具 "${tool.name}" 可能具有危险性。\n`);
      const paramsInfo = chalk.gray(`参数: ${JSON.stringify(parameters, null, 2)}\n`);
      rl.question(question + paramsInfo + chalk.red('确定要继续吗？ (y/N): '), (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * 添加到执行历史
   */
  private addToHistory(record: ToolExecutionRecord): void {
    this.executionHistory.push(record);

    // 限制历史记录大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 获取执行历史
   */
  public getExecutionHistory(limit?: number): ToolExecutionRecord[] {
    const history = this.executionHistory.slice().reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 工具处理器实现
   */

  private async handleReadFile(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      return {
        success: true,
        output: content,
        executionTime: 0
      };
    } catch (error) {
      return {
        success: false,
        error: `读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        executionTime: 0
      };
    }
  }

  private async handleWriteFile(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      const flag = params.append ? 'a' : 'w';
      await fs.writeFile(params.path, params.content, { flag });
      return {
        success: true,
        output: `文件已写入: ${params.path}`,
        executionTime: 0
      };
    } catch (error) {
      return {
        success: false,
        error: `写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        executionTime: 0
      };
    }
  }

  private async handleListFiles(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      const items = await fs.readdir(params.path, { withFileTypes: true });
      let result = '';

      for (const item of items) {
        const type = item.isDirectory() ? '📁' : item.isFile() ? '📄' : '🔗';
        result += `${type} ${item.name}\n`;
      }

      return {
        success: true,
        output: result,
        executionTime: 0
      };
    } catch (error) {
      return {
        success: false,
        error: `列出目录失败: ${error instanceof Error ? error.message : '未知错误'}`,
        executionTime: 0
      };
    }
  }

  private async handleExecuteCommand(params: any, context: ToolContext): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn(params.command, params.args || [], {
        cwd: params.cwd || context.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: context.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const output = code === 0 ? stdout : stderr;
        resolve({
          success: code === 0,
          output: output || `命令退出，代码: ${code}`,
          executionTime: 0
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: `执行命令失败: ${error.message}`,
          executionTime: 0
        });
      });
    });
  }

  private async handleNpmInstall(params: any, context: ToolContext): Promise<ToolResult> {
    const flag = params.dev ? '--save-dev' : '--save';
    const packages = params.packages.join(' ');
    return this.handleExecuteCommand({
      command: 'npm',
      args: ['install', flag, ...params.packages]
    }, context);
  }

  private async handleAnalyzeCode(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      const lines = content.split('\n').length;
      const chars = content.length;

      const analysis = `
文件: ${params.path}
语言: ${params.language || '自动检测'}
行数: ${lines}
字符数: ${chars}
`;

      return {
        success: true,
        output: analysis,
        executionTime: 0
      };
    } catch (error) {
      return {
        success: false,
        error: `分析代码失败: ${error instanceof Error ? error.message : '未知错误'}`,
        executionTime: 0
      };
    }
  }

  private async handleSearchText(params: any, context: ToolContext): Promise<ToolResult> {
    // 简化的文本搜索实现
    return {
      success: false,
      error: '文本搜索功能尚未实现',
      executionTime: 0
    };
  }
}

export interface ToolExecutionRecord {
  toolName: string;
  parameters: Record<string, any>;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  result?: ToolResult;
}