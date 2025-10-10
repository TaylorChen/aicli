import { LayoutMode } from './hybrid-layout';
import { HybridLayout } from './hybrid-layout';
import { StatusDashboard } from './status-dashboard';
import chalk from 'chalk';

export interface LayoutTrigger {
  type: 'content' | 'user' | 'system' | 'performance' | 'terminal';
  condition: () => boolean;
  targetMode: LayoutMode;
  priority: number;
  description: string;
}

export interface LayoutRule {
  id: string;
  name: string;
  description: string;
  triggers: LayoutTrigger[];
  enabled: boolean;
  cooldown: number; // 冷却时间（毫秒）
  lastTriggered?: number;
}

export interface AdaptiveConfig {
  enableAutoSwitch: boolean;
  enableUserPreference: boolean;
  enableContentBasedSwitch: boolean;
  enablePerformanceBasedSwitch: boolean;
  enableTerminalBasedSwitch: boolean;
  switchCooldown: number;
  minContentLength: number;
  maxToolCalls: number;
  performanceThreshold: {
    responseTime: number;
    memoryUsage: number;
  };
  terminalSizeThreshold: {
    minWidth: number;
    minHeight: number;
  };
}

/**
 * 自适应布局管理器
 * 根据用户行为、内容类型、系统性能等因素智能切换布局模式
 */
export class AdaptiveLayoutManager {
  private currentMode: LayoutMode = LayoutMode.ADAPTIVE;
  private effectiveMode: LayoutMode = LayoutMode.ADAPTIVE;
  private userPreference: LayoutMode | null = null;
  private layoutHistory: Array<{ mode: LayoutMode; timestamp: number; reason: string }> = [];
  private rules: Map<string, LayoutRule> = new Map();
  private lastSwitchTime = 0;
  private config: AdaptiveConfig;
  private isEnabled = true;

  constructor(
    private layout: HybridLayout,
    private dashboard: StatusDashboard,
    config: Partial<AdaptiveConfig> = {}
  ) {
    this.config = {
      enableAutoSwitch: true,
      enableUserPreference: true,
      enableContentBasedSwitch: true,
      enablePerformanceBasedSwitch: true,
      enableTerminalBasedSwitch: true,
      switchCooldown: 5000, // 5秒冷却时间
      minContentLength: 200,
      maxToolCalls: 3,
      performanceThreshold: {
        responseTime: 3000, // 3秒
        memoryUsage: 80 // 80%
      },
      terminalSizeThreshold: {
        minWidth: 100,
        minHeight: 30
      },
      ...config
    };

    this.initializeDefaultRules();
    this.setupEventListeners();
  }

  private initializeDefaultRules(): void {
    // 基于内容类型的规则
    this.addRule({
      id: 'long-content',
      name: '长内容优化',
      description: '当内容较长时切换到聊天模式',
      triggers: [{
        type: 'content',
        condition: () => this.checkLongContent(),
        targetMode: LayoutMode.CHAT,
        priority: 1,
        description: '检测到长内容，切换到流式聊天模式'
      }],
      enabled: true,
      cooldown: 3000
    });

    // 工具调用规则
    this.addRule({
      id: 'heavy-tool-usage',
      name: '工具使用优化',
      description: '当使用大量工具时切换到仪表盘模式',
      triggers: [{
        type: 'content',
        condition: () => this.checkHeavyToolUsage(),
        targetMode: LayoutMode.DASHBOARD,
        priority: 2,
        description: '检测到大量工具调用，切换到仪表盘模式'
      }],
      enabled: true,
      cooldown: 2000
    });

    // 性能优化规则
    this.addRule({
      id: 'performance-optimization',
      name: '性能优化',
      description: '当性能较差时简化布局',
      triggers: [{
        type: 'performance',
        condition: () => this.checkPerformanceIssues(),
        targetMode: LayoutMode.CHAT,
        priority: 3,
        description: '检测到性能问题，切换到轻量模式'
      }],
      enabled: true,
      cooldown: 5000
    });

    // 终端尺寸规则
    this.addRule({
      id: 'terminal-size-adaptation',
      name: '终端尺寸适配',
      description: '根据终端尺寸调整布局',
      triggers: [{
        type: 'terminal',
        condition: () => this.checkTerminalSize(),
        targetMode: LayoutMode.CHAT,
        priority: 4,
        description: '终端尺寸较小，使用紧凑布局'
      }],
      enabled: true,
      cooldown: 1000
    });

    // 用户活跃度规则
    this.addRule({
      id: 'user-activity',
      name: '用户活跃度检测',
      description: '根据用户活跃度调整布局',
      triggers: [{
        type: 'user',
        condition: () => this.checkUserActivity(),
        targetMode: LayoutMode.ADAPTIVE,
        priority: 5,
        description: '检测到用户活跃，使用自适应模式'
      }],
      enabled: true,
      cooldown: 10000
    });
  }

