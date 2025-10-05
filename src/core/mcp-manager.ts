#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

export interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  enabled?: boolean;
  timeout?: number;
}

export interface MCPConfig {
  servers: Record<string, MCPServer>;
  globalSettings?: {
    timeout?: number;
    maxRetries?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  };
}

export class MCPManager {
  private configPath: string;
  private config: MCPConfig;
  private runningServers: Map<string, any> = new Map();

  constructor() {
    this.configPath = join(homedir(), '.config', 'aicli', 'mcp.json');
    this.config = this.loadConfig();
  }

  // 加载配置
  private loadConfig(): MCPConfig {
    try {
      if (existsSync(this.configPath)) {
        return JSON.parse(readFileSync(this.configPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Warning: Failed to load MCP config:', error);
    }

    // 返回默认配置
    return {
      servers: {
        // 示例服务器配置
        'filesystem': {
          name: 'filesystem',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
          description: 'Filesystem access server',
          enabled: false,
          timeout: 30000
        },
        'git': {
          name: 'git',
          command: 'npx',
          args: ['@modelcontextprotocol/server-git', '.'],
          description: 'Git repository server',
          enabled: false,
          timeout: 30000
        }
      },
      globalSettings: {
        timeout: 30000,
        maxRetries: 3,
        logLevel: 'info'
      }
    };
  }

  // 保存配置
  private saveConfig(): void {
    try {
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving MCP config:', error);
    }
  }

  // 添加服务器
  addServer(server: MCPServer): void {
    this.config.servers[server.name] = {
      ...server,
      enabled: server.enabled !== undefined ? server.enabled : true
    };
    this.saveConfig();
    console.log(`✅ MCP服务器 "${server.name}" 已添加`);
  }

  // 移除服务器
  removeServer(name: string): boolean {
    if (this.config.servers[name]) {
      // 先停止服务器
      this.stopServer(name);

      delete this.config.servers[name];
      this.saveConfig();
      console.log(`✅ MCP服务器 "${name}" 已移除`);
      return true;
    }
    return false;
  }

  // 启用/禁用服务器
  toggleServer(name: string, enabled: boolean): boolean {
    if (this.config.servers[name]) {
      this.config.servers[name].enabled = enabled;
      this.saveConfig();

      if (enabled) {
        this.startServer(name);
      } else {
        this.stopServer(name);
      }

      console.log(`✅ MCP服务器 "${name}" 已${enabled ? '启用' : '禁用'}`);
      return true;
    }
    return false;
  }

  // 启动服务器
  async startServer(name: string): Promise<boolean> {
    const server = this.config.servers[name];
    if (!server) {
      console.error(`❌ MCP服务器 "${name}" 不存在`);
      return false;
    }

    if (this.runningServers.has(name)) {
      console.log(`ℹ️  MCP服务器 "${name}" 已在运行`);
      return true;
    }

    try {
      console.log(`🚀 启动 MCP服务器 "${name}"...`);

      const child = spawn(server.command, server.args || [], {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      child.on('error', (error) => {
        console.error(`❌ MCP服务器 "${name}" 启动失败:`, error.message);
        this.runningServers.delete(name);
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ MCP服务器 "${name}" 退出，代码: ${code}`);
        } else {
          console.log(`ℹ️  MCP服务器 "${name}" 正常退出`);
        }
        this.runningServers.delete(name);
      });

      // 设置超时
      const timeout = server.timeout || this.config.globalSettings?.timeout || 30000;
      const timeoutHandle = setTimeout(() => {
        if (this.runningServers.has(name)) {
          console.warn(`⚠️  MCP服务器 "${name}" 启动超时`);
          this.stopServer(name);
        }
      }, timeout);

      // 监听启动成功信号
      let started = false;
      child.stdout?.on('data', (data) => {
        if (this.config.globalSettings?.logLevel === 'debug') {
          console.log(`[${name}] ${data.toString().trim()}`);
        }

        if (!started && data.toString().includes('ready') || data.toString().includes('listening')) {
          started = true;
          clearTimeout(timeoutHandle);
          this.runningServers.set(name, child);
          console.log(`✅ MCP服务器 "${name}" 启动成功`);
        }
      });

      child.stderr?.on('data', (data) => {
        if (this.config.globalSettings?.logLevel !== 'error') {
          console.error(`[${name}] ${data.toString().trim()}`);
        }
      });

      return true;

    } catch (error) {
      console.error(`❌ 启动 MCP服务器 "${name}" 失败:`, error);
      return false;
    }
  }

  // 停止服务器
  stopServer(name: string): boolean {
    const child = this.runningServers.get(name);
    if (child) {
      try {
        child.kill('SIGTERM');
        this.runningServers.delete(name);
        console.log(`✅ MCP服务器 "${name}" 已停止`);
        return true;
      } catch (error) {
        console.error(`❌ 停止 MCP服务器 "${name}" 失败:`, error);
        return false;
      }
    }
    return false;
  }

  // 列出所有服务器
  listServers(): void {
    const servers = Object.entries(this.config.servers);

    if (servers.length === 0) {
      console.log('📝 没有配置的MCP服务器');
      return;
    }

    console.log('📝 MCP服务器列表:');
    servers.forEach(([name, server]) => {
      const isRunning = this.runningServers.has(name);
      const status = server.enabled ?
        (isRunning ? '🟢 运行中' : '🟡 已停止') :
        '🔴 已禁用';

      console.log(`  ${name}: ${status}`);
      console.log(`    命令: ${server.command} ${(server.args || []).join(' ')}`);
      console.log(`    描述: ${server.description || '无描述'}`);
      console.log('');
    });
  }

  // 显示服务器状态
  showServerStatus(name?: string): void {
    if (name) {
      const server = this.config.servers[name];
      if (!server) {
        console.error(`❌ MCP服务器 "${name}" 不存在`);
        return;
      }

      const isRunning = this.runningServers.has(name);
      const status = server.enabled ?
        (isRunning ? '🟢 运行中' : '🟡 已停止') :
        '🔴 已禁用';

      console.log(`MCP服务器 "${name}": ${status}`);
      console.log(`  命令: ${server.command} ${(server.args || []).join(' ')}`);
      console.log(`  描述: ${server.description || '无描述'}`);
      console.log(`  超时: ${server.timeout || '默认'}ms`);

      if (server.env) {
        console.log(`  环境变量:`);
        Object.entries(server.env).forEach(([key, value]) => {
          console.log(`    ${key}=${value}`);
        });
      }
    } else {
      this.listServers();
    }
  }

  // 测试服务器连接
  async testServer(name: string): Promise<boolean> {
    const server = this.config.servers[name];
    if (!server) {
      console.error(`❌ MCP服务器 "${name}" 不存在`);
      return false;
    }

    console.log(`🧪 测试 MCP服务器 "${name}"...`);

    try {
      // 启动服务器（如果未运行）
      const wasRunning = this.runningServers.has(name);
      if (!wasRunning) {
        await this.startServer(name);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待启动
      }

      // 这里可以添加实际的连接测试逻辑
      // 目前简单检查是否在运行
      const isRunning = this.runningServers.has(name);

      if (isRunning) {
        console.log(`✅ MCP服务器 "${name}" 测试成功`);
      } else {
        console.log(`❌ MCP服务器 "${name}" 测试失败`);
      }

      // 如果原本没在运行，停止它
      if (!wasRunning) {
        this.stopServer(name);
      }

      return isRunning;

    } catch (error) {
      console.error(`❌ 测试 MCP服务器 "${name}" 失败:`, error);
      return false;
    }
  }

  // 启动所有启用的服务器
  async startAllEnabledServers(): Promise<void> {
    const enabledServers = Object.entries(this.config.servers)
      .filter(([_, server]) => server.enabled !== false);

    if (enabledServers.length === 0) {
      console.log('ℹ️  没有启用的MCP服务器');
      return;
    }

    console.log(`🚀 启动 ${enabledServers.length} 个MCP服务器...`);

    for (const [name, _] of enabledServers) {
      await this.startServer(name);
      // 添加延迟避免同时启动过多服务器
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('✅ MCP服务器启动完成');
  }

  // 停止所有服务器
  stopAllServers(): void {
    console.log('🛑 停止所有MCP服务器...');

    for (const name of this.runningServers.keys()) {
      this.stopServer(name);
    }

    console.log('✅ 所有MCP服务器已停止');
  }

  // 获取配置
  getConfig(): MCPConfig {
    return { ...this.config };
  }

  // 更新全局设置
  updateGlobalSettings(settings: Partial<MCPConfig['globalSettings']>): void {
    this.config.globalSettings = {
      ...this.config.globalSettings,
      ...settings
    };
    this.saveConfig();
    console.log('✅ MCP全局设置已更新');
  }

  // 导出配置
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // 导入配置
  importConfig(configJson: string): void {
    try {
      const newConfig = JSON.parse(configJson);

      // 验证配置格式
      if (!newConfig.servers || typeof newConfig.servers !== 'object') {
        throw new Error('Invalid config format: missing servers object');
      }

      // 停止所有现有服务器
      this.stopAllServers();

      // 导入新配置
      this.config = {
        servers: newConfig.servers,
        globalSettings: {
          timeout: 30000,
          maxRetries: 3,
          logLevel: 'info',
          ...newConfig.globalSettings
        }
      };

      this.saveConfig();
      console.log('✅ MCP配置已导入');
    } catch (error) {
      console.error('❌ 导入MCP配置失败:', error);
    }
  }

  // 清理配置
  resetConfig(): void {
    this.stopAllServers();
    this.config = this.loadConfig();
    console.log('✅ MCP配置已重置');
  }
}