/**
 * 智能补全系统
 * 提供Tab键补全、智能建议等功能
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CompletionResult {
  completions: string[];
  commonPrefix: string;
  fullMatch?: string;
}

export class SmartCompleter {
  private commandHistory: string[] = [];
  private workspacePath: string;
  
  // 内置命令列表
  private builtinCommands = [
    'help', 'h', 'modes', 'version', 'v', 'status', 'st',
    'init', 'memory', 'mem', 'agents', 'agent',
    'paste', 'p', 'attachments', 'att', 'clear', 'c', 'remove', 'rm',
    'upload', 'up', 'tools', 'config', 'cfg', 'feedback', 'quit', 'q', 'exit',
    'vim', 'history', 'hist', 'shortcuts', 'keys', 'multiline', 'ml',
    'bash', 'cd', 'ls', 'pwd', 'cat', 'grep', 'find', 'tree',
    'sessions', 'sess', 'resume', 'r', 'compact'
  ];

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = workspacePath;
  }

  /**
   * 补全命令
   */
  completeCommand(input: string): CompletionResult {
    const trimmed = input.trim();
    
    // 如果以/开头，补全命令
    if (trimmed.startsWith('/')) {
      const commandPart = trimmed.slice(1);
      const matches = this.builtinCommands.filter(cmd => 
        cmd.startsWith(commandPart.toLowerCase())
      );
      
      return {
        completions: matches.map(m => `/${m}`),
        commonPrefix: this.findCommonPrefix(matches),
        fullMatch: matches.length === 1 ? `/${matches[0]}` : undefined
      };
    }

    // 如果以@开头，补全Agent名称
    if (trimmed.startsWith('@')) {
      return this.completeAgent(trimmed.slice(1));
    }

    // 如果以$开头，补全工具名称
    if (trimmed.startsWith('$')) {
      return this.completeTool(trimmed.slice(1));
    }

    // 如果以%开头，补全宏名称
    if (trimmed.startsWith('%')) {
      return this.completeMacro(trimmed.slice(1));
    }

    // 否则返回历史补全
    return this.completeFromHistory(trimmed);
  }

  /**
   * 补全文件路径
   */
  completeFilePath(input: string): CompletionResult {
    try {
      const trimmed = input.trim();
      
      // 处理~
      let resolvedPath = trimmed.startsWith('~') 
        ? trimmed.replace('~', process.env.HOME || '')
        : trimmed;

      // 处理相对路径
      if (!path.isAbsolute(resolvedPath)) {
        resolvedPath = path.resolve(this.workspacePath, resolvedPath);
      }

      const dir = path.dirname(resolvedPath);
      const base = path.basename(resolvedPath);

      if (!fs.existsSync(dir)) {
        return { completions: [], commonPrefix: '' };
      }

      const files = fs.readdirSync(dir);
      const matches = files.filter(f => f.startsWith(base));

      const completions = matches.map(f => {
        const fullPath = path.join(dir, f);
        const isDir = fs.statSync(fullPath).isDirectory();
        return isDir ? `${f}/` : f;
      });

      return {
        completions,
        commonPrefix: this.findCommonPrefix(matches),
        fullMatch: matches.length === 1 ? matches[0] : undefined
      };
    } catch (error) {
      return { completions: [], commonPrefix: '' };
    }
  }

  /**
   * 补全Agent名称
   */
  private completeAgent(partial: string): CompletionResult {
    const agents = this.listAgents();
    const matches = agents.filter(a => a.startsWith(partial.toLowerCase()));
    
    return {
      completions: matches.map(a => `@${a}`),
      commonPrefix: this.findCommonPrefix(matches),
      fullMatch: matches.length === 1 ? `@${matches[0]}` : undefined
    };
  }

  /**
   * 列出可用的Agents
   */
  private listAgents(): string[] {
    const agents: string[] = [];
    
    // 项目级Agent
    const projectDir = path.join(this.workspacePath, '.aicli', 'agents');
    if (fs.existsSync(projectDir)) {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      agents.push(...files);
    }

    // 用户级Agent
    const userDir = path.join(process.env.HOME || '', '.aicli', 'agents');
    if (fs.existsSync(userDir)) {
      const files = fs.readdirSync(userDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      agents.push(...files);
    }

    return [...new Set(agents)];
  }

  /**
   * 补全工具名称
   */
  private completeTool(partial: string): CompletionResult {
    const tools = ['grep', 'read', 'write', 'bash', 'glob'];
    const matches = tools.filter(t => t.startsWith(partial.toLowerCase()));
    
    return {
      completions: matches.map(t => `$${t}`),
      commonPrefix: this.findCommonPrefix(matches),
      fullMatch: matches.length === 1 ? `$${matches[0]}` : undefined
    };
  }

  /**
   * 补全宏名称
   */
  private completeMacro(partial: string): CompletionResult {
    const macros = this.listMacros();
    const matches = macros.filter(m => m.startsWith(partial.toLowerCase()));
    
    return {
      completions: matches.map(m => `%${m}`),
      commonPrefix: this.findCommonPrefix(matches),
      fullMatch: matches.length === 1 ? `%${matches[0]}` : undefined
    };
  }

  /**
   * 列出可用的宏
   */
  private listMacros(): string[] {
    const macros: string[] = [];
    
    const projectDir = path.join(this.workspacePath, '.aicli', 'macros');
    if (fs.existsSync(projectDir)) {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      macros.push(...files);
    }

    const userDir = path.join(process.env.HOME || '', '.aicli', 'macros');
    if (fs.existsSync(userDir)) {
      const files = fs.readdirSync(userDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      macros.push(...files);
    }

    return [...new Set(macros)];
  }

  /**
   * 从历史记录补全
   */
  private completeFromHistory(partial: string): CompletionResult {
    const matches = this.commandHistory.filter(h => 
      h.toLowerCase().startsWith(partial.toLowerCase())
    );
    
    return {
      completions: matches,
      commonPrefix: this.findCommonPrefix(matches),
      fullMatch: matches.length === 1 ? matches[0] : undefined
    };
  }

  /**
   * 智能建议
   */
  getSuggestions(input: string, context?: {
    hasAttachments?: boolean;
    hasMemory?: boolean;
    recentErrors?: string[];
  }): Array<{ suggestion: string; description: string; priority: number }> {
    const suggestions: Array<{ suggestion: string; description: string; priority: number }> = [];

    // 如果有附件但没有对话，建议发送消息
    if (context?.hasAttachments && !input.trim()) {
      suggestions.push({
        suggestion: '分析这些文件',
        description: '让AI分析附件内容',
        priority: 9
      });
    }

    // 如果没有初始化记忆，建议初始化
    if (!context?.hasMemory && !input.trim()) {
      suggestions.push({
        suggestion: '/init',
        description: '初始化项目记忆',
        priority: 8
      });
    }

    // 如果输入看起来是代码相关，建议使用review Agent
    if (this.looksLikeCodeQuestion(input)) {
      suggestions.push({
        suggestion: '@review',
        description: '使用代码审查Agent',
        priority: 7
      });
    }

    // 如果输入看起来是设计相关，建议使用design Agent
    if (this.looksLikeDesignQuestion(input)) {
      suggestions.push({
        suggestion: '@design',
        description: '使用系统设计Agent',
        priority: 7
      });
    }

    // 如果有最近的错误，建议查看帮助
    if (context?.recentErrors && context.recentErrors.length > 0) {
      suggestions.push({
        suggestion: '/help',
        description: '查看帮助信息',
        priority: 6
      });
    }

    // 按优先级排序
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 判断是否是代码相关问题
   */
  private looksLikeCodeQuestion(input: string): boolean {
    const keywords = ['代码', 'code', '函数', 'function', '错误', 'error', 'bug', '性能', 'performance'];
    return keywords.some(k => input.toLowerCase().includes(k));
  }

  /**
   * 判断是否是设计相关问题
   */
  private looksLikeDesignQuestion(input: string): boolean {
    const keywords = ['设计', 'design', '架构', 'architecture', '方案', 'solution', '系统', 'system'];
    return keywords.some(k => input.toLowerCase().includes(k));
  }

  /**
   * 找到共同前缀
   */
  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    if (strings.length === 1) return strings[0];

    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.slice(0, -1);
        if (prefix === '') return '';
      }
    }
    return prefix;
  }

  /**
   * 添加到历史记录
   */
  addToHistory(command: string): void {
    if (command.trim()) {
      this.commandHistory.unshift(command);
      // 限制历史记录数量
      if (this.commandHistory.length > 100) {
        this.commandHistory = this.commandHistory.slice(0, 100);
      }
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(): string[] {
    return [...this.commandHistory];
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.commandHistory = [];
  }
}