  private setupEventListeners(): void {
    // 监听终端大小变化
    if (process.stdout.isTTY) {
      process.stdout.on('resize', () => {
        this.handleTerminalResize();
      });
    }

    // 监听性能数据更新
    setInterval(() => {
      this.checkPerformanceTriggers();
    }, 5000);
  }

  /**
   * 检查长内容触发条件
   */
  private checkLongContent(): boolean {
    if (!this.config.enableContentBasedSwitch) return false;

    // 这里需要从布局中获取当前内容长度
    // 暂时使用模拟逻辑
    return Math.random() > 0.8; // 20%概率触发（测试用）
  }

  /**
   * 检查工具使用情况
   */
  private checkHeavyToolUsage(): boolean {
    if (!this.config.enableContentBasedSwitch) return false;

    const metrics = this.dashboard.getPerformanceMetrics();
    const recentToolUsage = Object.values(metrics.toolUsage).reduce((sum, count) => sum + count, 0);

    return recentToolUsage > this.config.maxToolCalls;
  }

  /**
   * 检查性能问题
   */
  private checkPerformanceIssues(): boolean {
    if (!this.config.enablePerformanceBasedSwitch) return false;

    const status = this.dashboard.getSystemStatus();
    const metrics = this.dashboard.getPerformanceMetrics();

    // 检查内存使用
    const memoryUsageMB = status.memoryUsage.heapUsed / 1024 / 1024;
    const memoryTotalMB = status.memoryUsage.heapTotal / 1024 / 1024;
    const memoryPercent = (memoryUsageMB / memoryTotalMB) * 100;

    // 检查平均响应时间
    const responseTimeHigh = metrics.averageResponseTime > this.config.performanceThreshold.responseTime;
    const memoryHigh = memoryPercent > this.config.performanceThreshold.memoryUsage;

    return responseTimeHigh || memoryHigh;
  }

  /**
   * 检查终端尺寸
   */
  private checkTerminalSize(): boolean {
    if (!this.config.enableTerminalBasedSwitch) return false;

    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;

    const widthSmall = width < this.config.terminalSizeThreshold.minWidth;
    const heightSmall = height < this.config.terminalSizeThreshold.minHeight;

    return widthSmall || heightSmall;
  }

  /**
   * 检查用户活跃度
   */
  private checkUserActivity(): boolean {
    if (!this.config.enableUserPreference) return false;

    // 基于最近的活动历史判断
    const recentActivity = this.layoutHistory.filter(
      entry => Date.now() - entry.timestamp < 60000 // 最近1分钟
    );

    return recentActivity.length > 5; // 如果最近有超过5次切换，说明用户很活跃
  }

  private handleTerminalResize(): void {
    this.checkTerminalTriggers();
  }

  private checkPerformanceTriggers(): void {
    if (!this.isEnabled || !this.config.enableAutoSwitch) return;

    this.rules.forEach(rule => {
      if (!rule.enabled) return;

      // 检查冷却时间
      if (rule.lastTriggered &&
          Date.now() - rule.lastTriggered < rule.cooldown) {
        return;
      }

      // 检查触发条件
      rule.triggers.forEach(trigger => {
        if (trigger.condition()) {
          this.switchLayout(trigger.targetMode, trigger.description);
          rule.lastTriggered = Date.now();
        }
      });
    });
  }

  private checkTerminalTriggers(): void {
    if (!this.isEnabled || !this.config.enableAutoSwitch) return;

    const terminalRule = this.rules.get('terminal-size-adaptation');
    if (terminalRule && terminalRule.enabled) {
      const trigger = terminalRule.triggers[0];
      if (trigger.condition()) {
        this.switchLayout(trigger.targetMode, trigger.description);
        terminalRule.lastTriggered = Date.now();
      }
    }
  }

