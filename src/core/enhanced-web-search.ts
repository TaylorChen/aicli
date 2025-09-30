import { EventEmitter } from 'events';
import { smartConfig } from './smart-config';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  content: string;
  source: string;
  publishedAt?: Date;
  relevanceScore: number;
  metadata?: {
    author?: string;
    wordCount?: number;
    readingTime?: number;
    language?: string;
    tags?: string[];
  };
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  language?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  safeSearch?: boolean;
  includeContent?: boolean;
  sortBy?: 'relevance' | 'date' | 'popularity';
  domains?: string[];
  excludeDomains?: string[];
}

export interface SearchEngine {
  name: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export interface SearchSession {
  id: string;
  query: string;
  results: SearchResult[];
  timestamp: Date;
  options: SearchOptions;
  metadata?: {
    totalResults?: number;
    searchTime?: number;
    engine?: string;
  };
}

export class EnhancedWebSearch extends EventEmitter {
  private searchEngines: Map<string, SearchEngine> = new Map();
  private searchHistory: SearchSession[] = [];
  private currentSession: SearchSession | null = null;
  private isSearching: boolean = false;

  constructor() {
    super();
    this.initializeSearchEngines();
    this.loadSearchHistory();
  }

  private initializeSearchEngines(): void {
    // 初始化搜索引擎配置
    const engines: SearchEngine[] = [
      {
        name: 'google',
        baseUrl: 'https://www.googleapis.com/customsearch/v1',
        enabled: true,
        apiKey: process.env.GOOGLE_SEARCH_API_KEY,
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 3600
        }
      },
      {
        name: 'bing',
        baseUrl: 'https://api.bing.microsoft.com/v7.0/search',
        enabled: true,
        apiKey: process.env.BING_SEARCH_API_KEY,
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 3600
        }
      },
      {
        name: 'duckduckgo',
        baseUrl: 'https://api.duckduckgo.com',
        enabled: true,
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerHour: 1800
        }
      },
      {
        name: 'baidu',
        baseUrl: 'https://api.baidu.com/json/wise/search',
        enabled: true,
        apiKey: process.env.BAIDU_SEARCH_API_KEY,
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerHour: 1800
        }
      }
    ];

    engines.forEach(engine => {
      this.searchEngines.set(engine.name, engine);
    });
  }

  async search(options: SearchOptions): Promise<SearchSession> {
    if (this.isSearching) {
      throw new Error('Already performing a search');
    }

    this.isSearching = true;
    const sessionId = this.generateSessionId();

    try {
      this.emit('searchStarted', { sessionId, query: options.query });

      const startTime = Date.now();
      const results = await this.performSearch(options);
      const searchTime = Date.now() - startTime;

      const session: SearchSession = {
        id: sessionId,
        query: options.query,
        results,
        timestamp: new Date(),
        options,
        metadata: {
          totalResults: results.length,
          searchTime,
          engine: this.getBestEngineForQuery(options.query)
        }
      };

      this.currentSession = session;
      this.searchHistory.push(session);
      this.saveSearchHistory();

      this.emit('searchCompleted', session);
      return session;
    } catch (error) {
      this.emit('searchError', { sessionId, error });
      throw error;
    } finally {
      this.isSearching = false;
    }
  }

  private async performSearch(options: SearchOptions): Promise<SearchResult[]> {
    const engineName = this.getBestEngineForQuery(options.query);
    const engine = this.searchEngines.get(engineName);

    if (!engine || !engine.enabled) {
      throw new Error(`Search engine ${engineName} is not available`);
    }

    // 模拟搜索结果 - 在实际实现中这里会调用真实的搜索API
    const mockResults = this.generateMockResults(options);

    // 应用过滤和排序
    let filteredResults = this.filterResults(mockResults, options);
    filteredResults = this.sortResults(filteredResults, options.sortBy || 'relevance');

    return filteredResults.slice(options.offset || 0, (options.offset || 0) + (options.limit || 10));
  }

  private generateMockResults(options: SearchOptions): SearchResult[] {
    // 模拟搜索结果生成
    const mockTitles = [
      'Understanding Modern Web Development',
      'Best Practices for TypeScript Projects',
      'AI and Machine Learning Trends 2024',
      'Node.js Performance Optimization',
      'React State Management Patterns',
      'Microservices Architecture Guide',
      'Cloud Native Applications',
      'DevOps Best Practices',
      'Cybersecurity Essentials',
      'Database Design Principles'
    ];

    const mockDomains = [
      'medium.com', 'dev.to', 'github.com', 'stackoverflow.com',
      'techcrunch.com', 'hackernews.com', 'reddit.com', 'wikipedia.org'
    ];

    const results: SearchResult[] = [];

    for (let i = 0; i < 20; i++) {
      const title = mockTitles[Math.floor(Math.random() * mockTitles.length)];
      const domain = mockDomains[Math.floor(Math.random() * mockDomains.length)];
      const url = `https://${domain}/article/${i + 1}`;

      results.push({
        id: `result_${i + 1}`,
        title: `${title} - Article ${i + 1}`,
        url,
        snippet: `This is a comprehensive article about ${title.toLowerCase()}. It covers the latest trends and best practices in modern software development.`,
        content: `Full content about ${title.toLowerCase()}. This article provides detailed insights into current technologies and methodologies.`,
        source: domain,
        publishedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        relevanceScore: Math.random() * 100,
        metadata: {
          author: `Author ${i + 1}`,
          wordCount: Math.floor(Math.random() * 2000) + 500,
          readingTime: Math.floor(Math.random() * 10) + 3,
          language: 'en',
          tags: ['technology', 'programming', 'development']
        }
      });
    }

    return results;
  }

  private filterResults(results: SearchResult[], options: SearchOptions): SearchResult[] {
    let filtered = [...results];

    // 域名过滤
    if (options.domains && options.domains.length > 0) {
      filtered = filtered.filter(result =>
        options.domains!.some(domain => result.url.includes(domain))
      );
    }

    // 排除域名
    if (options.excludeDomains && options.excludeDomains.length > 0) {
      filtered = filtered.filter(result =>
        !options.excludeDomains!.some(domain => result.url.includes(domain))
      );
    }

    // 语言过滤
    if (options.language) {
      filtered = filtered.filter(result =>
        result.metadata?.language === options.language
      );
    }

    // 时间范围过滤
    if (options.timeRange && options.timeRange !== 'all') {
      const now = new Date();
      const timeRanges = {
        day: 1,
        week: 7,
        month: 30,
        year: 365
      };

      const daysAgo = timeRanges[options.timeRange];
      const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(result =>
        result.publishedAt && result.publishedAt >= cutoffDate
      );
    }

    return filtered;
  }

  private sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
    const sorted = [...results];

    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => {
          const dateA = a.publishedAt?.getTime() || 0;
          const dateB = b.publishedAt?.getTime() || 0;
          return dateB - dateA;
        });

      case 'popularity':
        return sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);

      case 'relevance':
      default:
        return sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  }

  private getBestEngineForQuery(query: string): string {
    // 简单的引擎选择逻辑
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('中文') || lowerQuery.includes('china')) {
      return 'baidu';
    }

    if (lowerQuery.includes('privacy') || lowerQuery.includes('security')) {
      return 'duckduckgo';
    }

    if (lowerQuery.includes('microsoft') || lowerQuery.includes('windows')) {
      return 'bing';
    }

    return 'google';
  }

  async quickSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
    const session = await this.search({
      query,
      limit,
      includeContent: false
    });

    return session.results;
  }

  async searchWithAI(query: string, context?: string): Promise<{
    searchResults: SearchResult[];
    aiSummary: string;
    relatedQuestions: string[];
  }> {
    // 先执行搜索
    const searchSession = await this.search({
      query,
      limit: 10,
      includeContent: true
    });

    // 生成AI摘要和相关问题
    const aiSummary = await this.generateAISummary(query, searchSession.results, context);
    const relatedQuestions = this.generateRelatedQuestions(query, searchSession.results);

    return {
      searchResults: searchSession.results,
      aiSummary,
      relatedQuestions
    };
  }

  private async generateAISummary(query: string, results: SearchResult[], context?: string): Promise<string> {
    // 模拟AI摘要生成 - 在实际实现中会调用AI服务
    const topResults = results.slice(0, 3);
    const summaryPoints = topResults.map(result =>
      `- ${result.title}: ${result.snippet}`
    ).join('\n');

    return `基于搜索结果 "${query}" 的AI摘要：

${summaryPoints}

主要发现：
1. 找到了 ${results.length} 个相关结果
2. 结果涵盖了多个来源和观点
3. 信息相对较新，具有一定的参考价值

${context ? `结合上下文：${context}` : ''}

建议：可以进一步深入了解具体的技术细节或实际应用案例。`;
  }

  private generateRelatedQuestions(query: string, results: SearchResult[]): string[] {
    // 基于搜索结果生成相关问题
    const questions = [
      `什么是${query}的核心概念？`,
      `${query}有哪些实际应用场景？`,
      `如何开始学习${query}？`,
      `${query}的最新发展趋势是什么？`,
      `${query}与其他技术的比较？`
    ];

    return questions.slice(0, 3);
  }

  getSearchHistory(): SearchSession[] {
    return [...this.searchHistory].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getCurrentSession(): SearchSession | null {
    return this.currentSession;
  }

  clearSearchHistory(): void {
    this.searchHistory = [];
    this.currentSession = null;
    this.saveSearchHistory();
    this.emit('historyCleared');
  }

  private loadSearchHistory(): void {
    // 从配置加载搜索历史
    const history = smartConfig.get('webSearch.history') || [];
    this.searchHistory = history.map((item: any) => ({
      ...item,
      timestamp: new Date(item.timestamp)
    }));
  }

  private saveSearchHistory(): void {
    // 保存搜索历史到配置
    const history = this.searchHistory.slice(-100); // 只保留最近100条
    smartConfig.set('webSearch.history', history);
    smartConfig.save();
  }

  private generateSessionId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getAvailableEngines(): SearchEngine[] {
    return Array.from(this.searchEngines.values()).filter(engine => engine.enabled);
  }

  async testEngineConnection(engineName: string): Promise<{
    success: boolean;
    message: string;
    responseTime?: number;
  }> {
    const engine = this.searchEngines.get(engineName);
    if (!engine) {
      return {
        success: false,
        message: `Engine ${engineName} not found`
      };
    }

    try {
      const startTime = Date.now();
      // 模拟连接测试
      await new Promise(resolve => setTimeout(resolve, 100));
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        message: `Connection to ${engineName} successful`,
        responseTime
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection to ${engineName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  getStatistics(): {
    totalSearches: number;
    averageSearchTime: number;
    mostUsedEngine: string;
    topQueries: Array<{ query: string; count: number }>;
  } {
    const totalSearches = this.searchHistory.length;

    const averageSearchTime = totalSearches > 0
      ? this.searchHistory.reduce((sum, session) => sum + (session.metadata?.searchTime || 0), 0) / totalSearches
      : 0;

    const engineCounts = new Map<string, number>();
    const queryCounts = new Map<string, number>();

    this.searchHistory.forEach(session => {
      const engine = session.metadata?.engine || 'unknown';
      engineCounts.set(engine, (engineCounts.get(engine) || 0) + 1);
      queryCounts.set(session.query, (queryCounts.get(session.query) || 0) + 1);
    });

    const mostUsedEngine = Array.from(engineCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    const topQueries = Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalSearches,
      averageSearchTime,
      mostUsedEngine,
      topQueries
    };
  }
}

// 导出单例实例
export const enhancedWebSearch = new EnhancedWebSearch();