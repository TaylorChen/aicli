import { v4 as uuidv4 } from 'uuid';

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  content: unknown;
  error?: string;
}

export interface ToolContext {
  sessionId: string;
  projectId: string;
  signal: AbortSignal;
  permissions: PermissionManager;
}

export interface ToolDefinition<T extends ToolInput = ToolInput> {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
  handler: (input: T, context: ToolContext) => Promise<ToolOutput>;
  category?: 'file' | 'bash' | 'search' | 'web' | 'mcp' | 'agent';
  dangerous?: boolean;
  requiresConfirmation?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<T extends ToolInput>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool as ToolDefinition<ToolInput>);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAll(): ToolDefinition[] {
    return this.list();
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.list().filter(tool => tool.category === category);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async execute<T extends ToolInput>(
    toolName: string,
    input: T,
    context: ToolContext
  ): Promise<ToolOutput> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // 验证输入
    this.validateInput(tool, input);

    // 检查权限
    const permissionResult = await context.permissions.canUseTool(toolName, input, {
      signal: context.signal
    });

    if (permissionResult.behavior === 'deny') {
      throw new Error(`Permission denied for tool: ${toolName}`);
    }

    if (permissionResult.behavior === 'ask') {
      // 需要用户确认
      console.log(`\n🔒 Tool "${toolName}" requires confirmation:`);
      console.log(`Description: ${tool.description}`);
      console.log(`Input: ${JSON.stringify(input, null, 2)}`);

      // 在实际实现中，这里应该有用户确认逻辑
      // 暂时自动允许
    }

    try {
      const result = await tool.handler(input, context);
      return result;
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private validateInput(tool: ToolDefinition, input: ToolInput): void {
    const schema = tool.inputSchema;
    const inputObj = input as Record<string, unknown>;

    // 检查必需字段
    for (const field of schema.required) {
      if (!(field in inputObj)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // 检查字段类型
    for (const [field, value] of Object.entries(inputObj)) {
      const fieldSchema = schema.properties[field];
      if (fieldSchema) {
        this.validateFieldType(field, value, fieldSchema);
      }
    }
  }

  private validateFieldType(field: string, value: unknown, schema: any): void {
    if (schema.enum && !schema.enum.includes(value)) {
      throw new Error(`Field ${field} must be one of: ${schema.enum.join(', ')}`);
    }

    // 简化的类型检查
    const expectedType = schema.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType === 'array' && actualType !== 'array') {
      throw new Error(`Field ${field} must be an array`);
    }

    if (expectedType !== 'array' && actualType !== expectedType) {
      throw new Error(`Field ${field} must be of type ${expectedType}`);
    }
  }
}

export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask';
  reason?: string;
  suggestions?: PermissionUpdate[];
}

export interface PermissionUpdate {
  toolName: string;
  behavior: 'allow' | 'deny';
}

export class PermissionManager {
  private permissions = new Map<string, 'allow' | 'deny'>();
  private defaultBehavior: 'allow' | 'deny' | 'ask' = 'ask';

  setDefaultBehavior(behavior: 'allow' | 'deny' | 'ask'): void {
    this.defaultBehavior = behavior;
  }

  setGlobalMode(mode: 'normal' | 'auto' | 'plan'): void {
    if (mode === 'auto') {
      this.defaultBehavior = 'allow';
    } else if (mode === 'plan') {
      this.defaultBehavior = 'ask';
    } else {
      this.defaultBehavior = 'ask';
    }
  }

  setPermission(toolName: string, behavior: 'allow' | 'deny'): void {
    this.permissions.set(toolName, behavior);
  }

  reset(): void {
    this.permissions.clear();
    this.defaultBehavior = 'ask';
  }

  async canUseTool(
    toolName: string,
    input: ToolInput,
    options: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
    }
  ): Promise<PermissionResult> {
    // 检查明确权限
    const explicitPermission = this.permissions.get(toolName);
    if (explicitPermission) {
      return { behavior: explicitPermission };
    }

    // 使用默认行为
    return { behavior: this.defaultBehavior };
  }

  applyUpdates(updates: PermissionUpdate[]): void {
    for (const update of updates) {
      this.setPermission(update.toolName, update.behavior);
    }
  }

  listPermissions(): Array<{ toolName: string; behavior: 'allow' | 'deny' }> {
    return Array.from(this.permissions.entries()).map(([toolName, behavior]) => ({
      toolName,
      behavior
    }));
  }

  getPermission(toolName: string): 'allow' | 'deny' | undefined {
    return this.permissions.get(toolName);
  }
}

// 全局工具注册表
export const toolRegistry = new ToolRegistry();
export const permissionManager = new PermissionManager();

// 全局工具执行器
export const toolExecutor = new ToolExecutor(toolRegistry);