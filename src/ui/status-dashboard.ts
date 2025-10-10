import chalk from 'chalk';
import { config } from '../config';
import { sessionManagerV2 } from '../core/session-manager-v2';
import { AttachmentManager } from '../core/attachment-manager';
import { toolRegistry } from '../core/tool-system-init';

export interface SystemStatus {
  provider: string | null;
  model: string | null;
  sessionActive: boolean;
  messageCount: number;
  attachmentCount: number;
  toolCount: number;
  processingStatus: 'idle' | 'thinking' | 'executing' | 'completed' | 'error';
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  platform: string;
}

export interface PerformanceMetrics {
  totalRequests: number;
  averageResponseTime: number;
  successRate: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  toolUsage: Record<string, number>;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'system' | 'performance' | 'session' | 'tools' | 'attachments' | 'metrics';
  content: string;
  visible: boolean;
  priority: number;
  width?: 'half' | 'full' | 'third';
  height?: number;
  refreshInterval?: number;
  lastUpdate: Date;
}

/**
 * 状态仪表盘管理器
 */
export class StatusDashboard {
  private widgets: Map<string, DashboardWidget> = new Map();
  private systemStatus!: SystemStatus;
  private performanceMetrics!: PerformanceMetrics;
  private startTime: Date;
  private refreshTimer: NodeJS.Timeout | null = null;
  private autoRefresh = true;
  private refreshInterval = 5000; // 5秒刷新一次

