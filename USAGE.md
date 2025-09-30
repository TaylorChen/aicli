# 🚀 增强版 AICLI 使用指南

## 📦 安装

```bash
npm install -g aicli
```

## 🎯 快速启动

增强版AICLI现在只有一个统一的入口点，使用非常简单：

### 基本启动
```bash
# 直接启动，默认进入交互式界面
aicli
```

### 查看帮助
```bash
aicli --help
```

### 验证系统
```bash
aicli validate
```

## 🛠️ 主要功能

### 1. 交互式对话（默认）
```bash
aicli
```
或者显式启动：
```bash
aicli start
```

### 2. 代码执行
```bash
# 执行代码片段
aicli exec --code "console.log('Hello World')" --language javascript

# 执行文件
aicli exec --file script.js --language javascript

# 交互式代码执行
aicli exec --interactive
```

### 3. Web搜索
```bash
# 基本搜索
aicli search --query "AI技术发展"

# AI增强搜索
aicli search --query "最新JavaScript框架" --ai

# 交互式搜索
aicli search --interactive
```

### 4. 工具调用
```bash
# 查看所有工具
aicli tool --list

# 按类别查看工具
aicli tool --categories

# 调用特定工具
aicli tool --call analyze_file --input '{"filePath": "package.json"}'

# 查看工具统计
aicli tool --stats
```

### 5. 系统状态
```bash
# 查看完整系统状态
aicli status

# 验证系统配置
aicli validate
```

### 6. 配置管理
```bash
# 查看配置
aicli config --show

# 设置提供商
aicli config --set provider openai

# 设置模型
aicli config --set model gpt-4
```

## 🔧 环境配置

在使用前，请配置相应的API密钥：

```bash
# DeepSeek (推荐)
export DEEPSEEK_API_KEY="your_deepseek_api_key"

# OpenAI
export OPENAI_API_KEY="your_openai_api_key"

# Claude
export ANTHROPIC_API_KEY="your_claude_api_key"

# 其他提供商...
```

## 🎨 界面模式

### Claude风格界面
```bash
aicli claude
```

### 现代CLI风格界面
```bash
aicli modern
```

## 📊 特性总览

- ✅ **智能配置管理** - 自动检测和优化配置
- ✅ **多AI提供商支持** - 支持6个主流AI服务
- ✅ **代码执行** - 支持9种编程语言
- ✅ **文件操作** - 智能文件分析和处理
- ✅ **图像处理** - 支持8种图像格式
- ✅ **Web搜索** - 4个搜索引擎集成
- ✅ **项目管理** - 模板、构建、部署
- ✅ **工具管理** - 统一工具调用和权限管理
- ✅ **会话管理** - 持久化会话和历史记录
- ✅ **安全验证** - 代码安全和权限控制

## 💡 使用建议

1. **首次使用**：运行 `aicli validate` 检查系统状态
2. **日常使用**：直接运行 `aicli` 进入交互式界面
3. **开发调试**：使用 `aicli exec` 快速执行代码
4. **信息查询**：使用 `aicli search` 进行Web搜索
5. **文件分析**：使用 `aicli tool --call analyze_file` 分析代码

## 🚀 启动流程

```
aicli
    ↓
🤖 欢迎使用增强版 AICLI!
    ↓
🚀 启动交互式界面...
    ↓
✅ 已注册 9 个工具
    ↓
交互式REPL界面 >
```

这样你就可以享受增强版AICLI带来的完整AI编程助手体验了！