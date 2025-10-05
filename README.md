# AICLI - Enhanced AI Programming Assistant

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)

A powerful, feature-rich AI programming assistant terminal tool with modern interactive experience, supporting advanced file handling, Vim mode, and intelligent AI interactions.

## ✨ Key Features

### 🎯 Advanced User Interface
- **🔄 Streaming AI Responses**: Real-time display with interrupt support
- **📊 Dynamic Status Bar**: Live model status, token usage, and response metrics
- **🏗️ Smart Context Awareness**: Automatic project type detection and context building
- **⚡ High Performance**: Anti-flicker rendering and optimized memory management
- **🎨 Modern Terminal UI**: Colorful gradients, animations, and intuitive prompts
- **⌨️ Vim Mode**: Full Vim-style text editing with multiple modes and commands

### 🚀 Core Capabilities
- **🤖 Multi-Provider Support**: DeepSeek, OpenAI, Claude, and other AI providers
- **📸 Screenshot Integration**: Direct paste and processing of screenshots
- **🎯 Drag & Drop Support**: Drag files directly into terminal for instant processing
- **📎 Advanced Attachment System**: Multi-format file management and processing
- **📝 Session Management**: Persistent conversation history with import/export
- **🛠️ Built-in File Operations**: Browse, search, and edit files without leaving the terminal
- **📋 Smart Clipboard Detection**: Automatic recognition of images, files, and text

### 🔧 Developer Tools
- **🔍 Enhanced Search**: File content search with intelligent filtering
- **📊 Usage Analytics**: Track token usage, response times, and interaction patterns
- **⚡ Quick Commands**: Slash commands for rapid workflow execution
- **🔧 Configuration Management**: Smart environment detection and setup
- **🎛️ Permission System**: Granular control over AI tool access and execution

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g aicli

# Or install locally
npm install aicli
```

### Configuration

Set up your API keys as environment variables:

```bash
# DeepSeek (Primary)
export DEEPSEEK_API_KEY=your_deepseek_api_key

# OpenAI
export OPENAI_API_KEY=your_openai_api_key

# Claude (Anthropic)
export CLAUDE_API_KEY=your_claude_api_key
```

### Basic Usage

```bash
# Start the interactive interface
aicli

# Or use npm if installed locally
npm start

# Specify provider and model
aicli --provider deepseek --model deepseek-chat

# Use in print mode for quick queries
aicli --print "Explain this React component"
```

## 📖 Detailed Usage Guide

### Interactive Interface

Once started, you'll see a modern terminal interface with:

```
🚀 AICLI - Enhanced AI Programming Assistant
🤖 deepseek-chat (deepseek)

💬 Start conversation, or type /help for commands

📝 session-id │ 🤖 model-name
❯
```

### Slash Commands

#### Essential Commands
| Command | Description |
|---------|-------------|
| `/help` or `/h` | Display comprehensive help |
| `/paste` or `/p` | Paste clipboard content (images, files, text) |
| `/attachments` or `/att` | View current attachment list |
| `/clear` or `/c` | Clear all attachments |
| `/remove <n>` or `/rm <n>` | Remove specific attachment by number |
| `/upload [path]` or `/up [path]` | Upload file or view upload status |
| `/status` or `/st` | Display current system status |
| `/vim` | Toggle Vim editing mode |
| `/quit` or `/q` | Exit the program |

#### File Operations
| Command | Description |
|---------|-------------|
| `/ls` or `/list` | List files in current directory |
| `/cat <file>` or `/read <file>` | View file contents |
| `/tree` or `/files` | Display project file tree |
| `/search <pattern>` or `/find <pattern>` | Search file contents |

#### Session Management
| Command | Description |
|---------|-------------|
| `/history` or `/hist` | View command history |
| `/clear-history` | Clear command history |
| `/multiline` or `/ml` | Toggle multiline input mode |
| `/shortcuts` or `/keys` | Show keyboard shortcuts |

### Vim Mode

AICLI includes a full-featured Vim mode for efficient text editing:

```bash
# Enter Vim mode
/vim

