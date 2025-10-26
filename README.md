# AICLI - 终极AI命令行工具

<div align="center">

[![Version](https://img.shields.io/badge/version-2.4.4-blue.svg)](https://github.com/TaylorChen/aicli)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

**最强大、最智能的AI命令行交互工具**

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [使用指南](#-使用指南) • [完整文档](#-完整文档)

</div>

---

## 🌟 项目亮点

- 🎨 **8种多模态输入** - 对话、Bash、命令、记忆、Agent、工具、宏、多行
- 📝 **完整Vim模式** - 支持中文、多行、标准Vim操作，自动发送AI
- 🤖 **智能AI集成** - DeepSeek/OpenAI，流式响应，附件支持
- 💡 **智能补全系统** - Tab补全命令、路径、历史，上下文建议
- 🔧 **Hooks系统** - 任务生命周期钩子，支持外部集成
- 🧠 **记忆系统** - 项目和用户级上下文自动管理
- 👥 **Subagent系统** - 专业AI代理（review、design、test等）
- 📁 **文件处理** - 拖拽、剪贴板、多格式支持
- 🎯 **零配置** - 智能默认值，开箱即用
- ⚡ **高性能** - 懒加载、并行初始化、流式输出

---

## 📚 目录

- [功能特性](#-功能特性)
- [快速开始](#-快速开始)
- [多模态输入](#-多模态输入系统)
- [Vim模式](#-完整vim模式)
- [智能补全](#-智能补全系统)
- [Hooks系统](#-hooks系统)
- [记忆系统](#-记忆系统)
- [Subagent系统](#-subagent系统)
- [命令参考](#-命令参考)
- [配置说明](#-配置说明)
- [开发指南](#-开发指南)
- [常见问题](#-常见问题)

---

## ✨ 功能特性

### 核心功能

#### 🎨 多模态输入系统
8种输入模式，应对不同场景：

| 模式 | 前缀 | 说明 | 示例 |
|------|------|------|------|
| 对话模式 | `>` | AI对话交互 | `> 帮我分析这段代码` |
| Bash模式 | `!` | 执行Shell命令 | `! ls -la` |
| 命令模式 | `/` | AICLI内置命令 | `/help` |
| 记忆模式 | `#` | 项目记忆管理 | `# 技术栈: React + Node.js` |
| Agent模式 | `@` | 调用专业AI代理 | `@review 审查代码` |
| 工具模式 | `$` | 直接调用工具 | `$format` |
| 宏模式 | `%` | 执行自定义宏 | `%deploy` |
| 多行模式 | `\\` | 多行输入 | `\\ 第一行\n第二行` |

#### 📝 完整Vim模式
业界最强的CLI Vim实现：

- ✅ **完整Vim操作**
  - Normal模式：hjkl移动、dd删除、yy复制、p粘贴
  - Insert模式：i/a/o进入，支持中文和多行
  - Visual模式：v选择，y复制，d删除
  - Command模式：:wq保存退出、:q!放弃、:w保存

- ✅ **中文输入支持** - 完美支持中文字符
- ✅ **多行编辑** - Enter创建新行，无限行数
- ✅ **自动AI发送** - 保存后自动发送给AI
- ✅ **丝滑体验** - 即时响应，清晰状态显示

#### 💡 智能补全系统

- **Tab补全**
  - 命令补全：`/he` + Tab → `/help`
  - Agent补全：`@rev` + Tab → `@review`
  - 工具/宏补全：`$for` + Tab → `$format`
  - 路径补全：`~/Doc` + Tab → `~/Documents/`

- **智能建议**
  - 上下文感知建议
  - 历史记录智能推荐
  - 附件状态提示
  - 记忆提醒

#### 🔧 Hooks系统
任务执行生命周期钩子：

```typescript
{
  "hooks": {
    "beforeCommand": [
      { "type": "log", "message": "开始执行命令" }
    ],
    "afterCommand": [
      { "type": "notification", "title": "命令完成" }
    ],
    "onError": [
      { "type": "http", "url": "https://api.example.com/error" }
    ]
  }
}
```

支持类型：
- `command` - 执行命令
- `script` - 执行脚本
- `notification` - 系统通知
- `log` - 日志记录
- `http` - HTTP请求

#### 🧠 记忆系统
自动管理项目和用户上下文：

- **项目记忆** (`AGENTS.md`)
  - 技术栈信息
  - 开发规范
  - 架构说明
  - 自动加载

- **用户记忆** (`~/.aicli/AGENTS.md`)
  - 个人偏好
  - 常用配置
  - 跨项目共享

- **智能合并** - 自动合并项目和用户记忆

#### 👥 Subagent系统
专业AI代理：

| Agent | 功能 | 示例 |
|-------|------|------|
| `review` | 代码审查 | `@review 检查这段代码` |
| `design` | 架构设计 | `@design 设计用户认证系统` |
| `test` | 测试生成 | `@test 生成单元测试` |
| `debug` | 问题诊断 | `@debug 为什么会报错？` |
| `optimize` | 性能优化 | `@optimize 优化这个函数` |
| `document` | 文档生成 | `@document 生成API文档` |

支持自定义Agent配置。

#### 📁 文件处理

- **拖拽上传** - 直接拖拽文件到终端
- **剪贴板粘贴** - 粘贴图片、文件、文本
- **多格式支持**
  - 图片：PNG, JPG, GIF, WebP
  - 文档：PDF, TXT, MD, JSON
  - 代码：所有常见编程语言
- **附件管理** - `/attach`, `/detach`, `/list`

#### 🤖 AI服务集成

- **DeepSeek API** - 主要支持
- **OpenAI API** - 兼容支持
- **流式响应** - 实时显示AI回复
- **会话管理** - 持久化对话历史
- **上下文管理** - 自动加载记忆上下文

### 增强功能

#### 🎯 用户体验

- **零配置** - 智能默认值，开箱即用
- **三级UI布局** - 最小化、增强、专业
- **丰富的视觉元素** - 颜色、图标、状态栏
- **即时响应** - 流畅的交互体验
- **优雅错误处理** - 友好的错误提示和建议

#### ⚡ 性能优化

- **快速启动** - < 100ms冷启动时间
- **懒加载** - 按需加载模块
- **并行初始化** - 多任务并行处理
- **内存优化** - 高效的资源管理
- **流式输出** - 渐进式内容显示

#### 🔐 安全特性

- **API密钥管理** - 环境变量安全存储
- **文件类型验证** - 安全的文件上传
- **输入清理** - 防止注入攻击
- **会话隔离** - 独立的会话管理

---

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- DeepSeek API密钥或OpenAI API密钥

### 安装

#### 方式1：npm全局安装（推荐）

```bash
npm install -g aicli
```

#### 方式2：从源码安装

```bash
# 克隆仓库
git clone https://github.com/TaylorChen/aicli.git
cd aicli

# 安装依赖
npm install

# 构建
npm run build

# 链接到全局
npm link
```

### 配置

设置API密钥：

```bash
# DeepSeek API
export DEEPSEEK_API_KEY=your_deepseek_api_key

# 或使用OpenAI API
export OPENAI_API_KEY=your_openai_api_key
```

添加到 `~/.bashrc` 或 `~/.zshrc` 以持久化。

### 启动

```bash
# 启动AICLI
npm run ultimate

# 或如果全局安装
aicli
```

### 第一次使用

```bash
# 查看帮助
> /help

# 查看所有模式
> /modes

# 尝试AI对话
> 你好，请介绍一下你的功能

# 尝试Vim编辑
> /vim
i
输入你的问题...
ESC
:wq

# 查看版本
> /version
```

---

## 🎨 多模态输入系统

### 对话模式 (>)

直接与AI对话：

```bash
> 帮我分析这段代码的性能问题
> 如何优化React组件渲染？
> 解释一下什么是闭包
```

### Bash模式 (!)

执行Shell命令：

```bash
! ls -la
! git status
! npm run test
! find . -name "*.ts"
```

### 命令模式 (/)

使用AICLI内置命令：

```bash
/help              # 显示帮助
/modes             # 显示所有模式
/vim               # 进入Vim编辑模式
/clear             # 清除屏幕
/history           # 查看历史
/attach file.txt   # 添加附件
/status            # 查看状态
```

### 记忆模式 (#)

管理项目记忆：

```bash
# 技术栈: React + TypeScript + Node.js
# 数据库: PostgreSQL + Redis
# 开发规范: ESLint + Prettier

/memory show       # 查看记忆
/memory edit       # 编辑记忆
```

### Agent模式 (@)

调用专业AI代理：

```bash
@review 这段代码有什么问题？
@design 设计一个用户认证系统
@test 为这个函数生成测试用例
@debug 为什么会出现内存泄漏？
@optimize 如何提升这个算法的性能？
```

### 工具模式 ($)

直接调用工具：

```bash
$format          # 格式化代码
$lint            # 运行Linter
$analyze         # 代码分析
```

### 宏模式 (%)

执行自定义宏：

```bash
%deploy          # 部署到生产环境
%test-all        # 运行所有测试
%backup          # 备份数据
```

### 多行模式 (\\)

输入多行内容：

```bash
\\ 第一行
第二行
第三行
<空行结束>
```

---

## 📝 完整Vim模式

### 进入Vim

```bash
> /vim
```

### Vim操作

#### Normal模式（默认）

**移动**：
- `h/j/k/l` - 左/下/上/右
- `w` - 下一个词
- `b` - 上一个词
- `0` - 行首
- `$` - 行尾
- `gg` - 文件开头
- `G` - 文件结尾

**进入Insert模式**：
- `i` - 当前位置插入
- `I` - 行首插入
- `a` - 后一个位置插入
- `A` - 行尾插入
- `o` - 下方新行插入
- `O` - 上方新行插入

**删除**：
- `x` - 删除字符
- `dd` - 删除行
- `dw` - 删除词

**复制粘贴**：
- `yy` - 复制行
- `p` - 后方粘贴
- `P` - 前方粘贴

**其他**：
- `v` - 进入Visual模式
- `:` - 进入Command模式
- `u` - 撤销
- `ZZ` - 保存并退出

#### Insert模式

- **Enter** - 创建新行
- **Backspace** - 删除字符
- **方向键** - 移动光标
- **任意字符** - 输入（包括中文）
- **ESC** - 返回Normal模式

#### Visual模式

- `hjkl` - 移动选择
- `y` - 复制选中
- `d` - 删除选中
- `ESC` - 返回Normal模式

#### Command模式

- `:w` - 保存
- `:q` - 退出
- `:q!` - 放弃修改退出
- `:wq` 或 `:x` - 保存并退出
- `:123` - 跳转到第123行
- `ESC` - 返回Normal模式

### Vim + AI工作流

```bash
# 1. 进入Vim
> /vim

# 2. 编辑你的问题或代码
i
请帮我分析这段代码：

function example() {
  for (let i = 0; i < arr.length; i++) {
    // ...
  }
}

重点关注性能问题
ESC

# 3. 保存并退出
:wq

# 4. 自动发送给AI ✨
✓ Vim编辑完成

编辑内容:
────────────────────────────────────
请帮我分析这段代码：
[代码...]
────────────────────────────────────

📤 准备发送给AI...

◆ AI:

这段代码存在以下性能问题：
1. 每次循环都访问arr.length...
2. 建议优化方案...
```

---

## 💡 智能补全系统

### Tab补全

#### 命令补全

```bash
/he<Tab>      → /help
/vi<Tab>      → /vim
/mo<Tab>      → /modes
/at<Tab>      → /attach
```

#### Agent补全

```bash
@rev<Tab>     → @review
@des<Tab>     → @design
@tes<Tab>     → @test
```

#### 工具/宏补全

```bash
$for<Tab>     → $format
$lin<Tab>     → $lint
%dep<Tab>     → %deploy
```

#### 路径补全

```bash
~/Doc<Tab>    → ~/Documents/
./src/<Tab>   → ./src/components/
../pa<Tab>    → ../package.json
```

### 智能建议

输入空行时显示智能建议：

```bash
> <Enter>

💡 智能建议:
  • 试试 /vim 进入编辑器
  • 使用 @review 进行代码审查
  • /attach 添加文件附件
```

根据上下文提供不同建议：
- 有附件时：提示发送给AI
- 有记忆时：提示查看记忆
- 历史记录：提示最近命令

---

## 🔧 Hooks系统

### 配置Hooks

在 `~/.aicli/hooks.json`：

```json
{
  "hooks": {
    "beforeCommand": [
      {
        "type": "log",
        "message": "开始执行命令: {{command}}"
      }
    ],
    "afterCommand": [
      {
        "type": "notification",
        "title": "命令完成",
        "body": "{{command}} 执行完成"
      },
      {
        "type": "http",
        "url": "https://api.example.com/track",
        "method": "POST",
        "data": {
          "command": "{{command}}",
          "timestamp": "{{timestamp}}"
        }
      }
    ],
    "onError": [
      {
        "type": "log",
        "message": "错误: {{error}}",
        "level": "error"
      },
      {
        "type": "command",
        "command": "echo '错误已记录'"
      }
    ]
  }
}
```

### Hook类型

#### 1. Command

执行Shell命令：

```json
{
  "type": "command",
  "command": "echo 'Hello World'"
}
```

#### 2. Script

执行脚本文件：

```json
{
  "type": "script",
  "path": "./scripts/post-command.sh"
}
```

#### 3. Notification

显示系统通知：

```json
{
  "type": "notification",
  "title": "标题",
  "body": "内容"
}
```

#### 4. Log

记录日志：

```json
{
  "type": "log",
  "message": "日志信息",
  "level": "info"
}
```

#### 5. HTTP

发送HTTP请求：

```json
{
  "type": "http",
  "url": "https://api.example.com/webhook",
  "method": "POST",
  "data": {"key": "value"}
}
```

### 变量替换

Hooks支持变量：

- `{{command}}` - 命令内容
- `{{input}}` - 用户输入
- `{{timestamp}}` - 时间戳
- `{{sessionId}}` - 会话ID
- `{{error}}` - 错误信息（onError）

---

## 🧠 记忆系统

### 项目记忆

在项目根目录创建 `AGENTS.md`：

```markdown
---
version: 2.4.0
created: 2025-10-26
updated: 2025-10-26
---

# 项目记忆 - MyProject

## 技术栈
- Frontend: React 18 + TypeScript
- Backend: Node.js + Express
- Database: PostgreSQL + Redis

## 开发规范
1. 代码风格: ESLint + Prettier
2. 命名约定: camelCase for variables, PascalCase for components
3. 注释规范: JSDoc for functions

## 架构说明
- 采用MVC架构
- API使用RESTful设计
- 前后端分离部署

## 常用命令
- `npm run dev` - 开发模式
- `npm run build` - 构建生产版本
- `npm test` - 运行测试

## 注意事项
- 所有API请求需要认证
- 数据库连接使用连接池
- 图片上传限制5MB
```

### 用户记忆

在 `~/.aicli/AGENTS.md`：

```markdown
# 用户记忆

## 个人偏好
- 编程语言: TypeScript, Python
- 框架偏好: React, FastAPI
- 代码风格: 函数式编程

## 常用配置
- Editor: VSCode
- Terminal: iTerm2
- Package Manager: pnpm

## 工作流程
1. 使用 @review 审查代码
2. 使用 @test 生成测试
3. 使用 /vim 编写长问题
```

### 记忆命令

```bash
# 查看记忆
/memory show

# 编辑项目记忆
/memory edit

# 编辑用户记忆
/memory edit --user

# 添加快速记忆
# 这是新的记忆内容

# 清除记忆（会话内）
/memory clear
```

### 自动加载

记忆会自动加载并作为上下文发送给AI：

```
[项目记忆]
技术栈: React + Node.js
开发规范: ESLint...

[用户消息]
你的问题...
```

---

## 👥 Subagent系统

### 内置Agents

#### @review - 代码审查

```bash
@review 检查这段代码的问题

@review 
function calculateTotal(items) {
  let total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}
```

#### @design - 架构设计

```bash
@design 设计一个用户认证系统

需求：
- 支持邮箱/手机号登录
- JWT token认证
- 第三方登录（微信、GitHub）
- 密码加密存储
```

#### @test - 测试生成

```bash
@test 为这个函数生成单元测试

function add(a, b) {
  return a + b;
}
```

#### @debug - 问题诊断

```bash
@debug 为什么会报错？

Error: Cannot read property 'map' of undefined
at Component.render (App.js:25)
```

#### @optimize - 性能优化

```bash
@optimize 如何优化这个查询？

SELECT * FROM users 
WHERE age > 18 
ORDER BY created_at DESC
LIMIT 100
```

#### @document - 文档生成

```bash
@document 生成API文档

export async function getUserById(id: string): Promise<User> {
  const user = await db.users.findUnique({ where: { id } });
  if (!user) throw new Error('User not found');
  return user;
}
```

### 自定义Agent

在 `~/.aicli/agents.json`：

```json
{
  "agents": [
    {
      "name": "translate",
      "description": "翻译文本",
      "systemPrompt": "你是一个专业的翻译助手，擅长中英文互译",
      "tools": ["translator"],
      "examples": [
        "将以下内容翻译成英文：你好世界"
      ]
    },
    {
      "name": "explain",
      "description": "解释概念",
      "systemPrompt": "你是一个教育专家，擅长用简单的语言解释复杂概念",
      "tools": ["knowledge_base"],
      "examples": [
        "解释什么是闭包"
      ]
    }
  ]
}
```

使用：

```bash
@translate 
Hello World

@explain
什么是Docker？
```

### 查看Agents

```bash
# 列出所有agents
/agents list

# 查看agent详情
/agents info review
```

---

## 📋 命令参考

### 基础命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 显示帮助信息 | `/help` |
| `/version` | 显示版本信息 | `/version` |
| `/clear` | 清除屏幕 | `/clear` |
| `/exit` | 退出程序 | `/exit` |
| `/status` | 显示状态信息 | `/status` |

### 编辑命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/vim` | 进入Vim编辑模式 | `/vim` |
| `/editor` | 使用外部编辑器 | `/editor` |

### 模式命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/modes` | 显示所有输入模式 | `/modes` |
| `/mode <mode>` | 切换到指定模式 | `/mode bash` |

### 记忆命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/memory show` | 显示记忆内容 | `/memory show` |
| `/memory edit` | 编辑项目记忆 | `/memory edit` |
| `/memory edit --user` | 编辑用户记忆 | `/memory edit --user` |
| `/memory clear` | 清除记忆（会话） | `/memory clear` |

### Agent命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/agents list` | 列出所有agents | `/agents list` |
| `/agents info <name>` | 查看agent详情 | `/agents info review` |

### 附件命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/attach <file>` | 添加附件 | `/attach report.pdf` |
| `/detach` | 清除所有附件 | `/detach` |
| `/list` | 列出当前附件 | `/list` |

### 历史命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/history` | 显示命令历史 | `/history` |
| `/history clear` | 清除历史记录 | `/history clear` |

### 会话命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/session list` | 列出所有会话 | `/session list` |
| `/session load <id>` | 加载会话 | `/session load abc123` |
| `/session new` | 创建新会话 | `/session new` |

### MCP命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/mcp list` | 列出MCP服务器 | `/mcp list` |
| `/mcp start <name>` | 启动服务器 | `/mcp start sqlite` |
| `/mcp stop <name>` | 停止服务器 | `/mcp stop sqlite` |

### 配置命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/config show` | 显示配置 | `/config show` |
| `/config set <key> <value>` | 设置配置 | `/config set theme dark` |
| `/config reset` | 重置配置 | `/config reset` |

### 其他命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/update` | 检查更新 | `/update` |
| `/compact` | 压缩历史（开发中） | `/compact` |

---

## ⚙️ 配置说明

### 环境变量

```bash
# API密钥
export DEEPSEEK_API_KEY=your_key
export OPENAI_API_KEY=your_key

# 调试模式
export AICLI_DEBUG=true

# 自定义配置目录
export AICLI_CONFIG_DIR=~/.aicli
```

### 配置文件

#### 主配置 (`~/.aicli/config.json`)

```json
{
  "theme": "dark",
  "language": "zh-CN",
  "model": "deepseek-chat",
  "maxTokens": 4000,
  "temperature": 0.7,
  "autoSave": true,
  "historyLimit": 100
}
```

#### Hooks配置 (`~/.aicli/hooks.json`)

见 [Hooks系统](#-hooks系统)

#### Agents配置 (`~/.aicli/agents.json`)

见 [Subagent系统](#-subagent系统)

#### MCP配置 (`~/.aicli/mcp.json`)

```json
{
  "servers": {
    "sqlite": {
      "command": "mcp-server-sqlite",
      "args": ["--db", "./data.db"]
    }
  }
}
```

---

## 💻 开发指南

### 项目结构

```
aicli/
├── src/
│   ├── commands/          # 命令处理
│   ├── config/            # 配置管理
│   ├── core/              # 核心功能
│   │   ├── full-vim-mode.ts        # 完整Vim模式
│   │   ├── multimodal-input-handler.ts  # 多模态输入
│   │   ├── smart-completer.ts      # 智能补全
│   │   ├── hooks-manager.ts        # Hooks管理
│   │   ├── memory-manager.ts       # 记忆管理
│   │   └── subagent-manager.ts     # Subagent管理
│   ├── services/          # 服务层
│   │   └── deepseek-integration.ts # DeepSeek集成
│   ├── ui/                # 用户界面
│   │   └── ultimate-cli-interface.ts  # 主界面
│   └── types/             # 类型定义
├── bin/                   # 可执行文件
├── dist/                  # 编译输出
├── docs/                  # 文档
└── tests/                 # 测试

```

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/TaylorChen/aicli.git
cd aicli

# 安装依赖
npm install

# 开发模式（支持热重载）
npm run dev

# 构建
npm run build

# 运行测试
npm test

# 类型检查
npm run typecheck

# Lint
npm run lint
```

### 添加新命令

1. 在 `src/core/enhanced-command-handler.ts` 添加命令处理
2. 在 `src/core/smart-completer.ts` 添加补全支持
3. 更新 `/help` 命令输出
4. 添加测试

### 添加新Agent

1. 在 `src/core/subagent-manager.ts` 定义Agent
2. 或在 `~/.aicli/agents.json` 添加配置
3. 更新文档

### 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## ❓ 常见问题

### Q1: 如何配置API密钥？

```bash
# 设置环境变量
export DEEPSEEK_API_KEY=your_key

# 或在 ~/.bashrc / ~/.zshrc 中添加
echo 'export DEEPSEEK_API_KEY=your_key' >> ~/.zshrc
source ~/.zshrc
```

### Q2: Vim模式如何退出？

```
:wq   - 保存并退出
:q!   - 放弃修改退出
ZZ    - 保存并退出
```

### Q3: 如何查看所有可用命令？

```bash
/help     # 查看帮助
/modes    # 查看所有模式
```

### Q4: 智能补全不工作？

确保：
1. 输入了命令前缀（如 `/he`）
2. 按下 Tab 键
3. Node.js版本 >= 18

### Q5: 如何添加自定义Agent？

在 `~/.aicli/agents.json` 添加配置：

```json
{
  "agents": [
    {
      "name": "custom",
      "description": "自定义Agent",
      "systemPrompt": "你的提示词",
      "tools": []
    }
  ]
}
```

### Q6: 文件拖拽不工作？

1. 确保终端支持拖拽
2. 尝试使用 `/attach` 命令
3. 检查文件权限

### Q7: 如何启用调试模式？

```bash
export AICLI_DEBUG=true
npm run ultimate
```

### Q8: 支持哪些AI模型？

- DeepSeek Chat（推荐）
- OpenAI GPT-3.5/4
- 兼容OpenAI API的其他模型

### Q9: 如何清除历史记录？

```bash
/history clear
```

### Q10: 项目记忆在哪里？

- 项目记忆：项目根目录的 `AGENTS.md`
- 用户记忆：`~/.aicli/AGENTS.md`

---

## 📖 完整文档

- [Vim模式详细文档](./FULL_VIM_MODE.md)
- [Vim + AI集成说明](./VIM_AI_INTEGRATION.md)
- [Vim输入冲突修复](./VIM_INPUT_CONFLICT_FIX.md)
- [调试指南](./VIM_DEBUG_GUIDE.md)
- [使用指南](./USAGE.md)

---

## 🗺️ 路线图

### v2.5.0（计划中）
- [ ] 历史压缩功能
- [ ] 更多内置Agents
- [ ] 插件系统
- [ ] Web界面

### v2.6.0（计划中）
- [ ] 多语言支持
- [ ] 语音输入
- [ ] 协作模式
- [ ] 云端同步

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 🙏 致谢

感谢以下项目的启发和支持：

- [Claude CLI](https://github.com/anthropics/claude-cli) - AI CLI设计参考
- [Qoder CLI](https://github.com/qoder/cli) - 交互设计参考
- [Vim](https://www.vim.org/) - 编辑器设计参考

---

## 📞 联系方式

- GitHub: [@TaylorChen](https://github.com/TaylorChen)
- Issues: [GitHub Issues](https://github.com/TaylorChen/aicli/issues)

---

<div align="center">

**用AICLI，让AI成为你的终极命令行助手！** ✨

Made with ❤️ by AICLI Team

</div>
