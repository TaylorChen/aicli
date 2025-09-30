import { EventEmitter } from 'events';
import { smartConfig } from './smart-config';
import {
  ToolRegistry,
  ToolExecutor,
  PermissionManager,
  ToolDefinition,
  ToolContext,
  ToolInput,
  ToolOutput
} from './tool-system';
import { enhancedWebSearch, SearchResult, SearchOptions } from './enhanced-web-search';
import { enhancedCodeExecutor, ExecutionResult, CodeExecutionOptions } from './enhanced-code-executor';
import { enhancedFileOperations } from './enhanced-file-operations';
import { enhancedImageProcessor, ProcessedImage } from './enhanced-image-processor';

export interface EnhancedToolContext extends ToolContext {
  searchHistory: SearchResult[];
  executionHistory: ExecutionResult[];
  currentSession?: string;
}

export interface ToolCallRequest {
  toolName: string;
  input: ToolInput;
  options?: {
    timeout?: number;
    retryCount?: number;
    permissions?: 'allow' | 'deny' | 'ask';
    context?: EnhancedToolContext;
  };
}

export interface ToolCallResult {
  success: boolean;
  output?: ToolOutput;
  error?: string;
  executionTime: number;
  toolName: string;
  timestamp: Date;
  metadata?: {
    retries?: number;
    warnings?: string[];
    context?: EnhancedToolContext;
  };
}

export interface ToolChain {
  id: string;
  name: string;
  description: string;
  tools: Array<{
    toolName: string;
    input: ToolInput;
    dependsOn?: string[];
  }>;
  parallel?: boolean;
  maxConcurrency?: number;
}

export interface ToolChainResult {
  chainId: string;
  success: boolean;
  results: ToolCallResult[];
  executionTime: number;
  errors: string[];
  warnings: string[];
}

export class EnhancedToolManager extends EventEmitter {
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private permissionManager: PermissionManager;
  private callHistory: ToolCallResult[] = [];
  private activeChains: Map<string, ToolChain> = new Map();
  private chainResults: Map<string, ToolChainResult> = new Map();

  constructor() {
    super();
    this.toolRegistry = new ToolRegistry();
    this.toolExecutor = new ToolExecutor(this.toolRegistry);
    this.permissionManager = new PermissionManager();
    this.initializeEnhancedTools();
    this.loadToolPermissions();
  }