# Vim Mode Commands:
# Normal Mode:
h/j/k/l         - Move cursor left/down/up/right
w/b             - Move to next/previous word
i/I/a/A         - Enter insert mode (at cursor/start/after cursor/end)
x/X             - Delete character under/before cursor
dd              - Delete entire line
yy              - Copy/yank entire line
p/P             - Paste after/before cursor
Esc             - Return to normal mode
:q              - Exit Vim mode
Ctrl+C          - Force exit Vim mode
```

### File Handling

#### Screenshot & Image Support
```bash
# Take a screenshot, then:
/paste

# Or drag an image file into terminal
# The system will automatically detect and process it
```

#### File Upload
```bash
# Upload specific file
/upload /path/to/your/file.js

# Upload multiple files
/upload /path/to/directory/

# Drag and drop files into terminal window
# They'll be automatically added to attachments
```

#### Attachment Management
```bash
# View all attachments
/attachments

# Remove specific attachment
/remove 2

# Clear all attachments
/clear
```

### Advanced Features

#### Print Mode (Non-Interactive)
```bash
# Direct query
aicli --print "Explain this TypeScript code"

# JSON output
aicli --print --output-format json "Analyze this error"

# Pipeline input
cat logs.txt | aicli --print "Analyze these logs"

# Read from file
aicli --print < input.txt
```

#### Session Persistence
```bash
# Continue last conversation
aicli --continue

# Resume specific session
aicli --resume session-id

# View all sessions
aicli --sessions
```

#### Configuration Options
```bash
# Set provider and model
aicli --provider openai --model gpt-4

# Custom API key
aicli --api-key "your-api-key"

# File limits
aicli --max-files 10 --max-file-size 20

# Enable/disable streaming
aicli --streaming
aicli --no-streaming

# Verbose output
aicli --verbose
```

## 🎯 Use Cases

### Code Development
```bash
# Analyze code structure
aicli --print "Explain the architecture of this React component" < component.jsx

# Debug issues
aicli --print "Why is this TypeScript error occurring?" < error.log

# Refactor code
aicli --print "Refactor this function to be more efficient" < old-code.js
```

### Documentation
```bash
# Generate documentation
aicli --print "Generate API documentation for this code" < api.js

# Explain code
aicli --print "Explain what this algorithm does" < algorithm.py
```

### Learning
```bash
# Ask questions
aicli "What's the difference between let and const in JavaScript?"

# Get examples
aicli "Show me examples of React hooks usage"
```

## 📁 Supported File Types

### Documents
- **PDF**, **DOC**, **DOCX**, **TXT**, **MD**, **RTF**

### Images
- **PNG**, **JPG**, **JPEG**, **GIF**, **WebP**, **BMP**, **SVG**

### Code
- **JavaScript**, **TypeScript**, **Python**, **Java**, **C++**
- **Go**, **Rust**, **PHP**, **Ruby**, **Swift**, **Kotlin**
- **HTML**, **CSS**, **Vue**, **React**, **Angular**
- **JSON**, **XML**, **YAML**, **TOML**, **INI**

### All Formats
- Support for **any file type** with intelligent content detection
- Automatic text extraction and processing
- Binary file handling for appropriate formats

## ⌨️ Keyboard Shortcuts

### Global Shortcuts
- `Ctrl+C` - Interrupt AI response / Exit program
- `Ctrl+L` - Clear screen
- `Ctrl+V` - Paste clipboard content
- `↑/↓` - Navigate command history
- `Tab` - Command auto-completion

### Vim Mode Shortcuts
- `Esc` - Return to normal mode
- `:q` - Exit Vim mode
- `Ctrl+C` - Force exit Vim mode
- All standard Vim keybindings supported

## 🔧 Configuration

### Environment Variables
```bash
# AI Provider API Keys
export DEEPSEEK_API_KEY=your_deepseek_key
export OPENAI_API_KEY=your_openai_key
export CLAUDE_API_KEY=your_claude_key

