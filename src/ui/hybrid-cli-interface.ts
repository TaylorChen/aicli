import { HybridLayout, LayoutMode } from './hybrid-layout';
import { config } from '../config';
import { UpdateManager } from '../core/update-manager';
import { MCPManager } from '../core/mcp-manager';
import { SessionManagerV3 } from '../core/session-manager-v3';
import { AttachmentManager } from '../core/attachment-manager';
import { ScreenshotPasteHandler } from '../core/screenshot-paste-handler';
import { EnhancedClipboardHandler } from '../core/enhanced-clipboard-handler';
import { RealDragDetector } from '../core/real-drag-detector';
import chalk from 'chalk';

export interface HybridCLIOptions {
  provider?: 'deepseek' | 'openai' | 'claude';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxFiles?: number;
  maxFileSize?: number;
  enableStreaming?: boolean;
  allowedTools?: string;
  disallowedTools?: string;
  addDir?: string[];
  permissionMode?: string;
  permissionPromptTool?: string;
  dangerouslySkipPermissions?: boolean;
  verbose?: boolean;
  initialMode?: LayoutMode;
}

/**
 * 混合布局CLI界面 - 集成所有aicli功能的现代化界面
 */
export class HybridCLIInterface {
  private layout: HybridLayout;
  private options: HybridCLIOptions;
  private updateManager: UpdateManager;
  private mcpManager: MCPManager;
  private sessionManager: SessionManagerV3;
  private attachmentManager: AttachmentManager;
  private screenshotHandler: ScreenshotPasteHandler;
  private clipboardHandler: EnhancedClipboardHandler;
  private dragDetector: RealDragDetector;
  private isInitialized = false;

  constructor(options: HybridCLIOptions = {}) {
    this.options = {
      maxFiles: 20,
      maxFileSize: 50 * 1024 * 1024,
      enableStreaming: true,
      initialMode: LayoutMode.ADAPTIVE,
      ...options
    };

    this.initializeComponents();
  }

  private initializeComponents(): void {
    // 初始化布局管理器
    this.layout = new HybridLayout(this.options.initialMode);

    // 初始化核心组件
    this.updateManager = new UpdateManager();
    this.mcpManager = new MCPManager();
    this.sessionManager = new SessionManagerV3();
    this.attachmentManager = new AttachmentManager({
      maxFiles: this.options.maxFiles!,
      maxFileSize: this.options.maxFileSize!
    });

    // 初始化交互组件
    this.screenshotHandler = new ScreenshotPasteHandler(this.attachmentManager);
    this.clipboardHandler = new EnhancedClipboardHandler(this.attachmentManager);
    this.dragDetector = new RealDragDetector(this.attachmentManager);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 处理拖拽事件
    this.dragDetector.on('file-detected', (files) => {
      this.handleDragDropFiles(files);
    });

    // 处理剪贴板事件
    this.clipboardHandler.on('image-pasted', (imageInfo) => {
      this.handleImagePaste(imageInfo);
    });

    this.clipboardHandler.on('text-pasted', (text) => {
      this.handleTextPaste(text);
    });

    // 处理键盘快捷键
    this.setupKeyboardShortcuts();

    // 处理进程信号
    process.on('SIGINT', this.handleShutdown.bind(this));
    process.on('SIGTERM', this.handleShutdown.bind(this));
  }

  private setupKeyboardShortcuts(): void {
    // 注意：这些快捷键需要在底层实现中处理
    // 这里只是预留接口

    // Ctrl+L: 切换布局模式
    // Ctrl+T: 切换仪表盘
    // Ctrl+H: 显示帮助
    // Ctrl+U: 上传文件
    // Ctrl+P: 粘贴剪贴板
    // Ctrl+S: 截图
  }

