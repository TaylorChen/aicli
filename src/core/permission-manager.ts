#!/usr/bin/env node

export type PermissionMode = 'default' | 'plan' | 'execute' | 'dangerous';

export interface ToolPermission {
  name: string;
  allowed: boolean;
  reason?: string;
  parameters?: string[];
}

export class PermissionManager {
  private allowedTools: Set<string>;
  private disallowedTools: Set<string>;
  private permissionMode: PermissionMode;
  private dangerouslySkipPermissions: boolean;
  private workingDirectories: Set<string>;

  constructor(options: {
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: PermissionMode;
    dangerouslySkipPermissions?: boolean;
    additionalDirectories?: string[];
  } = {}) {
    this.allowedTools = new Set();
    this.disallowedTools = new Set();
    this.permissionMode = options.permissionMode || 'default';
    this.dangerouslySkipPermissions = options.dangerouslySkipPermissions || false;
    this.workingDirectories = new Set();

    this.parseToolList(options.allowedTools, true);
    this.parseToolList(options.disallowedTools, false);

    if (options.additionalDirectories) {
      options.additionalDirectories.forEach(dir => {
        try {
          const absolutePath = require('path').resolve(dir);
          if (require('fs').existsSync(absolutePath)) {
            this.workingDirectories.add(absolutePath);
          }
        } catch (error) {
          console.warn(`Warning: Cannot access directory ${dir}: ${error}`);
        }
      });
    }
  }