# Optional Configuration
export AICLI_CONFIG_DIR=~/.config/aicli
export AICLI_LOG_LEVEL=info
export AICLI_MAX_TOKENS=4000
```

### Configuration File
Create `~/.config/aicli/config.json`:

```json
{
  "currentProvider": "deepseek",
  "currentModel": "deepseek-chat",
  "theme": "dark",
  "autoSave": true,
  "sessionHistory": 100,
  "maxFiles": 20,
  "maxFileSize": 52428800,
  "enableStreaming": true,
  "autoClearAttachments": true,
  "verbose": false
}
```

## 🛠️ Development

### Requirements
- **Node.js** >= 16.0.0
- **npm** >= 7.0.0

### Development Setup
```bash
# Clone repository
git clone https://github.com/your-repo/aicli.git
cd aicli

# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Type checking
npm run typecheck
```

### Project Structure
```
src/
├── ui/                 # User interface components
│   ├── enhanced-cli-interface.ts
│   └── modern-cli-interface.ts
├── core/               # Core functionality
│   ├── ai-service.ts
│   ├── file-processor.ts
│   ├── session-manager.ts
│   └── vim-mode.ts
├── services/           # External service integrations
├── tools/              # Built-in tools and utilities
├── config/             # Configuration management
└── types/              # TypeScript type definitions
```

## 📦 Publishing

### Build and Publish
```bash
# Build the project
npm run build

# Publish to npm
npm publish

# Create distribution package
npm pack
```

### Installation Options
```bash
# Install from npm registry
npm install -g aicli

# Install from local file
npm install -g ./aicli-2.1.0.tgz

# Install from GitHub
npm install -g github:your-repo/aicli
```

## 🤝 Contributing

We welcome contributions! Please follow our contribution guidelines:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Style
- Use **TypeScript** for new features
- Follow **ESLint** configuration
- Add **JSDoc** comments for public APIs
- Include **tests** for new functionality
- Update **documentation** as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- All open-source contributors
- Terminal UI design inspirations from various CLI tools
- AI technology providers (DeepSeek, OpenAI, Anthropic)
- The Node.js and TypeScript communities

## 📞 Support

- **GitHub Issues**: https://github.com/your-repo/aicli/issues
- **Documentation**: https://docs.aicli.dev
- **Discord Community**: [Link to Discord server]
- **Email Support**: support@aicli.dev

## 🎉 Release Notes

### v2.1.0 - Vim Mode & Performance Enhancements

#### ✨ New Features
- **⌨️ Vim Mode**: Full Vim-style text editing with normal, insert, visual, and command modes
- **🎯 Enhanced Performance**: Anti-flicker rendering and optimized memory usage
- **🔧 Improved Error Handling**: Better error messages and recovery mechanisms
- **📋 Enhanced Attachment System**: Improved file handling and drag-drop support

#### 🔧 Improvements
- **🎨 UI Polish**: Refined colors, animations, and visual feedback
- **📝 Better Documentation**: Comprehensive help system and usage guides
- **🚀 Faster Startup**: Optimized initialization and configuration loading
- **🔍 Enhanced Search**: Improved file content search with better filtering

#### 🐛 Bug Fixes
- Fixed Vim mode Enter key handling
- Resolved attachment clearing issues
- Improved streaming response stability
- Fixed drag-drop detection in certain terminals

### v2.0.0 - Modern Interface Revamp
- Complete UI redesign with modern aesthetics
- Streaming AI responses with interrupt support
- Advanced file handling and screenshot integration
- Enhanced session management and persistence
- Comprehensive slash command system

---

**🚀 Experience the future of AI-assisted programming in your terminal!**

*Built with ❤️ by the AICLI team*