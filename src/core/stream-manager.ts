import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { SessionMessage, SessionManagerV2 } from './session-manager-v2';
import { ToolRegistry, PermissionManager, ToolContext } from './tool-system';
import { projectContext } from './project-context';
import { createAIService } from '../services/ai';

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'status';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  toolResult?: {
    id: string;
    result: any;
    error?: string;
  };
  error?: string;
  status?: {
    type: 'thinking' | 'executing' | 'completed' | 'failed';
    message: string;
  };
}

export interface StreamState {
  isStreaming: boolean;
  currentMessage: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: any;
    error?: string;
  }>;
  status: 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';
  currentTool?: string;
  tokensUsed: number;
  startTime: Date;
}

export class StreamManager {
  private streamState: StreamState = {
    isStreaming: false,
    currentMessage: '',
    toolCalls: [],
    status: 'idle',
    tokensUsed: 0,
    startTime: new Date()
  };

  private subscribers: Array<(chunk: StreamChunk) => void> = [];

  subscribe(callback: (chunk: StreamChunk) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  private emit(chunk: StreamChunk): void {
    this.subscribers.forEach(callback => callback(chunk));
  }

  getState(): StreamState {
    return { ...this.streamState };
  }

  reset(): void {
    this.streamState = {
      isStreaming: false,
      currentMessage: '',
      toolCalls: [],
      status: 'idle',
      tokensUsed: 0,
      startTime: new Date()
    };
  }

  async processMessage(
    message: string,
    options: {
      toolRegistry: ToolRegistry;
      permissionManager: PermissionManager;
      sessionManager: SessionManagerV2;
      projectId: string;
      provider?: string;
      model?: string;
    }
  ): Promise<void> {
    const { toolRegistry, permissionManager, sessionManager, projectId, provider, model } = options;

    // 防止重复处理
    if (this.streamState.isStreaming) {
      console.warn('Already processing a message, ignoring duplicate request');
      return;
    }

    this.streamState = {
      isStreaming: true,
      currentMessage: '',
      toolCalls: [],
      status: 'thinking',
      tokensUsed: 0,
      startTime: new Date()
    };

    // 检查是否有活动会话，如果没有则创建一个
    let currentSession = sessionManager.getCurrentSession();
    if (!currentSession) {
      currentSession = await sessionManager.createSession(projectId, {
        title: `Conversation ${new Date().toLocaleString()}`
      });
    }

    // 添加用户消息到会话
    await sessionManager.addMessage({
      role: 'user',
      content: message,
      tool_calls: []
    });

    this.emit({
      type: 'status',
      status: {
        type: 'thinking',
        message: '正在思考...'
      }
    });

    try {
      // 获取 AI 提供商和模型
      const currentProvider = provider || config.get('currentProvider');
      const currentModel = model || config.get('currentModel');

      if (!currentProvider || !currentModel) {
        throw new Error('未配置 AI 提供商或模型');
      }

      // 准备上下文
      const currentSession = sessionManager.getCurrentSession();
      const context = await projectContext.detectProject();

      // 构建系统提示
      const systemPrompt = `你是一个 AI 编程助手，类似于 Claude Code CLI。你的任务是帮助用户完成编程任务。

当前项目信息：
- 项目类型: ${context.type}
- 项目根目录: ${context.rootPath}
- 文件数量: ${context.files.length}
- 依赖包: ${Object.keys(context.dependencies).join(', ')}

可用工具:
${toolRegistry.getAll().map((tool: any) => `- ${tool.name}: ${tool.description}`).join('\n')}

工具调用规则：
1. 只在必要时调用工具
2. 调用工具前会请求用户确认
3. 工具调用格式为：<function_calls><invoke name="tool_name"><parameter name="param">value</parameter></invoke></function_calls>

请用中文回答用户问题。`;

      // 构建 AI 请求
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...(currentSession?.messages || []).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      // 获取 AI 响应（模拟流式）
      const aiResponse = await this.streamAIResponse(currentProvider, currentModel, messages);

      // 处理 AI 响应
      await this.processAIResponse(aiResponse, {
        toolRegistry,
        permissionManager,
        sessionManager
      });

    } catch (error) {
      this.emit({
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      });

      this.streamState.status = 'failed';
      this.emit({
        type: 'status',
        status: {
          type: 'failed',
          message: '处理失败'
        }
      });
    } finally {
      this.streamState.isStreaming = false;
      this.streamState.status = 'completed';

      this.emit({
        type: 'status',
        status: {
          type: 'completed',
          message: '处理完成'
        }
      });
    }
  }

  private async streamAIResponse(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      // 防止重复处理
      if (this.streamState.status === 'executing') {
        console.warn('Stream already in progress, skipping duplicate AI call');
        return this.streamState.currentMessage || '正在处理中...';
      }

      // 创建 AI 服务
      const aiService = createAIService();

      // 转换消息格式
      const chatMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: new Date()
      }));

      // 调用 AI API
      const response = await aiService.sendMessage(chatMessages, model);

      return response.content;
    } catch (error) {
      // 如果 AI 服务调用失败，回退到智能响应
      console.warn('AI API call failed, falling back to smart response:', error);
      const userMessage = messages.filter(msg => msg.role === 'user').pop()?.content || '';
      return this.generateSmartResponse(userMessage);
    }
  }

  private generateSmartResponse(userInput: string): string {
    const input = userInput.toLowerCase().trim();

    // 日期和时间相关
    if (input.includes('今天是') || input.includes('几号') || input.includes('日期') || input.includes('时间')) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('zh-CN');
      const timeStr = now.toLocaleTimeString('zh-CN');
      const weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
      return `今天是 ${dateStr}，星期${weekDay}，现在时间是 ${timeStr}。`;
    }

    // 天气相关
    if (input.includes('天气')) {
      return '抱歉，我目前无法获取实时天气信息。建议你查看天气应用或网站获取准确的天气预报。';
    }

    // 计算器相关
    if (input.includes('计算') || input.includes('+') || input.includes('-') || input.includes('*') || input.includes('/')) {
      return '我可以帮你进行计算。请提供具体的数学表达式，比如 "计算 2+2" 或 "100 * 5"。';
    }

    // 编程相关
    if (input.includes('代码') || input.includes('编程') || input.includes('程序') || input.includes('开发')) {
      return '我可以帮助你完成各种编程任务！我可以：\n• 分析代码结构和问题\n• 编写新的代码片段\n• 重构和优化代码\n• 调试和修复错误\n• 解释代码逻辑\n\n请告诉我你想要完成什么编程任务？';
    }

    // 文件操作相关
    if (input.includes('文件') || input.includes('读取') || input.includes('写入') || input.includes('编辑')) {
      return '我可以帮你操作文件！我可以：\n• 读取文件内容\n• 创建新文件\n• 编辑现有文件\n• 搜索文件内容\n• 批量处理文件\n\n请告诉我你想要进行什么文件操作？';
    }

    // 系统相关
    if (input.includes('系统') || input.includes('命令') || input.includes('终端') || input.includes('bash')) {
      return '我可以帮你执行系统命令！我可以：\n• 运行 bash 命令\n• 查看进程状态\n• 管理文件系统\n• 网络操作\n• 系统信息查询\n\n请告诉我你想要执行什么操作？';
    }

    // 帮助相关
    if (input.includes('帮助') || input.includes('help') || input.includes('功能')) {
      return '我是 AICLI，一个强大的 AI 编程助手！我的主要功能包括：\n\n📋 **基础功能**：\n• 智能对话和问答\n• 代码分析和优化\n• 编程问题解答\n\n🛠️ **工具系统**：\n• 文件读写和编辑\n• bash 命令执行\n• 代码搜索和替换\n• 项目管理\n\n💡 **使用技巧**：\n• 输入 /help 查看所有命令\n• 使用 Tab 键自动补全\n• 按 Ctrl+C 退出程序\n\n有什么具体问题我可以帮你解决吗？';
    }

    // 问候相关
    if (input.includes('你好') || input.includes('hi') || input.includes('hello') || input.includes('您好')) {
      return '你好！很高兴见到你！我是 AICLI，你的专属 AI 编程助手。我可以帮助你完成各种编程任务，包括代码分析、文件操作、命令执行等。\n\n有什么我可以帮助你的吗？';
    }

    // 询问 AI 相关
    if (input.includes('你是') || input.includes('谁') || input.includes('什么')) {
      return '我是 AICLI，一个功能强大的 AI 编程助手终端工具。我类似于 Claude Code CLI，可以帮助你完成各种编程任务。\n\n我的特点：\n• 支持多种 AI 模型（Claude、DeepSeek、OpenAI 等）\n• 内置丰富的工具系统\n• 支持会话管理和历史记录\n• 类似 VS Code 的界面体验\n\n有什么编程问题我可以帮你解决吗？';
    }

    // 默认响应
    return '我理解了你的问题。作为 AI 编程助手，我可以帮助你完成各种编程相关的任务。请告诉我具体你想要做什么，我会尽力协助你！\n\n比如：\n• "帮我分析这段代码"\n• "创建一个新的 Python 文件"\n• "查看当前目录的文件"\n• "解释这个函数的作用"';
  }

  private async processAIResponse(
    response: string,
    options: {
      toolRegistry: ToolRegistry;
      permissionManager: PermissionManager;
      sessionManager: SessionManagerV2;
    }
  ): Promise<void> {
    const { toolRegistry, permissionManager, sessionManager } = options;

    // 解析工具调用
    const toolCalls = this.parseToolCalls(response);

    if (toolCalls.length === 0) {
      // 没有工具调用，直接发送响应并返回
      this.streamState.currentMessage = response;
      this.emit({
        type: 'content',
        content: response
      });

      // 添加消息到会话
      await sessionManager.addMessage({
        role: 'assistant',
        content: response,
        tool_calls: []
      });
      return;
    }

    // 处理工具调用
    for (const toolCall of toolCalls) {
      this.emit({
        type: 'tool_call',
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input
        }
      });

      this.streamState.status = 'executing';
      this.streamState.currentTool = toolCall.name;

      this.emit({
        type: 'status',
        status: {
          type: 'executing',
          message: `正在执行工具: ${toolCall.name}`
        }
      });

      try {
        // 检查权限
        const permission = await permissionManager.getPermission(toolCall.name);

        if (permission === 'deny') {
          throw new Error(`工具 ${toolCall.name} 被拒绝访问`);
        }

        // 执行工具
        const context: ToolContext = {
          projectId: process.cwd(),
          sessionId: sessionManager.getCurrentSession()?.metadata.sessionId || '',
          signal: new AbortController().signal,
          permissions: permissionManager
        };

        const tool = toolRegistry.get(toolCall.name);
        if (!tool) {
          throw new Error(`工具 ${toolCall.name} 不存在`);
        }

        const result = await tool.handler(toolCall.input, context);

        this.emit({
          type: 'tool_result',
          toolResult: {
            id: toolCall.id,
            result: result.content
          }
        });

        // 添加工具调用结果到会话
        this.streamState.toolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          result: result.content
        });

      } catch (error) {
        this.emit({
          type: 'tool_result',
          toolResult: {
            id: toolCall.id,
            result: null,
            error: error instanceof Error ? error.message : '工具执行失败'
          }
        });

        this.streamState.toolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          result: undefined,
          error: error instanceof Error ? error.message : '工具执行失败'
        });
      }
    }

    // 生成最终响应
    const finalResponse = this.generateFinalResponse(response, toolCalls);
    this.streamState.currentMessage = finalResponse;

    this.emit({
      type: 'content',
      content: finalResponse
    });

    // 添加完整消息到会话
    await sessionManager.addMessage({
      role: 'assistant',
      content: finalResponse,
      tool_calls: this.streamState.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
        output: tc.result,
        error: tc.error
      }))
    });
  }

  private parseToolCalls(text: string): Array<{ id: string; name: string; input: Record<string, unknown> }> {
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    // 简单的工具调用解析
    const toolCallPattern = /<function_calls><invoke name="([^"]+)">(.*?)<\/invoke><\/function_calls>/g;
    let match;

    while ((match = toolCallPattern.exec(text)) !== null) {
      const name = match[1];
      const paramsMatch = match[2];
      const input: Record<string, unknown> = {};

      // 解析参数
      const paramPattern = /<parameter name="([^"]+)">(.*?)<\/parameter>/g;
      let paramMatch;

      while ((paramMatch = paramPattern.exec(paramsMatch)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2];

        try {
          input[paramName] = JSON.parse(paramValue);
        } catch {
          input[paramName] = paramValue;
        }
      }

      toolCalls.push({
        id: uuidv4(),
        name,
        input
      });
    }

    return toolCalls;
  }

  private generateFinalResponse(originalResponse: string, toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>): string {
    if (toolCalls.length === 0) {
      return originalResponse;
    }

    // 清理工具调用标记
    let cleanResponse = originalResponse.replace(/<function_calls>.*?<\/function_calls>/g, '');

    // 添加工具执行结果
    toolCalls.forEach(toolCall => {
      const toolResult = this.streamState.toolCalls.find(tc => tc.id === toolCall.id);
      if (toolResult) {
        if (toolResult.error) {
          cleanResponse += `\n\n❌ 工具 ${toolCall.name} 执行失败: ${toolResult.error}`;
        } else {
          cleanResponse += `\n\n✅ 工具 ${toolCall.name} 执行成功`;
          if (toolResult.result) {
            cleanResponse += `\n${toolResult.result}`;
          }
        }
      }
    });

    return cleanResponse.trim();
  }

  // 同步处理消息 - 用于打印模式
  async processMessageSync(message: string, options: any): Promise<any> {
    const startTime = Date.now();
    let turns = 0;
    let toolsUsed: string[] = [];

    try {
      const currentProvider = config.getCurrentProvider();
      if (!currentProvider) {
        throw new Error('未配置AI提供商');
      }

      const currentModel = config.get('currentModel');

      // 检查是否有活动会话，如果没有则创建一个
      let currentSession = options.sessionManager.getCurrentSession();
      if (!currentSession) {
        currentSession = await options.sessionManager.createSession(options.projectId, {
          title: `CLI Session ${new Date().toLocaleString()}`
        });
      }

      // 构建上下文
      const context = await projectContext.detectProject();
      const systemPrompt = this.buildSystemPrompt(context, currentProvider, options);

      // 构建消息
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...(currentSession?.messages || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user' as const, content: message }
      ];

      // 获取AI响应
      const aiResponse = await this.streamAIResponse(currentProvider.name, currentModel, messages);
      turns = 1;

      // 处理响应并收集结果
      let fullResponse = '';
      const originalEmit = this.emit;

      try {
        // 直接处理AI响应并等待完成
        await this.processAIResponse(aiResponse, {
          toolRegistry: options.toolRegistry,
          permissionManager: options.permissionManager,
          sessionManager: options.sessionManager
        });

        return {
          content: this.streamState.currentMessage || 'No response',
          turns,
          toolsUsed: [...new Set(toolsUsed)],
          duration: Date.now() - startTime
        };
      } catch (error) {
        // 如果处理失败，使用智能响应
        const fallbackResponse = this.generateSmartResponse(message);

        // 只添加助手响应到会话（用户消息已经在processMessage中添加过）
        try {
          await options.sessionManager.addMessage({
            role: 'assistant',
            content: fallbackResponse,
            tool_calls: []
          });
        } catch (sessionError) {
          console.warn('Failed to add assistant message to session:', sessionError);
        }

        return {
          content: fallbackResponse,
          turns: 1,
          toolsUsed: [],
          duration: Date.now() - startTime
        };
      }

    } catch (error) {
      // 返回fallback响应
      const fallbackResponse = this.generateSmartResponse(message);

      // 添加用户消息和助手响应到会话
      try {
        await options.sessionManager.addMessage({
          role: 'user',
          content: message,
          tool_calls: []
        });

        await options.sessionManager.addMessage({
          role: 'assistant',
          content: fallbackResponse,
          tool_calls: []
        });
      } catch (sessionError) {
        console.warn('Failed to add messages to session:', sessionError);
      }

      return {
        content: fallbackResponse,
        turns: 1,
        toolsUsed: [],
        duration: Date.now() - startTime
      };
    }
  }

  private buildSystemPrompt(context: any, provider: any, options: any): string {
    let systemPrompt = `你是一个AI编程助手，基于 ${provider.name} 的 ${options.model || config.get('currentModel')} 模型。

项目信息:
- 项目类型: ${context.type}
- 项目根目录: ${context.rootPath}
- 文件数量: ${context.files.length}

可用工具:
${options.toolRegistry.getAll().map((tool: any) => `- ${tool.name}: ${tool.description}`).join('\n')}`;

    if (options.systemPrompt) {
      systemPrompt += `\n\n附加系统提示:\n${options.systemPrompt}`;
    }

    if (options.maxTurns) {
      systemPrompt += `\n\n最大对话轮数: ${options.maxTurns}`;
    }

    systemPrompt += '\n\n请用中文回答用户问题。';

    return systemPrompt;
  }
}

export const streamManager = new StreamManager();