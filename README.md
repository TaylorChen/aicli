# AICLI - Enhanced AI Programming Assistant Terminal Tool

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)

一个完全参考 Claude Code CLI 设计的增强版 AI 编程助手终端工具，提供 Claude 风格的现代化交互体验，支持截图粘贴等创新功能。

## ✨ 增强特性

### 🎯 Claude Code CLI 风格体验
- 🔄 **流式响应**: 实时显示 AI 回复内容，支持中断
- 📊 **状态栏**: 实时显示模型状态、token 使用情况、响应时间
- 🏗️ **项目感知**: 自动检测项目类型和上下文
- ⚡ **高性能**: 优化的响应速度和内存管理，防抖动渲染
- 🎨 **现代化界面**: 彩色渐变、动画效果、智能提示
- 📸 **截图粘贴**: 支持直接粘贴截图到输入框

### 🚀 核心功能
- 🤖 **多模型支持**: Claude、DeepSeek、Kimi、OpenAI、Gemini、Grok 等
- ⚡ **增强斜杠命令**: 丰富的文件操作和项目管理命令
- 🔄 **多窗口支持**: 支持同时打开多个终端窗口
- 📝 **会话管理**: 持久化对话历史，支持导入导出
- 🛠️ **文件操作**: 内置文件浏览、搜索、编辑功能
- 🔧 **智能配置**: 环境变量自动检测和配置管理
- 📊 **统计面板**: 使用统计和性能监控
- 📋 **智能粘贴**: 自动识别剪贴板内容类型（图片、文件、文本）

## 🚀 快速开始

### 安装

```bash
npm install -g aicli
```

### 配置 API Key

设置环境变量来配置你的 API Key：

```bash
# Claude (Anthropic)
export ANTHROPIC_API_KEY=your_api_key_here

# DeepSeek
export DEEPSEEK_API_KEY=your_api_key_here

# Kimi (Moonshot)
export MOONSHOT_API_KEY=your_api_key_here

# OpenAI
export OPENAI_API_KEY=your_api_key_here

# Gemini
export GOOGLE_API_KEY=your_api_key_here

# Grok
export GROK_API_KEY=your_api_key_here
```

### 启动

```bash
# 启动现代化界面（推荐，支持截图粘贴）
aicli modern

# 启动标准界面
aicli start

# 或者简单启动
aicli
```

## 📖 使用指南

### 基础使用

启动现代化界面后，你可以：

1. **直接输入消息**开始与 AI 对话
2. **输入斜杠命令**执行快捷操作
3. **使用快捷键**控制界面
4. **粘贴截图**使用 `/paste` 命令直接粘贴剪贴板中的截图或文件

#### 📸 截图粘贴功能（推荐）

这是 AICLI 2.1+ 的核心创新功能：

```bash
# 方法1：使用 /paste 命令（推荐）
/paste

# 方法2：在某些终端中也可以尝试 Ctrl+V
```

支持的内容类型：
- 📸 **截图/图片**: PNG、JPEG、GIF、WebP、BMP 格式，自动生成 `@image(filename)` 语法
- 📄 **文件**: 任何文件类型，自动读取内容并生成 `@file(filename)` 语法
- 📝 **文本**: 直接插入到输入框
- 📎 **多文件**: 同时粘贴多个文件，为每个生成引用语法

**使用步骤**：
1. 截取屏幕截图（Cmd+Shift+4/5 或 PrtScn）
2. 在 AICLI 界面中输入 `/paste`
3. 按回车执行
4. 系统自动处理并插入对应的引用语法

### 增强斜杠命令

#### 基础命令
| 命令 | 别名 | 描述 |
|------|------|------|
| `/help` | `/h` | 显示帮助信息 |
| `/paste` | - | 粘贴剪贴板内容（支持截图、文件、文本） |
| `/provider` | `/p` | 切换 AI 提供商 |
| `/model` | `/m` | 切换模型 |
| `/status` | `/s` | 显示当前状态 |
| `/clear` | `/c` | 清屏 |
| `/exit` | `/quit`, `/q` | 退出程序 |
| `/config` | `/cfg` | 显示配置信息 |