  private parseToolList(toolList: string | undefined, isAllowed: boolean): void {
    if (!toolList) return;

    const tools = toolList.split(',').map(tool => tool.trim().replace(/['"]/g, ''));
    const targetSet = isAllowed ? this.allowedTools : this.disallowedTools;

    for (const tool of tools) {
      // 支持通配符，如 "Bash(git log:*)"
      if (tool.includes('(') && tool.includes(')')) {
        const match = tool.match(/^(\w+)\(([^)]*)\)$/);
        if (match) {
          const [, toolName, params] = match;
          targetSet.add(`${toolName}(${params})`);
        } else {
          targetSet.add(tool);
        }
      } else {
        targetSet.add(tool);
      }
    }
  }

  // 检查工具是否被允许
  isToolAllowed(toolName: string, parameters?: any): ToolPermission {
    // 如果跳过权限检查
    if (this.dangerouslySkipPermissions) {
      return {
        name: toolName,
        allowed: true,
        reason: 'Permissions skipped'
      };
    }

    // 首先检查明确禁止的工具
    for (const disallowedTool of this.disallowedTools) {
      if (this.matchesToolPattern(toolName, parameters, disallowedTool)) {
        return {
          name: toolName,
          allowed: false,
          reason: `Tool ${disallowedTool} is disallowed`
        };
      }
    }

    // 然后检查明确允许的工具
    for (const allowedTool of this.allowedTools) {
      if (this.matchesToolPattern(toolName, parameters, allowedTool)) {
        return {
          name: toolName,
          allowed: true,
          reason: `Tool ${allowedTool} is explicitly allowed`
        };
      }
    }

    // 如果有允许列表，未列出的工具默认禁止
    if (this.allowedTools.size > 0) {
      return {
        name: toolName,
        allowed: false,
        reason: 'Tool not in allowed list'
      };
    }

    // 默认根据权限模式决定
    return this.checkPermissionMode(toolName);
  }

  private matchesToolPattern(toolName: string, parameters: any, pattern: string): boolean {
    // 简单名称匹配
    if (pattern === toolName) {
      return true;
    }

    // 带参数的模式匹配，如 "Bash(git log:*)"
    if (pattern.includes('(') && pattern.includes(')')) {
      const match = pattern.match(/^(\w+)\(([^)]*)\)$/);
      if (!match) return false;

      const [, patternToolName, patternParams] = match;

      if (patternToolName !== toolName) {
        return false;
      }

      // 简单的参数匹配
      if (patternParams === '*') {
        return true;
      }

      if (parameters && typeof parameters === 'object') {
        const paramStr = Object.entries(parameters)
          .map(([key, value]) => `${key}:${value}`)
          .join(' ');

        // 支持通配符匹配
        if (patternParams.includes('*')) {
          const regex = new RegExp(patternParams.replace(/\*/g, '.*'));
          return regex.test(paramStr);
        }

        return paramStr.includes(patternParams);
      }
    }

    return false;
  }

  private checkPermissionMode(toolName: string): ToolPermission {
    switch (this.permissionMode) {
      case 'plan':
        if (this.isToolSafeForPlanning(toolName)) {
          return {
            name: toolName,
            allowed: true,
            reason: 'Allowed in plan mode'
          };
        }
        break;

      case 'execute':
        if (this.isToolSafeForExecution(toolName)) {
          return {
            name: toolName,
            allowed: true,
            reason: 'Allowed in execute mode'
          };
        }
        break;

      case 'dangerous':
        // 危险模式允许所有工具
        return {
          name: toolName,
          allowed: true,
          reason: 'Allowed in dangerous mode'
        };

      default:
        // 默认模式允许大多数安全工具
        if (this.isGenerallySafeTool(toolName)) {
          return {
            name: toolName,
            allowed: true,
            reason: 'Generally safe tool'
          };
        }
    }

    return {
      name: toolName,
      allowed: false,
      reason: `Not allowed in ${this.permissionMode} mode`
    };
  }

  private isToolSafeForPlanning(toolName: string): boolean {
    const planningSafeTools = [
      'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task'
    ];
    return planningSafeTools.includes(toolName);
  }

  private isToolSafeForExecution(toolName: string): boolean {
    const executionSafeTools = [
      'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task',
      'Edit', 'Write', 'TodoWrite', 'SlashCommand',
      'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git status:*)'
    ];
    return executionSafeTools.some(tool => toolName.startsWith(tool.split('(')[0]));
  }

  private isGenerallySafeTool(toolName: string): boolean {
    const safeTools = [
      'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task',
      'Edit', 'Write', 'TodoWrite', 'SlashCommand'
    ];
    return safeTools.includes(toolName);
  }

  // 检查文件路径是否在允许的工作目录内
  isPathAllowed(filePath: string): boolean {
    const absolutePath = require('path').resolve(filePath);

    // 如果没有额外的目录限制，允许当前目录
    if (this.workingDirectories.size === 0) {
      return true;
    }

    // 检查是否在允许的目录内
    for (const allowedDir of this.workingDirectories) {
      if (absolutePath.startsWith(allowedDir)) {
        return true;
      }
    }

    return false;
  }

  // 获取权限摘要
  getPermissionSummary(): {
    mode: PermissionMode;
    dangerouslySkipped: boolean;
    allowedTools: string[];
    disallowedTools: string[];
    workingDirectories: string[];
  } {
    return {
      mode: this.permissionMode,
      dangerouslySkipped: this.dangerouslySkipPermissions,
      allowedTools: Array.from(this.allowedTools),
      disallowedTools: Array.from(this.disallowedTools),
      workingDirectories: Array.from(this.workingDirectories)
    };
  }

  // 更新权限设置
  updateSettings(settings: {
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: PermissionMode;
    dangerouslySkipPermissions?: boolean;
  }): void {
    if (settings.allowedTools !== undefined) {
      this.allowedTools.clear();
      this.parseToolList(settings.allowedTools, true);
    }

    if (settings.disallowedTools !== undefined) {
      this.disallowedTools.clear();
      this.parseToolList(settings.disallowedTools, false);
    }

    if (settings.permissionMode !== undefined) {
      this.permissionMode = settings.permissionMode;
    }

    if (settings.dangerouslySkipPermissions !== undefined) {
      this.dangerouslySkipPermissions = settings.dangerouslySkipPermissions;
    }
  }

  // 获取工具建议
  getToolSuggestions(): string[] {
    const allCommonTools = [
      'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
      'Bash', 'TodoWrite', 'Task', 'SlashCommand', 'ExitPlanMode'
    ];

    return allCommonTools.filter(tool => {
      const permission = this.isToolAllowed(tool);
      return permission.allowed;
    });
  }
}