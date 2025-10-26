/**
 * Subagent管理器
 * 负责管理和调用专业化的AI Agent
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface AgentDefinition {
  name: string;
  description: string;
  tools: string[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  filePath: string;
}

export interface AgentCallResult {
  success: boolean;
  agentName: string;
  response?: string;
  error?: string;
  toolsUsed?: string[];
}

export class SubagentManager {
  private projectAgentsDir: string;
  private userAgentsDir: string;
  private agentCache: Map<string, AgentDefinition> = new Map();

  constructor(private workspacePath: string = process.cwd()) {
    this.projectAgentsDir = path.join(workspacePath, '.aicli', 'agents');
    this.userAgentsDir = path.join(process.env.HOME || '', '.aicli', 'agents');
  }

  /**
   * 列出所有可用的Agent
   */
  listAgents(): AgentDefinition[] {
    const agents: AgentDefinition[] = [];
    const seenNames = new Set<string>();

    // 优先加载项目级Agent
    if (fs.existsSync(this.projectAgentsDir)) {
      const files = fs.readdirSync(this.projectAgentsDir).filter(f => f.endsWith('.md'));
      
      files.forEach(file => {
        const agent = this.loadAgentFile(path.join(this.projectAgentsDir, file));
        if (agent && !seenNames.has(agent.name)) {
          agents.push(agent);
          seenNames.add(agent.name);
        }
      });
    }

    // 加载用户级Agent
    if (fs.existsSync(this.userAgentsDir)) {
      const files = fs.readdirSync(this.userAgentsDir).filter(f => f.endsWith('.md'));
      
      files.forEach(file => {
        const agent = this.loadAgentFile(path.join(this.userAgentsDir, file));
        if (agent && !seenNames.has(agent.name)) {
          agents.push(agent);
          seenNames.add(agent.name);
        }
      });
    }

    return agents;
  }

  /**
   * 获取指定Agent
   */
  getAgent(agentName: string): AgentDefinition | null {
    // 先检查缓存
    if (this.agentCache.has(agentName)) {
      return this.agentCache.get(agentName)!;
    }

    // 尝试加载项目级Agent
    const projectAgentPath = path.join(this.projectAgentsDir, `${agentName}.md`);
    if (fs.existsSync(projectAgentPath)) {
      const agent = this.loadAgentFile(projectAgentPath);
      if (agent) {
        this.agentCache.set(agentName, agent);
        return agent;
      }
    }

    // 尝试加载用户级Agent
    const userAgentPath = path.join(this.userAgentsDir, `${agentName}.md`);
    if (fs.existsSync(userAgentPath)) {
      const agent = this.loadAgentFile(userAgentPath);
      if (agent) {
        this.agentCache.set(agentName, agent);
        return agent;
      }
    }

    return null;
  }

  /**
   * 从文件加载Agent定义
   */
  private loadAgentFile(filePath: string): AgentDefinition | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 解析frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (!frontmatterMatch) {
        console.log(chalk.yellow(`⚠️  Agent文件格式不正确: ${filePath}`));
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const systemPrompt = frontmatterMatch[2].trim();

      // 解析frontmatter字段
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      const toolsMatch = frontmatter.match(/tools:\s*\[(.+)\]/);
      const tempMatch = frontmatter.match(/temperature:\s*([0-9.]+)/);
      const tokensMatch = frontmatter.match(/maxTokens:\s*([0-9]+)/);

      if (!nameMatch) {
        console.log(chalk.yellow(`⚠️  Agent缺少name字段: ${filePath}`));
        return null;
      }

      const tools = toolsMatch 
        ? toolsMatch[1].split(',').map(t => t.trim())
        : [];

      return {
        name: nameMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : '',
        tools,
        temperature: tempMatch ? parseFloat(tempMatch[1]) : 0.7,
        maxTokens: tokensMatch ? parseInt(tokensMatch[1]) : 4000,
        systemPrompt,
        filePath
      };
    } catch (error) {
      console.log(chalk.red(`❌ 加载Agent失败 (${filePath}): ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }
  }

  /**
   * 创建新的Agent
   */
  async createAgent(
    name: string,
    description: string,
    tools: string[],
    systemPrompt: string,
    isUserLevel: boolean = false
  ): Promise<boolean> {
    try {
      const agentsDir = isUserLevel ? this.userAgentsDir : this.projectAgentsDir;
      
      // 确保目录存在
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }

      const filePath = path.join(agentsDir, `${name}.md`);

      if (fs.existsSync(filePath)) {
        console.log(chalk.yellow(`⚠️  Agent已存在: ${name}`));
        return false;
      }

      const content = `---
name: ${name}
description: ${description}
tools: [${tools.join(', ')}]
temperature: 0.7
maxTokens: 4000
---

${systemPrompt}
`;

      fs.writeFileSync(filePath, content);
      console.log(chalk.green(`✓ 已创建Agent: ${name}`));
      console.log(chalk.gray(`  路径: ${filePath}`));
      
      // 清除缓存
      this.agentCache.delete(name);
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 创建Agent失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 删除Agent
   */
  async deleteAgent(agentName: string, isUserLevel: boolean = false): Promise<boolean> {
    try {
      const agentsDir = isUserLevel ? this.userAgentsDir : this.projectAgentsDir;
      const filePath = path.join(agentsDir, `${agentName}.md`);

      if (!fs.existsSync(filePath)) {
        console.log(chalk.yellow(`⚠️  Agent不存在: ${agentName}`));
        return false;
      }

      fs.unlinkSync(filePath);
      console.log(chalk.green(`✓ 已删除Agent: ${agentName}`));
      
      // 清除缓存
      this.agentCache.delete(agentName);
      
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ 删除Agent失败: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  /**
   * 显示Agent信息
   */
  showAgentInfo(agentName: string): void {
    const agent = this.getAgent(agentName);

    if (!agent) {
      console.log(chalk.red(`❌ Agent不存在: ${agentName}`));
      return;
    }

    console.log(chalk.bold(`\n🤖 Agent: ${agent.name}\n`));
    console.log(chalk.cyan('描述:'));
    console.log(chalk.gray(`  ${agent.description}\n`));
    
    console.log(chalk.cyan('工具:'));
    console.log(chalk.gray(`  ${agent.tools.join(', ')}\n`));
    
    console.log(chalk.cyan('参数:'));
    console.log(chalk.gray(`  Temperature: ${agent.temperature}`));
    console.log(chalk.gray(`  Max Tokens: ${agent.maxTokens}\n`));
    
    console.log(chalk.cyan('系统提示词:'));
    const lines = agent.systemPrompt.split('\n').slice(0, 10);
    lines.forEach(line => console.log(chalk.gray(`  ${line}`)));
    
    if (agent.systemPrompt.split('\n').length > 10) {
      console.log(chalk.gray(`  ...`));
    }
    
    console.log(chalk.gray(`\n  路径: ${agent.filePath}`));
    console.log();
  }

  /**
   * 显示所有Agent列表
   */
  showAgentList(): void {
    const agents = this.listAgents();

    if (agents.length === 0) {
      console.log(chalk.yellow('\n⚠️  没有可用的Agent'));
      console.log(chalk.gray('使用 /agents create 创建新Agent\n'));
      return;
    }

    console.log(chalk.bold('\n🤖 可用的Agents:\n'));

    agents.forEach(agent => {
      const isProject = agent.filePath.includes(this.projectAgentsDir);
      const scope = isProject ? chalk.blue('[项目]') : chalk.gray('[用户]');
      
      console.log(`${scope} ${chalk.bold(agent.name)}`);
      console.log(chalk.gray(`     ${agent.description}`));
      console.log(chalk.gray(`     工具: ${agent.tools.join(', ')}`));
      console.log();
    });

    console.log(chalk.gray(`使用 @<agent-name> <prompt> 调用Agent`));
    console.log(chalk.gray(`使用 /agents info <name> 查看详情\n`));
  }

  /**
   * 创建默认的Agents
   */
  async createDefaultAgents(): Promise<void> {
    const defaultAgents = [
      {
        name: 'review',
        description: '代码审查专家',
        tools: ['Read', 'Grep', 'Glob'],
        prompt: `你是一位资深的代码审查专家，负责确保代码质量。

## 审查清单

1. **代码质量**
   - 命名是否清晰易懂
   - 逻辑是否合理
   - 是否有重复代码
   - 是否符合DRY原则

2. **安全性**
   - SQL注入风险
   - XSS漏洞
   - 敏感信息泄露
   - 输入验证

3. **性能**
   - 算法时间复杂度
   - 内存使用
   - 数据库查询优化
   - 缓存使用

4. **测试**
   - 单元测试覆盖
   - 边界条件测试
   - 错误处理测试

## 输出格式

请以清单形式输出问题，使用以下标记：
- 🔴 严重问题（必须修复）
- 🟡 警告（建议修复）
- 🟢 建议（可选优化）`
      },
      {
        name: 'design',
        description: '系统设计专家',
        tools: ['Read', 'Grep'],
        prompt: `你是一位系统设计专家，擅长架构设计和技术方案制定。

## 设计原则

1. **SOLID原则**
2. **高内聚低耦合**
3. **可扩展性**
4. **可维护性**

## 设计流程

1. 理解需求
2. 分析现有架构
3. 提出设计方案
4. 权衡利弊
5. 给出建议

## 输出格式

请按以下格式输出设计方案：

### 需求分析
...

### 技术方案
...

### 架构图
...

### 实施步骤
1. ...
2. ...`
      },
      {
        name: 'test',
        description: '测试工程师',
        tools: ['Read', 'Write', 'Bash'],
        prompt: `你是一位专业的测试工程师，负责编写和运行测试。

## 测试类型

1. **单元测试** - 测试单个函数/模块
2. **集成测试** - 测试模块间交互
3. **端到端测试** - 测试完整流程

## 测试原则

1. 测试应该简单明了
2. 测试应该独立运行
3. 测试应该快速
4. 测试应该全面

## 输出格式

为每个功能编写完整的测试用例，包括：
- 正常情况测试
- 边界条件测试
- 异常情况测试`
      }
    ];

    console.log(chalk.bold('\n创建默认Agents...\n'));

    for (const agent of defaultAgents) {
      await this.createAgent(
        agent.name,
        agent.description,
        agent.tools,
        agent.prompt,
        false // 创建为项目级Agent
      );
    }

    console.log(chalk.green('\n✓ 默认Agents创建完成'));
    console.log(chalk.gray('使用 /agents list 查看所有Agent\n'));
  }

  /**
   * 验证Agent定义
   */
  validateAgent(filePath: string): { valid: boolean; errors: string[] } {
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
        
        if (!frontmatter.includes('name:')) {
          errors.push('缺少name字段');
        }
        if (!frontmatter.includes('description:')) {
          errors.push('缺少description字段');
        }
        if (!frontmatter.includes('tools:')) {
          errors.push('缺少tools字段');
        }
      }

      // 检查系统提示词
      const systemPrompt = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
      if (systemPrompt.length < 10) {
        errors.push('系统提示词太短');
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

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.agentCache.clear();
  }
}

