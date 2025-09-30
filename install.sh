#!/bin/bash

# aicli 安装脚本
# 支持 npm 全局安装和本地开发安装

set -e

echo "🚀 正在安装 aicli..."

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 请先安装 Node.js (>=16.0.0)"
    echo "   访问 https://nodejs.org/ 下载并安装 Node.js"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ 错误: Node.js 版本太低，需要 >=16.0.0，当前版本: $(node --version)"
    exit 1
fi

echo "✅ Node.js 版本检查通过: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: npm 未找到"
    exit 1
fi

echo "✅ npm 版本: $(npm --version)"

# 选择安装方式
echo ""
echo "请选择安装方式:"
echo "1) 全局安装 (推荐，可在任何目录使用 aicli 命令)"
echo "2) 本地开发安装 (用于开发调试)"
read -p "请输入选项 (1/2): " choice

case $choice in
    1)
        echo ""
        echo "📦 正在全局安装 aicli..."
        npm install -g .

        echo ""
        echo "✅ aicli 安装成功！"
        echo ""
        echo "🎯 使用方法:"
        echo "   aicli                    # 启动交互模式"
        echo "   aicli \"你的问题\"         # 直接提问"
        echo "   aicli --help             # 查看帮助"
        echo ""
        echo "⚙️  配置指南:"
        echo "   首次运行时，aicli 会引导你配置 AI API Key"
        echo "   支持的提供商: Claude, DeepSeek, Kimi, OpenAI, Gemini, Grok"
        echo ""
        echo "📚 更多信息:"
        echo "   访问项目主页: https://github.com/your-username/aicli"
        ;;
    2)
        echo ""
        echo "📦 正在本地安装 aicli..."
        npm install

        echo ""
        echo "✅ 本地安装完成！"
        echo ""
        echo "🎯 开发命令:"
        echo "   npm run dev             # 开发模式运行"
        echo "   npm start               # 生产模式运行"
        echo "   npm run build           # 构建项目"
        echo "   npm test                # 运行测试"
        echo ""
        echo "🔧 构建命令:"
        echo "   npm run build           # 构建到 dist/ 目录"
        echo "   node dist/index-claude-simple.js  # 运行构建后的文件"
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "🎉 安装完成！开始使用 aicli 吧！"