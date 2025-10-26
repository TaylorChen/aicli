# AICLI - 现代化AI命令行助手

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)

一个现代化的AI编程助手命令行工具，参考Claude CLI设计理念，提供简洁、高效、直观的交互体验。

## ✨ 核心特性

### 🎯 简洁设计
- **渐进式复杂度** - 从最简单到最复杂的使用方式
- **零配置启动** - 智能检测配置，开箱即用
- **统一入口** - 单一命令，多种模式

### 🚀 强大功能
- **多AI提供商** - 支持 DeepSeek、OpenAI、Claude 等
- **文件拖拽** - 直接拖拽文件到终端自动识别
- **Vim模式** - 完整的Vim编辑体验
- **会话管理** - 持久化对话历史
- **流式响应** - 实时显示AI回复

### ⚡ 极致性能
- **快速启动** - < 1秒冷启动
- **低内存占用** - < 100MB运行内存
- **智能缓存** - 按需加载模块

## 🚀 快速开始

### 安装

```bash
# 全局安装
npm install -g aicli

# 或本地安装
npm install aicli
```

### 配置

设置API密钥（选择一个）：

```bash
# DeepSeek（推荐）
export DEEPSEEK_API_KEY=your_api_key

# OpenAI
export OPENAI_API_KEY=your_api_key

# Claude
export CLAUDE_API_KEY=your_api_key
```

### 使用

```bash
# 渐进式使用方式

# Level 1: 最简单 - 直接提问
aicli "hello, explain quantum computing"

# Level 2: 打印模式
aicli -p "analyze this code"

# Level 3: 交互模式
aicli

# Level 4: 会话管理
aicli -c "继续我们的讨论"
aicli -r session-123 "恢复这个会话"
```

## 📖 主要命令

### 基本用法

```bash
aicli [选项] [查询]

选项:
  -p, --print              打印模式（非交互）
  -c, --continue           继续最近的对话
  -r, --resume <id>        恢复特定会话
  -m, --model <name>       指定模型
  --provider <name>        指定AI提供商
  -k, --api-key <key>      指定API密钥
  --verbose                详细输出
  -h, --help               显示帮助
```

### 交互模式命令

进入交互模式后可使用：

```bash
/help                      显示帮助
/paste                     粘贴剪贴板
/att                       查看附件
/clear                     清空附件
/vim                       进入Vim模式
/status                    系统状态
/quit                      退出
```

### 文件操作

```bash
# 直接拖拽文件到终端
# 支持: PDF, 图片, 代码, 文档等所有文件类型

# 查看附件
/att

# 删除附件
/rm 1

# 清空附件
/clear
```

## 🎯 使用场景

### 代码开发

```bash
# 分析代码
cat app.js | aicli -p "find bugs in this code"

# 生成代码
aicli "create a React component for user profile"

# 重构代码
aicli -p "refactor this function to be more efficient" < old-code.js
```

### 文档处理

```bash
# 分析PDF
# 拖拽PDF文件到终端
aicli "summarize this document"

# 生成文档
aicli "write API documentation for this code" < api.ts
```

### 学习研究

```bash
# 交互式学习
aicli
> 解释什么是量子计算
> 给我一些实际应用例子
> 推荐相关学习资源
```

## 📁 项目结构

```
aicli/
├── bin/
│   └── aicli                    # 启动脚本
├── src/
│   ├── modern-cli.ts            # 主入口
│   ├── config/                  # 配置管理
│   ├── core/                    # 核心功能
│   │   ├── enhanced-vim-mode.ts
│   │   ├── error-handler.ts
│   │   ├── zero-config.ts
│   │   └── ...
│   ├── services/                # AI服务
│   │   ├── deepseek-integration.ts
│   │   └── enhanced-ai-service.ts
│   ├── ui/                      # 用户界面
│   │   ├── enhanced-cli-interface.ts
│   │   └── minimal-cli-interface.ts
│   └── sdk/                     # SDK接口
├── docs/                        # 文档
│   ├── guides/                  # 使用指南
│   └── design/                  # 设计文档
└── README.md
```

## ⚙️ 配置选项

### 环境变量

```bash
DEEPSEEK_API_KEY               DeepSeek API密钥
OPENAI_API_KEY                 OpenAI API密钥
CLAUDE_API_KEY                 Claude API密钥
```

### 配置文件

创建 `~/.config/aicli/config.json`:

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "maxFiles": 20,
  "maxFileSize": 52428800
}
```

## 🔧 开发

### 本地开发

```bash
# 克隆项目
git clone https://github.com/your-repo/aicli.git
cd aicli

# 安装依赖
npm install

# 开发模式
npm run dev

# 编译
npm run build

# 运行
npm start
```

### 脚本说明

```bash
npm start          # 运行编译后的版本
npm run dev        # 开发模式（ts-node）
npm run build      # 编译TypeScript
npm run clean      # 清理编译文件
npm run typecheck  # 类型检查
npm run lint       # 代码检查
npm test           # 运行测试
```

## 📚 文档

- **[使用指南](docs/guides/)** - 详细的使用说明
- **[设计文档](docs/design/)** - 架构和设计理念
- **[更新日志](CHANGELOG.md)** - 版本更新记录
- **[优化总结](OPTIMIZATION_SUMMARY.md)** - 性能优化详情

## 🎯 特色功能

### 1. 文件拖拽

直接拖拽任何文件到终端：

```
❯ /Users/name/document.pdf

✓ 文件已添加: document.pdf
  类型: application/pdf
  大小: 1.5 MB

❯ 请分析这份文档
```

### 2. Vim模式

完整的Vim编辑体验：

```bash
/vim                    # 进入Vim模式

# Normal模式
h/j/k/l                # 移动
dd                     # 删除行
yy                     # 复制行

# Command模式
:q                     # 退出
:w                     # 保存
:wq                    # 保存并退出
```

### 3. 零配置

智能检测配置，自动使用可用的AI服务：

```bash
# 只需设置一个API密钥即可开始
export DEEPSEEK_API_KEY=your_key
aicli "test"
```

## 🔄 版本历史

### v2.2.0 (当前)
- ✅ 统一项目入口
- ✅ 清理无用代码
- ✅ 优化启动性能
- ✅ 完善文件拖拽
- ✅ 增强Vim支持

### v2.1.0
- ✅ Vim模式完整实现
- ✅ 性能优化
- ✅ 错误处理改进

### v2.0.0
- ✅ 现代化界面重构
- ✅ 流式响应支持
- ✅ 文件处理增强

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- Claude CLI - 设计灵感
- DeepSeek - AI服务支持
- 开源社区 - 技术支持

## 📞 支持

- **GitHub Issues**: [提交问题](https://github.com/your-repo/aicli/issues)
- **文档**: [在线文档](docs/)
- **社区**: [讨论区](https://github.com/your-repo/aicli/discussions)

---

**享受现代化的AI CLI体验！** 🚀

*Built with ❤️ using TypeScript*