  constructor(
    private attachmentManager: AttachmentManager,
    private options: {
      autoRefresh?: boolean;
      refreshInterval?: number;
      enabledWidgets?: string[];
    } = {}
  ) {
    this.startTime = new Date();
    this.autoRefresh = options.autoRefresh ?? true;
    this.refreshInterval = options.refreshInterval ?? 5000;

    this.initializeSystemStatus();
    this.initializePerformanceMetrics();
    this.initializeWidgets(options.enabledWidgets);

    if (this.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  private initializeSystemStatus(): void {
    this.systemStatus = {
      provider: null,
      model: null,
      sessionActive: false,
      messageCount: 0,
      attachmentCount: 0,
      toolCount: 0,
      processingStatus: 'idle',
      uptime: 0,
      memoryUsage: process.memoryUsage(),
      platform: process.platform
    };
  }

  private initializePerformanceMetrics(): void {
    this.performanceMetrics = {
      totalRequests: 0,
      averageResponseTime: 0,
      successRate: 100,
      tokenUsage: {
        input: 0,
        output: 0,
        total: 0
      },
      toolUsage: {}
    };
  }

  private initializeWidgets(enabledWidgets: string[] = []): void {
    const defaultWidgets = [
      'system',
      'session',
      'tools',
      'attachments',
      'performance',
      'metrics'
    ];

    const widgetsToCreate = enabledWidgets.length > 0 ? enabledWidgets : defaultWidgets;

    widgetsToCreate.forEach(widgetId => {
      switch (widgetId) {
        case 'system':
          this.createSystemWidget();
          break;
        case 'session':
          this.createSessionWidget();
          break;
        case 'tools':
          this.createToolsWidget();
          break;
        case 'attachments':
          this.createAttachmentsWidget();
          break;
        case 'performance':
          this.createPerformanceWidget();
          break;
        case 'metrics':
          this.createMetricsWidget();
          break;
      }
    });
  }

  private createSystemWidget(): void {
    this.widgets.set('system', {
      id: 'system',
      title: '🖥️  系统状态',
      type: 'system',
      content: '',
      visible: true,
      priority: 1,
      width: 'half',
      height: 6,
      refreshInterval: 2000,
      lastUpdate: new Date()
    });
  }

  private createSessionWidget(): void {
    this.widgets.set('session', {
      id: 'session',
      title: '💬 会话信息',
      type: 'session',
      content: '',
      visible: true,
      priority: 2,
      width: 'half',
      height: 6,
      refreshInterval: 3000,
      lastUpdate: new Date()
    });
  }

  private createToolsWidget(): void {
    this.widgets.set('tools', {
      id: 'tools',
      title: '🔧 工具状态',
      type: 'tools',
      content: '',
      visible: true,
      priority: 3,
      width: 'half',
      height: 5,
      refreshInterval: 4000,
      lastUpdate: new Date()
    });
  }

  private createAttachmentsWidget(): void {
    this.widgets.set('attachments', {
      id: 'attachments',
      title: '📎 附件管理',
      type: 'attachments',
      content: '',
      visible: true,
      priority: 4,
      width: 'half',
      height: 5,
      refreshInterval: 5000,
      lastUpdate: new Date()
    });
  }

  private createPerformanceWidget(): void {
    this.widgets.set('performance', {
      id: 'performance',
      title: '📊 性能指标',
      type: 'performance',
      content: '',
      visible: true,
      priority: 5,
      width: 'full',
      height: 4,
      refreshInterval: 3000,
      lastUpdate: new Date()
    });
  }

  private createMetricsWidget(): void {
    this.widgets.set('metrics', {
      id: 'metrics',
      title: '📈 使用统计',
      type: 'metrics',
      content: '',
      visible: true,
      priority: 6,
      width: 'full',
      height: 4,
      refreshInterval: 10000,
      lastUpdate: new Date()
    });
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.refreshAllWidgets();
    }, this.refreshInterval);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 刷新所有组件
   */
  public refreshAllWidgets(): void {
    this.updateSystemStatus();
    this.updatePerformanceMetrics();

    this.widgets.forEach((widget, id) => {
      this.updateWidget(id);
    });
  }

  /**
   * 更新系统状态
   */
  private updateSystemStatus(): void {
    const currentProvider = config.getCurrentProvider();
    const currentSession = sessionManagerV2.getCurrentSession();

    this.systemStatus = {
      provider: currentProvider?.name || null,
      model: config.get('currentModel') || null,
      sessionActive: !!currentSession,
      messageCount: currentSession?.messages.length || 0,
      attachmentCount: this.attachmentManager.getAttachments().length,
      toolCount: toolRegistry.getToolCount(),
      processingStatus: this.getCurrentProcessingStatus(),
      uptime: Date.now() - this.startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      platform: process.platform
    };
  }

  private getCurrentProcessingStatus(): SystemStatus['processingStatus'] {
    // 这里需要从外部获取处理状态
    // 暂时返回 idle
    return 'idle';
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    // 这里可以添加实际的性能指标收集逻辑
    // 暂时使用模拟数据
  }

  /**
   * 更新特定组件
   */
  private updateWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    widget.lastUpdate = new Date();

    switch (widget.type) {
      case 'system':
        widget.content = this.formatSystemStatus();
        break;
      case 'session':
        widget.content = this.formatSessionInfo();
        break;
      case 'tools':
        widget.content = this.formatToolsInfo();
        break;
      case 'attachments':
        widget.content = this.formatAttachmentsInfo();
        break;
      case 'performance':
        widget.content = this.formatPerformanceMetrics();
        break;
      case 'metrics':
        widget.content = this.formatUsageMetrics();
        break;
    }
  }

  private formatSystemStatus(): string {
    const status = this.systemStatus;
    const lines: string[] = [];

    // 模型信息
    if (status.provider && status.model) {
      lines.push(chalk.blue(`🤖 模型: ${status.provider}/${status.model}`));
    } else {
      lines.push(chalk.red('⚠️  模型未配置'));
    }

    // 处理状态
    const statusIcon = this.getStatusIcon(status.processingStatus);
    const statusColor = this.getStatusColor(status.processingStatus);
    lines.push(statusColor(`${statusIcon} 状态: ${this.getStatusText(status.processingStatus)}`));

    // 内存使用
    const memoryMB = Math.round(status.memoryUsage.heapUsed / 1024 / 1024);
    const memoryTotalMB = Math.round(status.memoryUsage.heapTotal / 1024 / 1024);
    const memoryPercent = Math.round((memoryMB / memoryTotalMB) * 100);
    const memoryColor = memoryPercent > 80 ? chalk.red : memoryPercent > 60 ? chalk.yellow : chalk.green;
    lines.push(memoryColor(`💾 内存: ${memoryMB}MB (${memoryPercent}%)`));

    // 运行时间
    const uptime = this.formatUptime(status.uptime);
    lines.push(chalk.gray(`⏱️  运行: ${uptime}`));

    return lines.join('\n');
  }