  private async handleDragDropFiles(files: string[]): Promise<void> {
    try {
      const addedFiles = await this.attachmentManager.addFiles(files);

      if (addedFiles.length > 0) {
        const fileNames = addedFiles.map(f => f.name).join(', ');
        this.showNotification(`📎 已添加文件: ${fileNames}`, 'success');
        this.updateAttachmentDisplay();
      }
    } catch (error) {
      this.showNotification(`❌ 添加文件失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private async handleImagePaste(imageInfo: any): Promise<void> {
    try {
      await this.attachmentManager.addImageFromClipboard(imageInfo);
      this.showNotification('🖼️ 已添加图片到附件', 'success');
      this.updateAttachmentDisplay();
    } catch (error) {
      this.showNotification(`❌ 添加图片失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private async handleTextPaste(text: string): Promise<void> {
    try {
      await this.attachmentManager.addTextFromClipboard(text);
      this.showNotification('📋 已添加文本到附件', 'success');
      this.updateAttachmentDisplay();
    } catch (error) {
      this.showNotification(`❌ 添加文本失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const colors = {
      success: chalk.green,
      error: chalk.red,
      info: chalk.blue
    };

    console.log(colors[type](message));
  }

  private updateAttachmentDisplay(): void {
    const attachments = this.attachmentManager.getAttachments();
    if (attachments.length > 0) {
      const attachmentInfo = attachments.map(att =>
        `${att.type === 'image' ? '🖼️' : att.type === 'text' ? '📝' : '📄'} ${att.name}`
      ).join(', ');

      this.showNotification(`📎 当前附件: ${attachmentInfo}`, 'info');
    }
  }

  private async initializeConfiguration(): Promise<void> {
    try {
      // 设置API配置
      if (this.options.provider && this.options.apiKey) {
        await config.setProvider(this.options.provider, {
          apiKey: this.options.apiKey,
          baseUrl: this.options.baseUrl,
          model: this.options.model
        });
      }

      // 检查更新
      if (this.options.verbose) {
        console.log(chalk.blue('🔍 检查更新...'));
        const updateInfo = await this.updateManager.checkForUpdates();
        if (updateInfo.updateAvailable) {
          this.showNotification(`🚀 发现新版本: ${updateInfo.latestVersion}`, 'info');
        }
      }

      // 初始化MCP服务器
      await this.mcpManager.loadConfiguration();
      const enabledServers = this.mcpManager.getEnabledServers();
      if (enabledServers.length > 0 && this.options.verbose) {
        this.showNotification(`🔧 已启用 ${enabledServers.length} 个MCP服务器`, 'info');
      }

      this.isInitialized = true;
    } catch (error) {
      this.showNotification(`⚠️ 初始化警告: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      // 不阻止程序运行，继续执行
      this.isInitialized = true;
    }
  }

  private async checkSystemStatus(): Promise<void> {
    const statusChecks: Promise<boolean>[] = [];

    // 检查API连接
    if (this.options.provider && this.options.apiKey) {
      statusChecks.push(this.checkAPIConnection());
    }

    // 检查文件权限
    statusChecks.push(this.checkFilePermissions());

    // 检查剪贴板访问
    statusChecks.push(this.checkClipboardAccess());

    try {
      const results = await Promise.allSettled(statusChecks);
      const failedChecks = results.filter(result => result.status === 'rejected');

      if (failedChecks.length > 0 && this.options.verbose) {
        this.showNotification(`⚠️ 系统检查发现 ${failedChecks.length} 个问题`, 'error');
      }
    } catch (error) {
      if (this.options.verbose) {
        this.showNotification(`⚠️ 系统检查失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      }
    }
  }

  private async checkAPIConnection(): Promise<boolean> {
    try {
      const currentProvider = config.getCurrentProvider();
      if (!currentProvider) {
        throw new Error('未配置API提供商');
      }

      // 简单的连接测试
      // 这里可以添加实际的API测试逻辑
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkFilePermissions(): Promise<boolean> {
    try {
      // 检查当前目录的读写权限
      const fs = require('fs').promises;
      await fs.access(process.cwd(), fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkClipboardAccess(): Promise<boolean> {
    try {
      // 检查剪贴板访问权限
      const clipboardy = require('clipboardy');
      await clipboardy.read();
      return true;
    } catch (error) {
      return false;
    }
  }

  private displayWelcomeScreen(): void {
    console.clear();

    const welcomeContent = [
      '',
      chalk.bold.blue('🚀 AICLI - 混合布局版本'),
      chalk.gray('现代化AI编程助手终端工具'),
      '',
      chalk.bold('✨ 功能特性:'),
      '  🤖 多模态AI对话 (文本 + 图片 + 文档)',
      '  📱 自适应布局系统 (聊天 + 仪表盘)',
      '  📎 智能附件管理 (拖拽 + 剪贴板)',
      '  🔧 强大的工具系统 (文件 + 命令 + 搜索)',
      '  💾 会话历史管理',
      '  ⚡ 流式响应显示',
      '',
      chalk.bold('🎨 布局模式:'),
      '  💬 聊天模式 - 流式对话界面',
      '  📊 仪表盘模式 - 结构化状态显示',
      '  🤖 自适应模式 - 智能切换布局',
      '',
      chalk.bold('⌨️  快捷键:'),
      '  Ctrl+L - 切换布局模式',
      '  Ctrl+T - 显示/隐藏仪表盘',
      '  Ctrl+H - 显示帮助',
      '  Ctrl+U - 上传文件',
      '  Ctrl+P - 粘贴剪贴板内容',
      '  Ctrl+C - 退出程序',
      '',
      chalk.gray('开始输入消息来与AI对话，或输入 /help 查看更多命令...'),
      ''
    ];

    welcomeContent.forEach(line => console.log(line));
  }

  private handleShutdown(): void {
    this.showNotification('\n👋 正在安全关闭...', 'info');

    try {
      // 清理资源
      this.dragDetector?.cleanup();
      this.clipboardHandler?.cleanup();
      this.screenshotHandler?.cleanup();

      // 保存会话
      if (this.isInitialized) {
        this.sessionManager.saveCurrentSession();
      }

      this.showNotification('✅ 已安全退出', 'success');
    } catch (error) {
      this.showNotification(`⚠️ 关闭时出现警告: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }

    process.exit(0);
  }

  /**
   * 启动混合布局CLI界面
   */
  public async start(): Promise<void> {
    try {
      this.displayWelcomeScreen();

      // 等待一下让用户看到欢迎信息
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 初始化配置
      await this.initializeConfiguration();

      // 检查系统状态
      await this.checkSystemStatus();

      // 显示启动完成信息
      if (this.options.verbose) {
        this.showNotification('🎉 AICLI 启动完成!', 'success');

        const currentProvider = config.getCurrentProvider();
        if (currentProvider) {
          this.showNotification(`🤖 当前模型: ${currentProvider.name}/${config.get('currentModel')}`, 'info');
        }

        this.showNotification(`📱 当前模式: ${this.getModeDescription(this.layout.getMode())}`, 'info');
      }

      // 启动布局系统
      await this.layout.start();

    } catch (error) {
      this.showNotification(`❌ 启动失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      process.exit(1);
    }
  }

  private getModeDescription(mode: LayoutMode): string {
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
   * 切换布局模式
   */
  public switchLayoutMode(mode: LayoutMode): void {
    this.layout.setMode(mode);
    this.showNotification(`🔄 已切换到${this.getModeDescription(mode)}`, 'info');
  }

  /**
   * 获取当前状态信息
   */
  public getStatus(): any {
    return {
      mode: this.layout.getMode(),
      initialized: this.isInitialized,
      attachments: this.attachmentManager.getAttachments().length,
      provider: config.getCurrentProvider()?.name,
      model: config.get('currentModel')
    };
  }

  /**
   * 显示帮助信息
   */
  public showHelp(): void {
    const helpContent = [
      '',
      chalk.bold('📚 AICLI 帮助信息'),
      '',
      chalk.bold('🎯 基础命令:'),
      '  /help, /h           - 显示帮助信息',
      '  /clear, /c          - 清空屏幕',
      '  /exit, /q           - 退出程序',
      '  /status, /st        - 显示系统状态',
      '',
      chalk.bold('🎨 布局控制:'),
      '  /mode               - 切换布局模式',
      '  /dashboard          - 切换仪表盘显示',
      '  /chat               - 切换到聊天模式',
      '',
      chalk.bold('📎 文件操作:'),
      '  /upload, /up        - 上传文件',
      '  /paste, /p          - 粘贴剪贴板内容',
      '  /screenshot, /ss    - 截图',
      '  /attachments, /att  - 查看附件列表',
      '  /clear, /c          - 清空附件',
      '  /remove <n>         - 删除第n个附件',
      '',
      chalk.bold('🔧 高级功能:'),
      '  /session            - 会话管理',
      '  /tools              - 工具管理',
      '  /config             - 配置管理',
      '  /update             - 检查更新',
      '',
      chalk.bold('⌨️  快捷键:'),
      '  Ctrl+L              - 切换布局模式',
      '  Ctrl+T              - 显示/隐藏仪表盘',
      '  Ctrl+H              - 显示帮助',
      '  Ctrl+U              - 上传文件',
      '  Ctrl+P              - 粘贴剪贴板',
      '  Ctrl+S              - 截图',
      '  Ctrl+C              - 退出程序',
      '',
      chalk.gray('更多详细信息请访问: https://docs.aicli.dev'),
      ''
    ];

    helpContent.forEach(line => console.log(line));
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    try {
      this.dragDetector?.cleanup();
      this.clipboardHandler?.cleanup();
      this.screenshotHandler?.cleanup();
      this.layout?.cleanup();
    } catch (error) {
      console.error('清理资源时出错:', error);
    }
  }
}