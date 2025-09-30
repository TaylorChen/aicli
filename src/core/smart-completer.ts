import { smartConfig } from './smart-config';
import { CommandHistory } from './command-history';

export interface CompletionItem {
  text: string;
  description?: string;
  type: 'command' | 'file' | 'directory' | 'history' | 'suggestion';
  score: number;
}

export interface CompletionContext {
  input: string;
  cursor: number;
  session: string;
  cwd: string;
  project?: any;
}

export class SmartCompleter {
  private history: CommandHistory;
  private fileCache: Map<string, string[]> = new Map();
  private lastCacheUpdate: number = 0;
  private cacheTTL: number = 60000; // 1分钟缓存

  constructor() {
    this.history = new CommandHistory();
  }

  async complete(line: string): Promise<[string[], string]> {
    const completions = await this.getCompletions(line);
    const texts = completions.map(item => item.text);
    return [texts, line];
  }

  async getCompletions(input: string, context?: Partial<CompletionContext>): Promise<CompletionItem[]> {
    const fullContext: CompletionContext = {
      input,
      cursor: input.length,
      session: '',
      cwd: process.cwd(),
      ...context
    };

    const suggestions: CompletionItem[] = [];

    // 命令补全
    if (input.startsWith('/')) {
      suggestions.push(...this.getCommandCompletions(input, fullContext));
    }

    // 文件路径补全
    if (this.looksLikeFilePath(input)) {
      suggestions.push(...await this.getFilePathCompletions(input, fullContext));
    }

    // 历史命令补全
    suggestions.push(...this.getHistoryCompletions(input, fullContext));

    // 智能建议补全
    if (smartConfig.getWithDefault('behavior.smartSuggestions', true)) {
      suggestions.push(...this.getSmartSuggestions(input, fullContext));
    }

    // 排序和去重
    return this.deduplicateAndSort(suggestions);
  }

  private getCommandCompletions(input: string, context: CompletionContext): CompletionItem[] {
    const commands = [
      { text: '/help', description: '显示帮助信息', type: 'command' as const },
      { text: '/clear', description: '清空屏幕', type: 'command' as const },
      { text: '/history', description: '显示命令历史', type: 'command' as const },
      { text: '/sessions', description: '管理会话', type: 'command' as const },
      { text: '/new', description: '创建新会话', type: 'command' as const },
      { text: '/save', description: '保存当前会话', type: 'command' as const },
      { text: '/load', description: '加载指定会话', type: 'command' as const },
      { text: '/config', description: '显示配置信息', type: 'command' as const },
      { text: '/theme', description: '切换主题', type: 'command' as const },
      { text: '/multiline', description: '切换多行输入模式', type: 'command' as const },
      { text: '/project', description: '显示项目信息', type: 'command' as const },
      { text: '/exit', description: '退出程序', type: 'command' as const }
    ];

    const prefix = input.toLowerCase();
    return commands
      .filter(cmd => cmd.text.toLowerCase().startsWith(prefix))
      .map(cmd => ({
        ...cmd,
        score: this.calculateScore(cmd.text, input)
      }));
  }