  private formatSessionInfo(): string {
    const status = this.systemStatus;
    const lines: string[] = [];

    if (status.sessionActive) {
      const currentSession = sessionManagerV2.getCurrentSession();
      lines.push(chalk.green('🟢 会话活跃'));
      lines.push(chalk.white(`📝 标题: ${currentSession?.metadata.title || '未命名'}`));
      lines.push(chalk.blue(`💬 消息: ${status.messageCount}`));
    } else {
      lines.push(chalk.gray('🔴 无活跃会话'));
      lines.push(chalk.gray('📝 开始新对话'));
    }

    lines.push(chalk.gray(`🔧 工具: ${status.toolCount} 个可用`));

    return lines.join('\n');
  }

  private formatToolsInfo(): string {
    const lines: string[] = [];

    try {
      const availableTools = toolRegistry.getToolNames();
      lines.push(chalk.blue(`📦 可用工具: ${availableTools.length} 个`));

      if (availableTools.length > 0) {
        const topTools = availableTools.slice(0, 3);
        lines.push(chalk.white(`  ${topTools.join(', ')}`));
        if (availableTools.length > 3) {
          lines.push(chalk.gray(`  ... 还有 ${availableTools.length - 3} 个`));
        }
      }

      // 显示最近使用的工具
      const recentTools = Object.entries(this.performanceMetrics.toolUsage)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 2);

      if (recentTools.length > 0) {
        lines.push(chalk.yellow('🔄 最近使用:'));
        recentTools.forEach(([tool, count]) => {
          lines.push(chalk.gray(`  ${tool}: ${count} 次`));
        });
      }
    } catch (error) {
      lines.push(chalk.red('❌ 工具信息获取失败'));
    }

