#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  changelog?: string;
  downloadUrl?: string;
}

export class UpdateManager {
  private packageJsonPath: string;
  private currentVersion: string;
  private configPath: string;

  constructor() {
    this.packageJsonPath = join(__dirname, '../../package.json');
    this.configPath = join(homedir(), '.config', 'aicli', 'config.json');

    try {
      const packageJson = JSON.parse(readFileSync(this.packageJsonPath, 'utf8'));
      this.currentVersion = packageJson.version;
    } catch (error) {
      this.currentVersion = 'unknown';
    }
  }

  // 检查更新
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      // 使用 npm view 获取最新版本信息
      const npmOutput = execSync('npm view aicli version --json', {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      const latestVersion = JSON.parse(npmOutput);

      return {
        currentVersion: this.currentVersion,
        latestVersion: latestVersion,
        updateAvailable: this.compareVersions(this.currentVersion, latestVersion) < 0
      };

    } catch (error) {
      // 如果无法从npm获取，返回当前版本信息
      return {
        currentVersion: this.currentVersion,
        latestVersion: this.currentVersion,
        updateAvailable: false
      };
    }
  }

  // 执行更新
  async performUpdate(): Promise<boolean> {
    try {
      console.log('🔄 正在更新 aicli...');

      // 全局更新
      if (this.isGlobalInstallation()) {
        execSync('npm update -g aicli', { stdio: 'inherit' });
      } else {
        // 本地更新
        execSync('npm update', { stdio: 'inherit', cwd: process.cwd() });
      }

      console.log('✅ aicli 已成功更新！');
      return true;

    } catch (error) {
      console.error('❌ 更新失败:', error instanceof Error ? error.message : '未知错误');
      return false;
    }
  }

  // 显示更新信息
  async displayUpdateInfo(): Promise<void> {
    const updateInfo = await this.checkForUpdates();

    console.log(`当前版本: ${updateInfo.currentVersion}`);
    console.log(`最新版本: ${updateInfo.latestVersion}`);

    if (updateInfo.updateAvailable) {
      console.log('🚀 有新版本可用！');
      console.log('运行 "aicli update" 进行更新');
    } else {
      console.log('✅ 您使用的是最新版本');
    }
  }

  // 比较版本号
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  // 检查是否为全局安装
  private isGlobalInstallation(): boolean {
    try {
      const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const currentPath = join(__dirname, '../..');
      return currentPath.includes(globalPath);
    } catch {
      return false;
    }
  }

  // 获取配置信息
  getConfig(): any {
    try {
      return JSON.parse(readFileSync(this.configPath, 'utf8'));
    } catch {
      return {};
    }
  }

  // 保存配置信息
  saveConfig(config: any): void {
    try {
      const fs = require('fs');
      const path = require('path');

      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.warn('Warning: Could not save config:', error);
    }
  }

  // 设置自动更新检查
  setAutoUpdateCheck(enabled: boolean): void {
    const config = this.getConfig();
    config.autoUpdateCheck = enabled;
    config.lastUpdateCheck = new Date().toISOString();
    this.saveConfig(config);
  }

  // 检查是否需要进行自动更新检查
  shouldCheckForUpdates(): boolean {
    const config = this.getConfig();

    if (!config.autoUpdateCheck) {
      return false;
    }

    if (!config.lastUpdateCheck) {
      return true;
    }

    const lastCheck = new Date(config.lastUpdateCheck);
    const now = new Date();
    const daysSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24);

    // 每周检查一次
    return daysSinceLastCheck >= 7;
  }

  // 执行自动更新检查
  async performAutoUpdateCheck(): Promise<void> {
    if (this.shouldCheckForUpdates()) {
      console.log('🔍 检查更新...');
      await this.displayUpdateInfo();
      this.setAutoUpdateCheck(true);
    }
  }
}