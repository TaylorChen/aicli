/**
 * Memory管理器 - AGENTS.md
 * 负责项目记忆的管理和加载
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface MemoryMetadata {
  version: string;
  created: string;
  updated: string;
}

export interface Memory {
  metadata: MemoryMetadata;
  content: string;
  fullContent: string;
}

export class MemoryManager {
  private projectMemoryPath: string;
  private userMemoryPath: string;

  constructor(private workspacePath: string = process.cwd()) {
    this.projectMemoryPath = path.join(workspacePath, 'AGENTS.md');
    this.userMemoryPath = path.join(process.env.HOME || '', '.aicli', 'AGENTS.md');
  }

  /**
   * 加载所有记忆（用户级 + 项目级）
   */
  loadMemories(): Memory[] {
    const memories: Memory[] = [];

    // 加载用户级记忆
    const userMemory = this.loadMemoryFile(this.userMemoryPath);
    if (userMemory) {
      memories.push(userMemory);
    }

    // 加载项目级记忆
    const projectMemory = this.loadMemoryFile(this.projectMemoryPath);
    if (projectMemory) {
      memories.push(projectMemory);
    }

    return memories;
  }

  /**
   * 加载单个记忆文件
   */
  private loadMemoryFile(filePath: string): Memory | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 解析frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (!frontmatterMatch) {
        // 没有frontmatter，返回全部内容
        return {
          metadata: {
            version: '1.0.0',
            created: '',
            updated: ''
          },
          content: content.trim(),
          fullContent: content
        };
      }

      const frontmatter = frontmatterMatch[1];
      const mainContent = frontmatterMatch[2].trim();

      // 解析metadata
      const versionMatch = frontmatter.match(/version:\s*(.+)/);
      const createdMatch = frontmatter.match(/created:\s*(.+)/);
      const updatedMatch = frontmatter.match(/updated:\s*(.+)/);

      return {
        metadata: {
          version: versionMatch ? versionMatch[1].trim() : '1.0.0',
          created: createdMatch ? createdMatch[1].trim() : '',
          updated: updatedMatch ? updatedMatch[1].trim() : ''
        },
        content: mainContent,
        fullContent: content
      };
    } catch (error) {
      console.log(chalk.red(`❌ 加载记忆文件失败 (${filePath}): ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 获取合并后的记忆内容（用于AI上下文）
   */
  getMergedMemoryContent(): string {
    const memories = this.loadMemories();
    
    if (memories.length === 0) {
      return '';
    }

    const parts: string[] = [];

    memories.forEach((memory, index) => {
      const source = index === 0 ? '用户级记忆' : '项目级记忆';
      parts.push(`## ${source}\n\n${memory.content}`);
    });

    return parts.join('\n\n---\n\n');
  }

  /**
   * 初始化项目记忆
   */
  async initProjectMemory(projectName?: string): Promise<boolean> {
    try {
      if (fs.existsSync(this.projectMemoryPath)) {
        console.log(chalk.yellow(`⚠️  记忆文件已存在: ${this.projectMemoryPath}`));
        return false;
      }

      const name = projectName || path.basename(this.workspacePath);
      const today = new Date().toISOString().split('T')[0];

      const template = `---
version: 2.3.0
created: ${today}
updated: ${today}
---

# 项目记忆 - ${name}

## 技术栈

- Frontend: 
- Backend: 
- Database: 

## 开发规范

1. 代码风格
2. 命名约定
3. 注释规范

## 架构说明

请在此处添加项目架构信息...

## 常用命令

- \`npm run dev\` - 开发模式
- \`npm run build\` - 构建
- \`npm test\` - 测试

## 注意事项

- 
`;

      fs.writeFileSync(this.projectMemoryPath, template);
      console.log(chalk.green(`✓ 已创建项目记忆: ${this.projectMemoryPath}`));
      console.log(chalk.gray(`  使用 /memory 命令编辑`));
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 初始化项目记忆失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 初始化用户记忆
   */
  async initUserMemory(): Promise<boolean> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.userMemoryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.userMemoryPath)) {
        console.log(chalk.yellow(`⚠️  用户记忆已存在: ${this.userMemoryPath}`));
        return false;
      }

      const today = new Date().toISOString().split('T')[0];

      const template = `---
version: 2.3.0
created: ${today}
updated: ${today}
---

# 用户级记忆

## 个人偏好

- 编程语言偏好: 
- 代码风格: 
- 常用工具: 

## 通用开发规范

1. 代码必须有注释
2. 函数必须有类型定义
3. 错误必须有适当处理

## 常用模板

### API接口模板

\`\`\`typescript
interface APIResponse<T> {
  code: number;
  data: T;
  message: string;
}
\`\`\`

## 个人笔记

- 
`;

      fs.writeFileSync(this.userMemoryPath, template);
      console.log(chalk.green(`✓ 已创建用户记忆: ${this.userMemoryPath}`));
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 初始化用户记忆失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 追加内容到记忆
   */
  appendToMemory(content: string, isUserLevel: boolean = false): boolean {
    try {
      const filePath = isUserLevel ? this.userMemoryPath : this.projectMemoryPath;

      if (!fs.existsSync(filePath)) {
        console.log(chalk.yellow(`⚠️  记忆文件不存在，请先使用 /init 初始化`));
        return false;
      }

      const timestamp = new Date().toLocaleString('zh-CN');
      const entry = `\n<!-- 添加于 ${timestamp} -->\n${content}\n`;
      
      fs.appendFileSync(filePath, entry);
      
      // 更新metadata中的updated字段
      this.updateMetadata(filePath);
      
      console.log(chalk.green(`✓ 已添加到${isUserLevel ? '用户' : '项目'}记忆`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 添加记忆失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 更新记忆文件的metadata
   */
  private updateMetadata(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const today = new Date().toISOString().split('T')[0];
      
      const updated = content.replace(
        /updated:\s*.+/,
        `updated: ${today}`
      );
      
      fs.writeFileSync(filePath, updated);
    } catch (error) {
      // 忽略更新失败
    }
  }

  /**
   * 搜索记忆内容
   */
  searchMemory(keyword: string): Array<{ source: string; line: number; content: string }> {
    const results: Array<{ source: string; line: number; content: string }> = [];
    const memories = [
      { path: this.userMemoryPath, name: '用户级记忆' },
      { path: this.projectMemoryPath, name: '项目级记忆' }
    ];

    memories.forEach(({ path: filePath, name }) => {
      if (!fs.existsSync(filePath)) {
        return;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            results.push({
              source: name,
              line: index + 1,
              content: line.trim()
            });
          }
        });
      } catch (error) {
        // 忽略读取失败
      }
    });

    return results;
  }

  /**
   * 显示记忆统计
   */
  showMemoryStats(): void {
    console.log(chalk.bold('\n📊 记忆统计\n'));

    const memories = [
      { path: this.userMemoryPath, name: '用户级记忆', icon: '👤' },
      { path: this.projectMemoryPath, name: '项目级记忆', icon: '📁' }
    ];

    memories.forEach(({ path: filePath, name, icon }) => {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').length;
        const chars = content.length;
        const words = content.split(/\s+/).length;

        console.log(chalk.cyan(`${icon} ${name}:`));
        console.log(chalk.gray(`   路径: ${filePath}`));
        console.log(chalk.gray(`   行数: ${lines} | 字数: ${words} | 字符: ${chars}`));
        console.log();
      } else {
        console.log(chalk.gray(`${icon} ${name}: 未创建`));
        console.log();
      }
    });
  }

  /**
   * 获取记忆文件路径
   */
  getMemoryPath(isUserLevel: boolean = false): string {
    return isUserLevel ? this.userMemoryPath : this.projectMemoryPath;
  }

  /**
   * 检查记忆是否存在
   */
  hasMemory(isUserLevel: boolean = false): boolean {
    const filePath = isUserLevel ? this.userMemoryPath : this.projectMemoryPath;
    return fs.existsSync(filePath);
  }

  /**
   * 验证记忆文件格式
   */
  validateMemory(filePath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!fs.existsSync(filePath)) {
      errors.push('文件不存在');
      return { valid: false, errors };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // 检查frontmatter
      if (!content.startsWith('---\n')) {
        errors.push('缺少frontmatter开始标记');
      }

      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!frontmatterMatch) {
        errors.push('frontmatter格式不正确');
      } else {
        const frontmatter = frontmatterMatch[1];
        
        if (!frontmatter.includes('version:')) {
          errors.push('缺少version字段');
        }
        if (!frontmatter.includes('created:')) {
          errors.push('缺少created字段');
        }
        if (!frontmatter.includes('updated:')) {
          errors.push('缺少updated字段');
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors };
    }
  }
}