  /**
   * 切换布局模式
   */
  public switchLayout(mode: LayoutMode, reason: string = '手动切换'): boolean {
    // 检查冷却时间
    const now = Date.now();
    if (now - this.lastSwitchTime < this.config.switchCooldown) {
      return false;
    }

    // 尊重用户偏好
    if (this.config.enableUserPreference &&
        this.userPreference &&
        mode !== this.userPreference) {
      this.showNotification(`保持用户偏好: ${this.getModeName(this.userPreference)}`, 'info');
      return false;
    }

    // 如果模式相同，不切换
    if (this.effectiveMode === mode) {
      return false;
    }

    // 执行切换
    const previousMode = this.effectiveMode;
    this.effectiveMode = mode;
    this.layout.setMode(mode);
    this.lastSwitchTime = now;

    // 记录历史
    this.layoutHistory.push({
      mode,
      timestamp: now,
      reason
    });

    // 限制历史记录长度
    if (this.layoutHistory.length > 50) {
      this.layoutHistory = this.layoutHistory.slice(-30);
    }

    this.showNotification(`🔄 切换到${this.getModeName(mode)}: ${reason}`, 'success');

    // 触发布局切换事件
    this.onLayoutSwitched(previousMode, mode, reason);

    return true;
  }

  private onLayoutSwitched(previousMode: LayoutMode, newMode: LayoutMode, reason: string): void {
    // 这里可以添加布局切换后的处理逻辑
    // 例如：保存用户偏好、更新统计等
  }