#### 文件操作命令
| 命令 | 别名 | 描述 |
|------|------|------|
| `/ls` | `/list`, `/dir` | 列出文件 |
| `/cat` | `/read`, `/view` | 查看文件内容 |
| `/tree` | `/files` | 显示文件树 |
| `/search` | `/find`, `/grep` | 搜索文件内容 |
| `/edit` | `/write`, `/modify` | 编辑文件 |

#### 项目管理命令
| 命令 | 别名 | 描述 |
|------|------|------|
| `/project` | `/proj`, `/context` | 显示项目信息 |
| `/session` | `/sess`, `/history` | 会话管理 |

#### 增强快捷键
- `Ctrl+C` - 退出程序 / 中断流式响应
- `Ctrl+L` - 清屏
- `↑/↓` - 历史记录导航
- `Tab` - 自动补全命令
- `/paste` - 智能粘贴剪贴板内容（截图、文件、文本）

### 快捷键

- `Ctrl+C` - 退出程序
- `Ctrl+L` - 清屏
- `↑/↓` - 历史记录导航

### 增强命令行模式

```bash
# 启动现代化界面（推荐，支持截图粘贴）
aicli modern

# 启动标准界面
aicli start

# 会话管理
aicli session --list              # 列出所有会话
aicli session --save <id>         # 保存会话
aicli session --load <id>         # 加载会话
aicli session --export <id>       # 导出会话
aicli session --import <file>     # 导入会话

# 项目管理
aicli project --info              # 显示项目信息
aicli project --scan              # 扫描项目文件
aicli project --tree [depth]      # 显示文件树

# 统计信息
aicli stats                       # 显示使用统计

# 基础命令
aicli status                      # 查看状态
aicli provider --set deepseek      # 切换提供商
aicli provider --list             # 列出所有提供商
aicli model --set deepseek-coder   # 切换模型
aicli model --list                # 列出当前提供商的模型
aicli config --list                # 显示配置
aicli config --reset              # 重置配置
aicli env                         # 显示环境变量配置说明
```

## 🔧 配置

### 环境变量

| 变量名 | 描述 | 获取地址 |
|--------|------|----------|
| `ANTHROPIC_API_KEY` | Claude API Key | https://console.anthropic.com |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | https://platform.deepseek.com |
| `MOONSHOT_API_KEY` | Kimi API Key | https://platform.moonshot.cn |
| `OPENAI_API_KEY` | OpenAI API Key | https://platform.openai.com |
| `GOOGLE_API_KEY` | Gemini API Key | https://makersuite.google.com |
| `GROK_API_KEY` | Grok API Key | https://console.x.ai |

### 配置文件

配置文件位于 `~/.config/aicli/config.json`，包含以下选项：

```json
{
  "currentProvider": "claude",
  "currentModel": "claude-3-sonnet-20240229",
  "theme": "dark",
  "autoSave": true,
  "sessionHistory": 100
}
```

## 📁 增强项目结构

