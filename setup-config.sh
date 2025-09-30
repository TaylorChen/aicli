#!/bin/bash

# AICLI 配置脚本
# 用于设置大模型 API Key

echo "🚀 AICLI 大模型配置助手"
echo "================================"

# 检测 shell 类型
SHELL_NAME=$(basename "$SHELL")
echo "检测到 Shell: $SHELL_NAME"

# 配置文件路径
case "$SHELL_NAME" in
    "bash")
        CONFIG_FILE="$HOME/.bashrc"
        ;;
    "zsh")
        CONFIG_FILE="$HOME/.zshrc"
        ;;
    "fish")
        CONFIG_FILE="$HOME/.config/fish/config.fish"
        ;;
    *)
        echo "⚠️  未识别的 Shell，请手动配置环境变量"
        CONFIG_FILE=""
        ;;
esac

echo "配置文件: $CONFIG_FILE"
echo ""

# 显示支持的模型
echo "🤖 支持的大模型提供商:"
echo "1. Claude (Anthropic) - ANTHROPIC_API_KEY"
echo "2. DeepSeek - DEEPSEEK_API_KEY"
echo "3. Kimi (Moonshot) - MOONSHOT_API_KEY"
echo "4. OpenAI - OPENAI_API_KEY"
echo "5. Gemini (Google) - GOOGLE_API_KEY"
echo "6. Grok - GROK_API_KEY"
echo ""

# 询问用户选择
read -p "请选择要配置的模型 (输入数字 1-6): " choice

case "$choice" in
    1)
        PROVIDER="Claude"
        ENV_VAR="ANTHROPIC_API_KEY"
        API_URL="https://console.anthropic.com"
        ;;
    2)
        PROVIDER="DeepSeek"
        ENV_VAR="DEEPSEEK_API_KEY"
        API_URL="https://platform.deepseek.com"
        ;;
    3)
        PROVIDER="Kimi"
        ENV_VAR="MOONSHOT_API_KEY"
        API_URL="https://platform.moonshot.cn"
        ;;
    4)
        PROVIDER="OpenAI"
        ENV_VAR="OPENAI_API_KEY"
        API_URL="https://platform.openai.com"
        ;;
    5)
        PROVIDER="Gemini"
        ENV_VAR="GOOGLE_API_KEY"
        API_URL="https://makersuite.google.com"
        ;;
    6)
        PROVIDER="Grok"
        ENV_VAR="GROK_API_KEY"
        API_URL="https://console.x.ai"
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "📝 配置 $PROVIDER"
echo "API Key 获取地址: $API_URL"
echo ""

# 读取 API Key
read -p "请输入 $ENV_VAR: " api_key

if [ -z "$api_key" ]; then
    echo "❌ API Key 不能为空"
    exit 1
fi

# 设置环境变量
export "$ENV_VAR=$api_key"
echo "✅ 已设置临时环境变量"

# 永久保存到配置文件
if [ -n "$CONFIG_FILE" ]; then
    # 检查是否已存在该变量
    if grep -q "^export $ENV_VAR=" "$CONFIG_FILE"; then
        # 更新现有变量
        sed -i.tmp "s/^export $ENV_VAR=.*/export $ENV_VAR=$api_key/" "$CONFIG_FILE"
        rm -f "$CONFIG_FILE.tmp"
        echo "✅ 已更新配置文件中的 $ENV_VAR"
    else
        # 添加新变量
        echo "" >> "$CONFIG_FILE"
        echo "# AICLI $PROVIDER 配置" >> "$CONFIG_FILE"
        echo "export $ENV_VAR=$api_key" >> "$CONFIG_FILE"
        echo "✅ 已添加 $ENV_VAR 到配置文件"
    fi

    echo ""
    echo "🔄 请重新加载配置文件或重启终端："
    echo "   source $CONFIG_FILE"
    echo ""
fi

# 测试配置
echo "🧪 测试配置..."
cd "$(dirname "$0")"

# 测试切换到对应的提供商
if node dist/index-enhanced.js provider --set "$(echo "$PROVIDER" | tr '[:upper:]' '[:lower:]')" 2>/dev/null; then
    echo "✅ 提供商配置成功"

    # 测试状态
    if node dist/index-enhanced.js status 2>/dev/null | grep -q "API Key: ✅ 已配置"; then
        echo "✅ API Key 配置成功"
        echo ""
        echo "🎉 配置完成！现在可以使用以下命令启动 AICLI："
        echo "   npm start"
        echo ""
        echo "💡 提示："
        echo "   • 使用 /help 查看所有命令"
        echo "   • 使用 /provider 切换模型提供商"
        echo "   • 使用 /model 切换模型"
    else
        echo "❌ API Key 配置可能有问题，请检查"
    fi
else
    echo "❌ 配置测试失败"
fi