  private showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red
    };

    console.log(colors[type](`🤖 [自适应布局] ${message}`));
  }

  private getModeName(mode: LayoutMode): string {
    switch (mode) {
      case LayoutMode.CHAT:
        return '聊天模式';
      case LayoutMode.DASHBOARD:
        return '仪表盘模式';
      case LayoutMode.ADAPTIVE:
        return '自适应模式';
      default:
        return '未知模式';
    }
  }

  /**
   * 设置用户偏好
   */
  public setUserPreference(mode: LayoutMode): void {
    this.userPreference = mode;

    if (this.config.enableUserPreference) {
      this.switchLayout(mode, '用户偏好设置');
    }
  }

  /**
   * 清除用户偏好
   */
  public clearUserPreference(): void {
    this.userPreference = null;
    this.showNotification('已清除用户偏好，启用智能切换', 'info');
  }

  /**
   * 添加自定义规则
   */
  public addRule(rule: LayoutRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 删除规则
   */
  public removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 启用/禁用规则
   */
  public toggleRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      return true;
    }
    return false;
  }

  /**
   * 启用/禁用自适应布局
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (enabled) {
      this.showNotification('自适应布局已启用', 'success');
    } else {
      this.showNotification('自适应布局已禁用', 'warning');
    }
  }

  /**
   * 手动触发布局切换检查
   */
  public triggerAdaptiveCheck(): void {
    this.checkPerformanceTriggers();
    this.checkTerminalTriggers();
  }

  /**
   * 智能推荐布局模式
   */
  public recommendMode(): { mode: LayoutMode; reason: string; confidence: number } {
    const recommendations: Array<{ mode: LayoutMode; reason: string; confidence: number }> = [];

    // 基于当前状态推荐
    const status = this.dashboard.getSystemStatus();
    const metrics = this.dashboard.getPerformanceMetrics();

    // 性能问题推荐
    if (this.checkPerformanceIssues()) {
      recommendations.push({
        mode: LayoutMode.CHAT,
        reason: '当前性能较差，建议使用轻量级布局',
        confidence: 0.8
      });
    }

    // 工具使用推荐
    if (this.checkHeavyToolUsage()) {
      recommendations.push({
        mode: LayoutMode.DASHBOARD,
        reason: '检测到大量工具使用，建议使用仪表盘模式',
        confidence: 0.9
      });
    }

    // 终端尺寸推荐
    if (this.checkTerminalSize()) {
      recommendations.push({
        mode: LayoutMode.CHAT,
        reason: '终端尺寸较小，建议使用紧凑布局',
        confidence: 0.7
      });
    }

    // 用户活跃度推荐
    if (this.checkUserActivity()) {
      recommendations.push({
        mode: LayoutMode.ADAPTIVE,
        reason: '用户活跃度较高，建议使用自适应模式',
        confidence: 0.6
      });
    }

    // 默认推荐
    if (recommendations.length === 0) {
      recommendations.push({
        mode: LayoutMode.ADAPTIVE,
        reason: '当前状态良好，建议使用自适应模式',
        confidence: 0.5
      });
    }

    // 返回置信度最高的推荐
    return recommendations.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * 获取布局统计信息
   */
  public getStatistics(): {
    totalSwitches: number;
    modeUsage: Record<LayoutMode, number>;
    recentActivity: Array<{ mode: LayoutMode; timestamp: number; reason: string }>;
    enabledRules: string[];
    recommendation: { mode: LayoutMode; reason: string; confidence: number };
  } {
    const modeUsage: Record<LayoutMode, number> = {
      [LayoutMode.CHAT]: 0,
      [LayoutMode.DASHBOARD]: 0,
      [LayoutMode.ADAPTIVE]: 0
    };

    this.layoutHistory.forEach(entry => {
      modeUsage[entry.mode]++;
    });

    const enabledRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .map(rule => rule.id);

    return {
      totalSwitches: this.layoutHistory.length,
      modeUsage,
      recentActivity: this.layoutHistory.slice(-10),
      enabledRules,
      recommendation: this.recommendMode()
    };
  }

  /**
   * 显示自适应状态
   */
  public showStatus(): void {
    const stats = this.getStatistics();
    const recommendation = stats.recommendation;

    const statusContent = [
      '',
      chalk.bold.blue('🤖 自适应布局状态'),
      chalk.gray('─'.repeat(50)),
      '',
      chalk.bold('📊 统计信息:'),
      `  总切换次数: ${stats.totalSwitches}`,
      `  聊天模式: ${stats.modeUsage[LayoutMode.CHAT]} 次`,
      `  仪表盘模式: ${stats.modeUsage[LayoutMode.DASHBOARD]} 次`,
      `  自适应模式: ${stats.modeUsage[LayoutMode.ADAPTIVE]} 次`,
      '',
      chalk.bold('🎯 当前推荐:'),
      `  模式: ${this.getModeName(recommendation.mode)}`,
      `  原因: ${recommendation.reason}`,
      `  置信度: ${Math.round(recommendation.confidence * 100)}%`,
      '',
      chalk.bold('⚙️  配置状态:'),
      `  自适应切换: ${this.isEnabled ? chalk.green('启用') : chalk.red('禁用')}`,
      `  用户偏好: ${this.userPreference ? this.getModeName(this.userPreference) : '无'}`,
      `  启用规则: ${stats.enabledRules.length} 个`,
      '',
      chalk.bold('📝 最近活动:'),
      ...stats.recentActivity.slice(-3).map(activity =>
        `  ${new Date(activity.timestamp).toLocaleTimeString()} - ${this.getModeName(activity.mode)} (${activity.reason})`
      ),
      ''
    ];

    console.log(statusContent.join('\n'));
  }

  /**
   * 应用推荐模式
   */
  public applyRecommendation(): boolean {
    const recommendation = this.recommendMode();
    return this.switchLayout(recommendation.mode, `应用推荐: ${recommendation.reason}`);
  }

  /**
   * 重置所有设置
   */
  public reset(): void {
    this.userPreference = null;
    this.layoutHistory = [];
    this.lastSwitchTime = 0;
    this.isEnabled = true;

    // 重置所有规则
    this.rules.forEach(rule => {
      rule.lastTriggered = undefined;
      rule.enabled = true;
    });

    this.showNotification('自适应布局已重置', 'success');
  }

  /**
   * 获取当前配置
   */
  public getConfig(): AdaptiveConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<AdaptiveConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.showNotification('自适应布局配置已更新', 'success');
  }

  /**
   * 获取当前模式
   */
  public getCurrentMode(): LayoutMode {
    return this.effectiveMode;
  }

  /**
   * 获取用户偏好
   */
  public getUserPreference(): LayoutMode | null {
    return this.userPreference;
  }

  /**
   * 是否启用
   */
  public isAdaptiveEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.rules.clear();
    this.layoutHistory = [];
  }
}