```
aicli/
├── src/
│   ├── types/           # TypeScript 类型定义
│   │   └── index.ts     # 统一类型定义
│   ├── config/          # 配置管理
│   │   ├── providers.ts # 提供商配置
│   │   └── index.ts     # 配置管理器
│   ├── core/            # 核心功能
│   │   ├── project-context.ts      # 项目上下文
│   │   ├── status-bar.ts           # 状态栏
│   │   ├── streaming-ai.ts         # 流式 AI
│   │   ├── file-operations.ts      # 文件操作
│   │   ├── session-manager.ts      # 会话管理
│   │   ├── clipboard-processor.ts  # 剪贴板处理器
│   │   ├── file-processor.ts       # 文件处理器
│   │   └── screenshot-paste-handler.ts # 截图粘贴处理器
│   ├── services/        # AI 服务
│   ├── commands/        # 斜杠命令
│   │   ├── slash.ts             # 基础命令
│   │   └── enhanced-slash.ts     # 增强命令
│   ├── ui/             # 用户界面
│   │   ├── terminal.ts           # 基础终端
│   │   └── modern-cli-interface.ts # 现代化界面
│   ├── index.ts        # 主入口
│   └── index-enhanced.ts # 增强入口
├── dist/               # 编译输出
├── SCREENSHOT_PASTE.md # 截图粘贴功能文档
├── README.md           # 说明文档
└── package.json        # 项目配置
```

## 🛠️ 开发

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
```

### 代码检查

```bash
npm run lint
npm run typecheck
```

## 📦 发布

### 构建和发布

```bash
npm run build
npm publish
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- Claude CLI - 界面设计灵感
- OpenAI - AI 技术支持
- 所有开源贡献者

## 📞 联系

- GitHub Issues: https://github.com/your-username/aicli/issues
- Email: your-email@example.com

---

## 🎉 完成！享受 Claude Code CLI 风格的增强体验！🚀

### 🌟 主要改进对比

| 特性 | 原版 | 增强版 |
|------|------|--------|
| 响应方式 | 块状响应 | 流式响应 |
| 界面设计 | 基础终端 | 现代化界面 + 状态栏 |
| 项目感知 | 无 | 自动检测 |
| 文件操作 | 基础 | 丰富命令 |
| 会话管理 | 基础 | 完整持久化 |
| 性能 | 标准 | 优化加速 + 防抖动渲染 |
| 截图粘贴 | 无 | 智能识别 + 自动引用 |
| 剪贴板 | 基础文本 | 图片、文件、多内容 |

### 🚀 下一步计划

- [ ] 代码补全和智能提示
- [ ] 多文件编辑支持
- [ ] 插件系统
- [ ] 团队协作功能
- [ ] 更多 AI 模型集成

### 💡 使用提示

1. **首次使用**: 先配置 API Key，然后运行 `aicli modern`
2. **截图粘贴**: 使用 `/paste` 命令快速粘贴截图和文件
3. **项目感知**: 在项目目录中启动，自动识别项目类型
4. **流式响应**: 支持实时中断，按 Ctrl+C 停止
5. **会话保存**: 使用 `/session save` 保存重要对话
6. **文件操作**: 使用 `/tree`, `/search`, `/cat` 等命令管理文件
7. **性能优化**: 界面使用防抖动渲染，避免频繁刷新

---

**享受现代化的 AI 编程体验！** 🎯

## 📝 更新日志

### v2.1.0 - 📸 截图粘贴版本

#### ✨ 新增功能
- 🎯 **截图粘贴功能**: 支持直接粘贴截图到输入框
- 📋 **智能剪贴板识别**: 自动检测图片、文件、文本内容
- 🎨 **现代化界面升级**: 优化渲染性能，防抖动机制
- ⚡ **性能优化**: 解决界面频繁刷新问题
- 🛠️ **新命令**: 添加 `/paste` 智能粘贴命令

#### 🔧 技术改进
- 重构类型系统，统一到 `src/types/index.ts`
- 优化渲染流程，添加防抖动机制
- 修复栈溢出错误，简化键盘事件处理
- 增强剪贴板处理器，支持多种内容格式
- 完善文件处理器，支持大文件处理

#### 📚 文档
- 新增 `SCREENSHOT_PASTE.md` 详细功能文档
- 更新 README，添加截图粘贴使用指南
- 完善项目结构说明

### v2.0.0 - 🚀 基础增强版本

- Claude Code CLI 风格界面
- 流式响应支持
- 状态栏显示
- 项目感知功能
- 增强斜杠命令
- 会话管理系统