  private async getFilePathCompletions(input: string, context: CompletionContext): Promise<CompletionItem[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // 提取文件路径
      const pathMatch = input.match(/(?:[\'\"])(.*?)(?:[\'\"])$/) || input.match(/(\\S+)$/);
      if (!pathMatch) return [];

      const filePath = pathMatch[1];
      const dirPath = path.dirname(filePath);
      const filePrefix = path.basename(filePath);

      // 检查缓存
      const cacheKey = `${context.cwd}:${dirPath}`;
      let files = this.fileCache.get(cacheKey);

      if (!files || Date.now() - this.lastCacheUpdate > this.cacheTTL) {
        if (fs.existsSync(dirPath)) {
          files = fs.readdirSync(dirPath);
          this.fileCache.set(cacheKey, files);
          this.lastCacheUpdate = Date.now();
        }
      }

      if (!files) return [];

      const completions: CompletionItem[] = [];

      for (const file of files) {
        if (file.toLowerCase().startsWith(filePrefix.toLowerCase())) {
          const fullPath = path.join(dirPath, file);
          const stats = fs.statSync(fullPath);

          completions.push({
            text: path.join(dirPath, file),
            description: stats.isDirectory() ? '目录' : '文件',
            type: stats.isDirectory() ? 'directory' : 'file',
            score: this.calculateScore(file, filePrefix) + 0.1
          });
        }
      }

      return completions;
    } catch (error) {
      return [];
    }
  }

  private getHistoryCompletions(input: string, context: CompletionContext): CompletionItem[] {
    const history = this.history.getDetailedHistory();
    const lowerInput = input.toLowerCase();

    const matches = history
      .filter(entry => entry.command.toLowerCase().includes(lowerInput))
      .slice(-20) // 最近20条匹配
      .map(entry => ({
        text: entry.command,
        description: `历史命令 (${new Date(entry.timestamp).toLocaleDateString()})`,
        type: 'history' as const,
        score: this.calculateScore(entry.command, input) - 0.1
      }));

    return matches;
  }

  private getSmartSuggestions(input: string, context: CompletionContext): CompletionItem[] {
    const suggestions: CompletionItem[] = [];
    const lowerInput = input.toLowerCase();

    // 编程相关建议
    if (lowerInput.includes('代码') || lowerInput.includes('code')) {
      suggestions.push(
        { text: '分析这段代码的问题', description: '代码分析', type: 'suggestion' as const, score: 0.8 },
        { text: '优化这个函数的性能', description: '性能优化', type: 'suggestion' as const, score: 0.8 },
        { text: '解释这个算法的工作原理', description: '算法解释', type: 'suggestion' as const, score: 0.8 },
        { text: '重构这段代码', description: '代码重构', type: 'suggestion' as const, score: 0.8 }
      );
    }

    // 文件操作建议
    if (lowerInput.includes('文件') || lowerInput.includes('file')) {
      suggestions.push(
        { text: '读取文件内容', description: '文件读取', type: 'suggestion' as const, score: 0.8 },
        { text: '创建新文件', description: '文件创建', type: 'suggestion' as const, score: 0.8 },
        { text: '搜索文件中的内容', description: '文件搜索', type: 'suggestion' as const, score: 0.8 },
        { text: '批量重命名文件', description: '文件重命名', type: 'suggestion' as const, score: 0.8 }
      );
    }

    // 调试相关建议
    if (lowerInput.includes('调试') || lowerInput.includes('debug') || lowerInput.includes('错误')) {
      suggestions.push(
        { text: '帮我调试这个错误', description: '错误调试', type: 'suggestion' as const, score: 0.8 },
        { text: '分析这个bug的原因', description: 'Bug分析', type: 'suggestion' as const, score: 0.8 },
        { text: '如何修复这个问题', description: '问题修复', type: 'suggestion' as const, score: 0.8 }
      );
    }

    // 项目相关建议
    if (context.project) {
      if (context.project.type === 'nodejs') {
        suggestions.push(
          { text: '分析package.json依赖', description: '依赖分析', type: 'suggestion' as const, score: 0.9 },
          { text: '优化npm脚本', description: '脚本优化', type: 'suggestion' as const, score: 0.9 }
        );
      }

      if (context.project.language === 'python') {
        suggestions.push(
          { text: '分析requirements.txt', description: '依赖分析', type: 'suggestion' as const, score: 0.9 },
          { text: '优化Python代码性能', description: '性能优化', type: 'suggestion' as const, score: 0.9 }
        );
      }
    }

    // 通用建议
    if (input.length < 3) {
      suggestions.push(
        { text: '你好，我需要帮助', description: '问候', type: 'suggestion' as const, score: 0.7 },
        { text: '你能帮我做什么', description: '功能咨询', type: 'suggestion' as const, score: 0.7 },
        { text: '解释这个概念', description: '概念解释', type: 'suggestion' as const, score: 0.7 }
      );
    }

    return suggestions.filter(s => s.text.toLowerCase().includes(lowerInput));
  }

  private looksLikeFilePath(input: string): boolean {
    // 检查是否像文件路径
    return /['\"](?:.*[\\/])?[^'\"\s]*['\"]?$/.test(input) ||
           /[\\/][^\\s]*$/.test(input) ||
           /\\.[a-zA-Z0-9]+$/.test(input);
  }

  private calculateScore(text: string, input: string): number {
    if (!input) return 1.0;

    const lowerText = text.toLowerCase();
    const lowerInput = input.toLowerCase();

    // 完全匹配
    if (lowerText === lowerInput) return 1.0;

    // 前缀匹配
    if (lowerText.startsWith(lowerInput)) return 0.9;

    // 包含匹配
    if (lowerText.includes(lowerInput)) {
      const position = lowerText.indexOf(lowerInput);
      const positionScore = 1.0 - (position / lowerText.length) * 0.3;
      return positionScore;
    }

    // 模糊匹配
    const words = lowerInput.split(/\\s+/);
    let matchCount = 0;
    for (const word of words) {
      if (lowerText.includes(word)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      return (matchCount / words.length) * 0.7;
    }

    return 0;
  }

  private deduplicateAndSort(items: CompletionItem[]): CompletionItem[] {
    // 去重
    const seen = new Set();
    const unique = items.filter(item => {
      const key = item.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 按分数排序
    return unique.sort((a, b) => b.score - a.score);
  }

  // 获取建议（用于REPL显示）
  getSuggestions(input: string, limit: number = 5): string[] {
    const completions = this.getCompletionsSync(input);
    return completions.slice(0, limit).map(item => item.text);
  }

  // 同步版本（用于性能敏感的场景）
  private getCompletionsSync(input: string): CompletionItem[] {
    const suggestions: CompletionItem[] = [];

    // 只提供命令补全和历史补全（同步）
    if (input.startsWith('/')) {
      suggestions.push(...this.getCommandCompletions(input, {
        input,
        cursor: input.length,
        session: '',
        cwd: process.cwd()
      }));
    }

    const history = this.history.getDetailedHistory();
    const lowerInput = input.toLowerCase();
    const historyMatches = history
      .filter(entry => entry.command.toLowerCase().includes(lowerInput))
      .slice(-10)
      .map(entry => ({
        text: entry.command,
        description: `历史命令`,
        type: 'history' as const,
        score: this.calculateScore(entry.command, input) - 0.1
      }));

    suggestions.push(...historyMatches);

    return this.deduplicateAndSort(suggestions);
  }

  // 清除缓存
  clearCache(): void {
    this.fileCache.clear();
    this.lastCacheUpdate = 0;
  }

  // 设置缓存TTL
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }
}