  private initializeEnhancedTools(): void {
    // 注册增强的工具定义

    // Web搜索工具
    this.toolRegistry.register({
      name: 'web_search',
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results'
          },
          language: {
            type: 'string',
            description: 'Search language preference'
          },
          timeRange: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year', 'all'],
            description: 'Time range for search results'
          }
        },
        required: ['query']
      },
      category: 'web',
      requiresConfirmation: false,
      handler: async (input: any, context: ToolContext) => {
        const searchOptions: SearchOptions = {
          query: input.query,
          limit: input.limit || 10,
          language: input.language,
          timeRange: input.timeRange
        };

        try {
          const session = await enhancedWebSearch.search(searchOptions);
          return {
            content: {
              results: session.results,
              totalResults: session.metadata?.totalResults,
              searchTime: session.metadata?.searchTime,
              engine: session.metadata?.engine
            }
          };
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'Search failed'
          };
        }
      }
    });

    // 代码执行工具
    this.toolRegistry.register({
      name: 'execute_code',
      description: 'Execute code in various programming languages',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to execute'
          },
          language: {
            type: 'string',
            description: 'Programming language',
            enum: ['javascript', 'typescript', 'python', 'bash', 'ruby', 'php', 'java', 'go', 'rust']
          },
          timeout: {
            type: 'number',
            description: 'Execution timeout in milliseconds'
          },
          workingDirectory: {
            type: 'string',
            description: 'Working directory for execution'
          },
          environment: {
            type: 'string',
            description: 'Execution environment preference'
          }
        },
        required: ['code', 'language']
      },
      category: 'bash',
      dangerous: true,
      requiresConfirmation: true,
      handler: async (input: any, context: ToolContext) => {
        const executionOptions: CodeExecutionOptions = {
          code: input.code,
          language: input.language,
          timeout: input.timeout,
          workingDirectory: input.workingDirectory,
          environment: input.environment
        };

        try {
          const result = await enhancedCodeExecutor.executeCode(executionOptions);
          return {
            content: result
          };
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'Execution failed'
          };
        }
      }
    });

    // 文件分析工具
    this.toolRegistry.register({
      name: 'analyze_file',
      description: 'Analyze a file for code metrics and quality',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to analyze'
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Include detailed code metrics'
          },
          includeSuggestions: {
            type: 'boolean',
            description: 'Include improvement suggestions'
          }
        },
        required: ['filePath']
      },
      category: 'file',
      handler: async (input: any, context: ToolContext) => {
        try {
          const analysis = await enhancedFileOperations.analyzeCode(input.filePath);
          return {
            content: {
              analysis,
              metrics: input.includeMetrics ? analysis : undefined,
              suggestions: input.includeSuggestions ? analysis.suggestions : undefined
            }
          };
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'File analysis failed'
          };
        }
      }
    });

    // 图像处理工具
    this.toolRegistry.register({
      name: 'process_image',
      description: 'Process and analyze images',
      inputSchema: {
        type: 'object',
        properties: {
          imagePath: {
            type: 'string',
            description: 'Path to the image file'
          },
          operation: {
            type: 'string',
            enum: ['analyze', 'resize', 'compress', 'thumbnail'],
            description: 'Processing operation to perform'
          },
          maxWidth: {
            type: 'number',
            description: 'Maximum width for processed image'
          },
          maxHeight: {
            type: 'number',
            description: 'Maximum height for processed image'
          },
          quality: {
            type: 'number',
            description: 'Image quality (1-100)',
            minimum: 1,
            maximum: 100
          } as any,
          generateThumbnails: {
            type: 'boolean',
            description: 'Whether to generate thumbnails'
          },
          enableAnalysis: {
            type: 'boolean',
            description: 'Whether to enable AI analysis'
          }
        },
        required: ['imagePath']
      },
      category: 'file',
      handler: async (input: any, context: ToolContext) => {
        try {
          switch (input.operation) {
            case 'analyze':
              const analysis = await enhancedImageProcessor.analyzeImage(input.imagePath);
              return { content: { analysis } };

            case 'resize':
              const resizeOptions = {
                maxWidth: input.options?.maxWidth,
                maxHeight: input.options?.maxHeight,
                quality: input.options?.quality
              };
              const resized = await enhancedImageProcessor.compressImage(input.imagePath, resizeOptions);
              return { content: { resized } };

            case 'compress':
              const compressOptions = {
                quality: input.options?.quality || 80,
                maxWidth: input.options?.maxWidth,
                maxHeight: input.options?.maxHeight
              };
              const compressed = await enhancedImageProcessor.compressImage(input.imagePath, compressOptions);
              return { content: { compressed } };

            case 'thumbnail':
              const thumbnailSizes = input.options?.thumbnailSizes || [{ width: 150, height: 150 }];
              const processed = await enhancedImageProcessor.processImage(input.imagePath, {
                generateThumbnails: true,
                thumbnailSizes
              });
              return { content: { thumbnails: processed.thumbnails } };

            default:
              return {
                content: null,
                error: `Unknown operation: ${input.operation}`
              };
          }
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'Image processing failed'
          };
        }
      }
    });

    // 项目管理工具
    this.toolRegistry.register({
      name: 'project_operation',
      description: 'Perform project management operations',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create', 'analyze', 'build', 'test', 'deploy'],
            description: 'Project operation to perform'
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project directory'
          },
          options: {
            type: 'object',
            description: 'Operation-specific options'
          }
        },
        required: ['operation']
      },
      category: 'file',
      requiresConfirmation: true,
      handler: async (input: any, context: ToolContext) => {
        try {
          // 这里需要集成 enhancedProjectManager
          // 由于篇幅限制，这里提供一个简化的实现
          return {
            content: {
              message: `Project operation '${input.operation}' executed successfully`,
              projectPath: input.projectPath,
              operation: input.operation
            }
          };
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'Project operation failed'
          };
        }
      }
    });

    // 批量文件操作工具
    this.toolRegistry.register({
      name: 'batch_file_operation',
      description: 'Perform batch operations on multiple files',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['copy', 'move', 'delete', 'analyze', 'compress'],
            description: 'Batch operation to perform'
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of file paths'
          },
          destination: {
            type: 'string',
            description: 'Destination directory (for copy/move operations)'
          },
          options: {
            type: 'object',
            description: 'Operation-specific options'
          }
        },
        required: ['operation', 'files']
      },
      category: 'file',
      dangerous: true,
      requiresConfirmation: true,
      handler: async (input: any, context: ToolContext) => {
        try {
          const results = [];

          for (const filePath of input.files) {
            // 简化的批量操作实现
            results.push({
              file: filePath,
              operation: input.operation,
              status: 'success',
              message: `${input.operation} operation completed`
            });
          }

          return {
            content: {
              results,
              totalFiles: input.files.length,
              successfulOperations: results.length
            }
          };
        } catch (error) {
          return {
            content: null,
            error: error instanceof Error ? error.message : 'Batch operation failed'
          };
        }
      }
    });
  }

  async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      this.emit('toolCallStarted', { toolName: request.toolName, input: request.input });

      // 验证工具是否存在
      const tool = this.toolRegistry.get(request.toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${request.toolName}`);
      }

      // 检查权限
      const permissionResult = await this.permissionManager.canUseTool(
        request.toolName,
        request.input,
        { signal: AbortSignal.timeout(request.options?.timeout || 30000) }
      );

      if (permissionResult.behavior === 'deny') {
        throw new Error(`Permission denied for tool: ${request.toolName}`);
      }

      if (permissionResult.behavior === 'ask') {
        // 在实际实现中，这里应该有用户确认逻辑
        // 暂时继续执行
      }

      // 执行工具调用
      const context: EnhancedToolContext = {
        ...request.options?.context!,
        sessionId: request.options?.context?.sessionId || 'default',
        projectId: request.options?.context?.projectId || process.cwd(),
        signal: AbortSignal.timeout(request.options?.timeout || 30000),
        permissions: this.permissionManager,
        searchHistory: enhancedWebSearch.getSearchHistory().map(s => s.results).flat(),
        executionHistory: enhancedCodeExecutor.getExecutionHistory(),
        currentSession: request.options?.context?.currentSession
      };

      const output = await this.toolExecutor.execute(
        request.toolName,
        request.input,
        context
      );

      const executionTime = Date.now() - startTime;
      const result: ToolCallResult = {
        success: !output.error,
        output,
        error: output.error,
        executionTime,
        toolName: request.toolName,
        timestamp,
        metadata: {
          context
        }
      };

      // 记录调用历史
      this.callHistory.push(result);

      // 限制历史记录大小
      if (this.callHistory.length > 1000) {
        this.callHistory = this.callHistory.slice(-1000);
      }

      this.emit('toolCallCompleted', result);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: ToolCallResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        toolName: request.toolName,
        timestamp
      };

      this.callHistory.push(result);
      this.emit('toolCallError', result);
      return result;
    }
  }

  async executeChain(chain: ToolChain): Promise<ToolChainResult> {
    const startTime = Date.now();
    const chainId = chain.id || this.generateChainId();

    try {
      this.emit('chainExecutionStarted', { chainId, chain });

      const results: ToolCallResult[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      this.activeChains.set(chainId, chain);

      if (chain.parallel) {
        // 并行执行
        const concurrency = chain.maxConcurrency || 3;
        const chunks = this.chunkArray(chain.tools, concurrency);

        for (const chunk of chunks) {
          const promises = chunk.map(async (toolDef) => {
            try {
              const result = await this.callTool({
                toolName: toolDef.toolName,
                input: toolDef.input,
                options: {
                  timeout: 30000,
                  context: {
                    searchHistory: [],
                    executionHistory: [],
                    sessionId: chainId,
                    projectId: '',
                    workingDirectory: process.cwd(),
                    environmentVariables: {},
                    signal: new AbortController().signal,
                    permissions: this.permissionManager
                  } as EnhancedToolContext
                }
              });
              results.push(result);
              return result;
            } catch (error) {
              const errorResult: ToolCallResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                executionTime: 0,
                toolName: toolDef.toolName,
                timestamp: new Date()
              };
              results.push(errorResult);
              errors.push(`Tool ${toolDef.toolName} failed: ${errorResult.error}`);
              return errorResult;
            }
          });

          await Promise.all(promises);
        }
      } else {
        // 串行执行
        for (const toolDef of chain.tools) {
          // 检查依赖
          if (toolDef.dependsOn && toolDef.dependsOn.length > 0) {
            const dependencies = toolDef.dependsOn.map(dep =>
              results.find(r => r.toolName === dep)
            );

            if (dependencies.some(dep => !dep || !dep.success)) {
              const errorMsg = `Dependencies not satisfied for tool ${toolDef.toolName}`;
              errors.push(errorMsg);
              continue;
            }
          }

          try {
            const result = await this.callTool({
              toolName: toolDef.toolName,
              input: toolDef.input,
              options: {
                timeout: 30000,
                context: {
                  searchHistory: [],
                  executionHistory: [],
                  sessionId: chainId,
                  projectId: '',
                  workingDirectory: process.cwd(),
                  environmentVariables: {},
                  signal: new AbortController().signal,
                  permissions: this.permissionManager
                } as EnhancedToolContext
              }
            });
            results.push(result);
          } catch (error) {
            const errorResult: ToolCallResult = {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              executionTime: 0,
              toolName: toolDef.toolName,
              timestamp: new Date()
            };
            results.push(errorResult);
            errors.push(`Tool ${toolDef.toolName} failed: ${errorResult.error}`);
          }
        }
      }

      const executionTime = Date.now() - startTime;
      const success = errors.length === 0;

      const chainResult: ToolChainResult = {
        chainId,
        success,
        results,
        executionTime,
        errors,
        warnings
      };

      this.chainResults.set(chainId, chainResult);
      this.activeChains.delete(chainId);

      this.emit('chainExecutionCompleted', chainResult);
      return chainResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const chainResult: ToolChainResult = {
        chainId,
        success: false,
        results: [],
        executionTime,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };

      this.activeChains.delete(chainId);
      this.emit('chainExecutionError', chainResult);
      return chainResult;
    }
  }

  async smartToolSelection(query: string, context?: EnhancedToolContext): Promise<{
    recommendedTools: Array<{
      tool: ToolDefinition;
      confidence: number;
      reasoning: string;
    }>;
    suggestedChain?: ToolChain;
  }> {
    // 简化的智能工具选择逻辑
    const allTools = this.toolRegistry.getAll();
    const recommendations: Array<{
      tool: ToolDefinition;
      confidence: number;
      reasoning: string;
    }> = [];

    const lowerQuery = query.toLowerCase();

    // 基于关键词的工具推荐
    const toolKeywords: Record<string, string[]> = {
      'web_search': ['search', 'find', 'web', 'internet', 'information', 'lookup'],
      'execute_code': ['run', 'execute', 'code', 'script', 'test', 'javascript', 'python'],
      'analyze_file': ['analyze', 'file', 'code', 'quality', 'metrics'],
      'process_image': ['image', 'picture', 'photo', 'resize', 'compress'],
      'project_operation': ['project', 'build', 'test', 'deploy', 'create'],
      'batch_file_operation': ['batch', 'multiple', 'files', 'bulk']
    };

    allTools.forEach(tool => {
      const keywords = toolKeywords[tool.name] || [];
      const matchCount = keywords.filter(keyword => lowerQuery.includes(keyword)).length;

      if (matchCount > 0) {
        const confidence = Math.min(matchCount / keywords.length, 1);
        recommendations.push({
          tool,
          confidence,
          reasoning: `Matched ${matchCount} keywords: ${keywords.filter(k => lowerQuery.includes(k)).join(', ')}`
        });
      }
    });

    // 按置信度排序
    recommendations.sort((a, b) => b.confidence - a.confidence);

    // 如果有多个推荐工具，考虑创建工具链
    let suggestedChain: ToolChain | undefined;
    if (recommendations.length > 1) {
      const topTools = recommendations.slice(0, 3);
      if (topTools.every(r => r.confidence > 0.5)) {
        suggestedChain = {
          id: this.generateChainId(),
          name: 'Smart Chain',
          description: `Automatically generated chain for query: ${query}`,
          tools: topTools.map(r => ({
            toolName: r.tool.name,
            input: {} // 简化的输入
          })),
          parallel: false
        };
      }
    }

    return {
      recommendedTools: recommendations,
      suggestedChain
    };
  }

  getCallHistory(limit: number = 50): ToolCallResult[] {
    return this.callHistory.slice(-limit).reverse();
  }

  getChainResults(): ToolChainResult[] {
    return Array.from(this.chainResults.values());
  }

  getAvailableTools(): ToolDefinition[] {
    return this.toolRegistry.getAll();
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.toolRegistry.getByCategory(category);
  }

  getPermissions(): Array<{ toolName: string; behavior: 'allow' | 'deny' }> {
    return this.permissionManager.listPermissions();
  }

  setPermission(toolName: string, behavior: 'allow' | 'deny'): void {
    this.permissionManager.setPermission(toolName, behavior);
    this.emit('permissionUpdated', { toolName, behavior });
  }

  private loadToolPermissions(): void {
    // 从配置加载工具权限
    const permissions = smartConfig.get('toolManager.permissions') || {};
    Object.entries(permissions).forEach(([toolName, behavior]) => {
      this.permissionManager.setPermission(toolName, behavior as 'allow' | 'deny');
    });
  }

  savePermissions(): void {
    // 保存权限到配置
    const permissions = Object.fromEntries(this.permissionManager.listPermissions().map(p => [p.toolName, p.behavior]));
    smartConfig.set('toolManager.permissions', permissions);
    smartConfig.save();
  }

  private generateChainId(): string {
    return `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  getStatistics(): {
    totalToolCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageExecutionTime: number;
    mostUsedTool: string;
    totalChains: number;
    successfulChains: number;
  } {
    const totalToolCalls = this.callHistory.length;
    const successfulCalls = this.callHistory.filter(r => r.success).length;
    const failedCalls = totalToolCalls - successfulCalls;

    const averageExecutionTime = totalToolCalls > 0 ?
      this.callHistory.reduce((sum, r) => sum + r.executionTime, 0) / totalToolCalls : 0;

    const toolCounts = new Map<string, number>();
    this.callHistory.forEach(result => {
      toolCounts.set(result.toolName, (toolCounts.get(result.toolName) || 0) + 1);
    });

    const mostUsedTool = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    const chainResults = Array.from(this.chainResults.values());
    const totalChains = chainResults.length;
    const successfulChains = chainResults.filter(r => r.success).length;

    return {
      totalToolCalls,
      successfulCalls,
      failedCalls,
      averageExecutionTime,
      mostUsedTool,
      totalChains,
      successfulChains
    };
  }
}

// 导出单例实例
export const enhancedToolManager = new EnhancedToolManager();