    return lines.join('\n');
  }

  private formatAttachmentsInfo(): string {
    const lines: string[] = [];
    const attachments = this.attachmentManager.getAttachments();

    lines.push(chalk.blue(`📎 附件: ${attachments.length} 个`));

    if (attachments.length > 0) {
      const totalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
      const sizeText = this.formatFileSize(totalSize);
      lines.push(chalk.gray(`📊 大小: ${sizeText}`));

      // 按类型统计
      const typeCount = attachments.reduce((acc, att) => {
        acc[att.type] = (acc[att.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(typeCount).forEach(([type, count]) => {
        const icon = this.getTypeIcon(type);
        lines.push(chalk.gray(`${icon} ${type}: ${count} 个`));
      });

      // 显示最近的附件
      const recentAtt = attachments.slice(-2);
      if (recentAtt.length > 0) {
        lines.push(chalk.gray('📋 最近:'));
        recentAtt.forEach(att => {
          const icon = this.getTypeIcon(att.type);
          const name = att.name.length > 15 ? att.name.substring(0, 12) + '...' : att.name;
          lines.push(chalk.gray(`  ${icon} ${name}`));
        });
      }
    } else {
      lines.push(chalk.gray('📝 暂无附件'));
      lines.push(chalk.gray('💡 拖拽文件或粘贴添加'));
    }

    return lines.join('\n');
  }

  private formatPerformanceMetrics(): string {
    const metrics = this.performanceMetrics;
    const lines: string[] = [];

    // 请求统计
    lines.push(chalk.blue(`📊 总请求: ${metrics.totalRequests}`));

    if (metrics.totalRequests > 0) {
      const avgTime = metrics.averageResponseTime.toFixed(1);
      const successRate = metrics.successRate.toFixed(1);

      lines.push(chalk.green(`✅ 成功率: ${successRate}%`));
      lines.push(chalk.yellow(`⏱️  平均响应: ${avgTime}ms`));
    } else {
      lines.push(chalk.gray('⏳ 暂无统计数据'));
    }

    return lines.join('\n');
  }

  private formatUsageMetrics(): string {
    const metrics = this.performanceMetrics;
    const lines: string[] = [];

    // Token使用统计
    if (metrics.tokenUsage.total > 0) {
      const inputPercent = Math.round((metrics.tokenUsage.input / metrics.tokenUsage.total) * 100);
      const outputPercent = Math.round((metrics.tokenUsage.output / metrics.tokenUsage.total) * 100);

      lines.push(chalk.blue(`🔤 总Token: ${metrics.tokenUsage.total.toLocaleString()}`));
      lines.push(chalk.green(`  输入: ${metrics.tokenUsage.input.toLocaleString()} (${inputPercent}%)`));
      lines.push(chalk.cyan(`  输出: ${metrics.tokenUsage.output.toLocaleString()} (${outputPercent}%)`));
    } else {
      lines.push(chalk.gray('🔤 暂无Token使用统计'));
    }

    return lines.join('\n');
  }

  private getStatusIcon(status: SystemStatus['processingStatus']): string {
    switch (status) {
      case 'idle': return '💭';
      case 'thinking': return '🤔';
      case 'executing': return '⚡';
      case 'completed': return '✅';
      case 'error': return '❌';
    }
  }

  private getStatusColor(status: SystemStatus['processingStatus']): typeof chalk {
    switch (status) {
      case 'idle': return chalk.gray;
      case 'thinking': return chalk.yellow;
      case 'executing': return chalk.blue;
      case 'completed': return chalk.green;
      case 'error': return chalk.red;
    }
  }

  private getStatusText(status: SystemStatus['processingStatus']): string {
    switch (status) {
      case 'idle': return '空闲';
      case 'thinking': return '思考中';
      case 'executing': return '执行中';
      case 'completed': return '已完成';
      case 'error': return '错误';
    }
  }

  private getTypeIcon(type: string): string {
    switch (type) {
      case 'image': return '🖼️';
      case 'text': return '📝';
      case 'code': return '💻';
      case 'document': return '📄';
      default: return '📎';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 渲染仪表盘
   */
  public render(width: number = 80): string {
    const visibleWidgets = Array.from(this.widgets.values())
      .filter(widget => widget.visible)
      .sort((a, b) => a.priority - b.priority);

    if (visibleWidgets.length === 0) {
      return chalk.gray('📊 仪表盘已禁用');
    }

    const lines: string[] = [];
    const separator = chalk.gray('─'.repeat(width));

    // 标题
    lines.push(chalk.bold.blue('📊 状态仪表盘'));
    lines.push(separator);

    // 按宽度分组渲染组件
    const fullWidthWidgets = visibleWidgets.filter(w => w.width === 'full');
    const halfWidthWidgets = visibleWidgets.filter(w => w.width === 'half');
    const thirdWidthWidgets = visibleWidgets.filter(w => w.width === 'third');

    // 渲染全宽组件
    fullWidthWidgets.forEach(widget => {
      const widgetContent = this.formatWidget(widget, width);
      lines.push(widgetContent);
      lines.push(separator);
    });

    // 渲染半宽组件（两列布局）
    for (let i = 0; i < halfWidthWidgets.length; i += 2) {
      const leftWidget = halfWidthWidgets[i];
      const rightWidget = halfWidthWidgets[i + 1];

      const widgetWidth = Math.floor(width / 2) - 2;
      const leftContent = this.formatWidget(leftWidget, widgetWidth);
      const rightContent = rightWidget ? this.formatWidget(rightWidget, widgetWidth) : ' '.repeat(widgetWidth);

      const leftLines = leftContent.split('\n');
      const rightLines = rightContent.split('\n');
      const maxLines = Math.max(leftLines.length, rightLines.length);

      for (let j = 0; j < maxLines; j++) {
        const leftLine = leftLines[j] || ' '.repeat(widgetWidth);
        const rightLine = rightLines[j] || ' '.repeat(widgetWidth);
        lines.push(leftLine + ' │ ' + rightLine);
      }

      lines.push(separator);
    }

    // 渲染三分之一宽度组件（三列布局）
    if (thirdWidthWidgets.length > 0) {
      const widgetWidth = Math.floor(width / 3) - 2;

      for (let i = 0; i < thirdWidthWidgets.length; i += 3) {
        const widgets = [
          thirdWidthWidgets[i],
          thirdWidthWidgets[i + 1],
          thirdWidthWidgets[i + 2]
        ].filter(Boolean);

        const contents = widgets.map(widget => this.formatWidget(widget, widgetWidth));
        const contentLines = contents.map(content => content.split('\n'));
        const maxLines = Math.max(...contentLines.map(lines => lines.length));

        for (let j = 0; j < maxLines; j++) {
          const lineParts = contentLines.map(lines => lines[j] || ' '.repeat(widgetWidth));
          lines.push(lineParts.join(' │ '));
        }

        lines.push(separator);
      }
    }

    // 底部信息
    const lastUpdate = new Date().toLocaleTimeString();
    lines.push(chalk.gray(`最后更新: ${lastUpdate}`));

    return lines.join('\n');
  }

  private formatWidget(widget: DashboardWidget, width: number): string {
    const lines: string[] = [];

    // 标题
    const title = widget.title;
    const titlePadding = Math.max(0, width - title.length - 3);
    lines.push('┌─ ' + chalk.bold(title) + ' '.repeat(titlePadding));

    // 内容
    if (widget.content) {
      const contentLines = widget.content.split('\n');
      for (const line of contentLines) {
        const truncatedLine = line.length > width - 2 ? line.substring(0, width - 5) + '...' : line;
        lines.push('│ ' + truncatedLine.padEnd(width - 3));
      }
    } else {
      lines.push('│ ' + chalk.gray('加载中...').padEnd(width - 3));
    }

    // 填充最小高度
    const minHeight = widget.height || 4;
    while (lines.length < minHeight) {
      lines.push('│ ' + ' '.repeat(width - 3));
    }

    // 底部
    lines.push('└─' + '─'.repeat(width - 3));

    return lines.join('\n');
  }

  /**
   * 显示/隐藏组件
   */
  public toggleWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.visible = !widget.visible;
      this.updateWidget(widgetId);
    }
  }

  /**
   * 设置自动刷新
   */
  public setAutoRefresh(enabled: boolean): void {
    this.autoRefresh = enabled;
    if (enabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  /**
   * 设置刷新间隔
   */
  public setRefreshInterval(interval: number): void {
    this.refreshInterval = interval;
    if (this.autoRefresh) {
      this.stopAutoRefresh();
      this.startAutoRefresh();
    }
  }

  /**
   * 更新处理状态
   */
  public updateProcessingStatus(status: SystemStatus['processingStatus']): void {
    this.systemStatus.processingStatus = status;
    this.updateWidget('system');
  }

  /**
   * 记录请求
   */
  public recordRequest(responseTime: number, success: boolean, tokens: { input: number; output: number }): void {
    this.performanceMetrics.totalRequests++;

    // 更新平均响应时间
    const total = this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1);
    this.performanceMetrics.averageResponseTime = (total + responseTime) / this.performanceMetrics.totalRequests;

    // 更新成功率
    if (success) {
      const successCount = (this.performanceMetrics.successRate / 100) * (this.performanceMetrics.totalRequests - 1) + 1;
      this.performanceMetrics.successRate = (successCount / this.performanceMetrics.totalRequests) * 100;
    } else {
      const successCount = (this.performanceMetrics.successRate / 100) * (this.performanceMetrics.totalRequests - 1);
      this.performanceMetrics.successRate = (successCount / this.performanceMetrics.totalRequests) * 100;
    }

    // 更新Token使用
    this.performanceMetrics.tokenUsage.input += tokens.input;
    this.performanceMetrics.tokenUsage.output += tokens.output;
    this.performanceMetrics.tokenUsage.total += tokens.input + tokens.output;

    this.updateWidget('performance');
    this.updateWidget('metrics');
  }

  /**
   * 记录工具使用
   */
  public recordToolUsage(toolName: string): void {
    this.performanceMetrics.toolUsage[toolName] = (this.performanceMetrics.toolUsage[toolName] || 0) + 1;
    this.updateWidget('tools');
  }

  /**
   * 获取系统状态
   */
  public getSystemStatus(): SystemStatus {
    return { ...this.systemStatus };
  }

  /**
   * 获取性能指标
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.stopAutoRefresh();
    this.widgets.clear();
  }
}