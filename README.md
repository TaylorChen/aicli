# AICLI - Enhanced AI Programming Assistant Terminal Tool

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)

An enhanced AI programming assistant terminal tool with modern interactive experience, supporting screenshot paste and drag-drop functionality.

## ✨ Features

### 🎯 Modern Interface Experience
- 🔄 **Streaming Responses**: Real-time display of AI replies with interrupt support
- 📊 **Status Bar**: Live display of model status, token usage, response time
- 🏗️ **Project Awareness**: Automatic project type and context detection
- ⚡ **High Performance**: Optimized response speed and memory management with anti-flicker rendering
- 🎨 **Modern UI**: Colorful gradients, animations, and smart prompts
- 📸 **Screenshot Paste**: Support for pasting screenshots directly into the input field
- 🎯 **File Drag & Drop**: Support for dragging files into the terminal window
- 📎 **Attachment Management**: Complete attachment management system supporting multiple file types

### 🚀 Core Features
- 🤖 **Multi-Model Support**: DeepSeek, OpenAI, and other AI providers
- ⚡ **Enhanced Slash Commands**: Rich file operations and project management commands
- 📝 **Session Management**: Persistent conversation history with import/export support
- 🛠️ **File Operations**: Built-in file browsing, searching, and editing
- 🔧 **Smart Configuration**: Automatic environment variable detection and configuration management
- 📊 **Statistics Panel**: Usage statistics and performance monitoring
- 📋 **Smart Paste**: Automatic detection of clipboard content types (images, files, text)

## 🚀 Quick Start

### Installation

```bash
npm install -g aicli
```

### Configure API Key

Set environment variables to configure your API Key:

```bash
# DeepSeek
export DEEPSEEK_API_KEY=your_api_key_here

# OpenAI
export OPENAI_API_KEY=your_api_key_here

# Add other providers as needed
```

### Getting Started

```bash
# Start the enhanced interface (recommended)
npm start

# Or use the global command
aicli
```

## 📖 Usage Guide

### Basic Usage

After starting the enhanced interface, you can:

1. **Direct Input Messages** to start AI conversations
2. **Enter Slash Commands** to perform quick operations
3. **Use Shortcuts** to control the interface
4. **Paste Screenshots** using the `/paste` command to paste screenshots or files from clipboard

#### 📸 Screenshot Paste Feature (Highlight)

This is the core innovative feature of AICLI 2.1+:

```bash
# Use the /paste command (recommended)
/paste
```

Supported content types:
- 📸 **Screenshots/Images**: PNG, JPEG, GIF, WebP, BMP formats
- 📄 **Files**: Any file type, automatically reads content
- 📝 **Text**: Direct insertion into input field
- 📎 **Multiple Files**: Simultaneously paste multiple files

**Usage Steps**:
1. Take a screenshot (Cmd+Shift+4/5 or PrtScn)
2. Type `/paste` in the AICLI interface
3. Press Enter to execute
4. System automatically processes and adds to attachment list

**File Drag & Drop**:
1. Directly drag files into the terminal window
2. System automatically recognizes and adds them to the attachment list
3. Type `/attachments` to view added attachments

### Slash Commands

#### Basic Commands
| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | `/h` | Display help information |
| `/paste` | `/p` | Paste clipboard content (supports screenshots, files, text) |
| `/attachments` | `/att` | View current attachment list |
| `/clear` | `/c` | Clear all attachments |
| `/remove` | `/rm <n>` | Remove specified attachment by number |
| `/upload` | `/up [path]` | Upload file or view status |
| `/status` | `/st` | Display current status |
| `/quit` | `/q`, `/exit` | Exit program |

#### File Operations
| Command | Aliases | Description |
|---------|---------|-------------|
| `/ls` | `/list`, `/dir` | List files |
| `/cat` | `/read`, `/view` | View file content |
| `/tree` | `/files` | Display file tree |
| `/search` | `/find`, `/grep` | Search file content |

#### Enhanced Shortcuts
- `Ctrl+C` - Exit program / Interrupt streaming response
- `Ctrl+V` - Paste clipboard content
- `↑/↓` - History navigation
- `Tab` - Command auto-completion

### Command Line Options

```bash
# Start with specific provider
npm start --provider deepseek --model deepseek-chat

# Start with custom API key
npm start --api-key "your-api-key"

# Set file limits
npm start --max-files 10 --max-file-size 20

# Enable/disable streaming
npm start --streaming
npm start --no-streaming

# Attachment management
npm start --auto-clear          # Enable auto-clear (default)
npm start --no-auto-clear       # Disable auto-clear
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Get API Key |
|----------|-------------|-------------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key | https://platform.deepseek.com |
| `OPENAI_API_KEY` | OpenAI API Key | https://platform.openai.com |

### Configuration File

Configuration file is located at `~/.config/aicli/config.json`:

```json
{
  "currentProvider": "deepseek",
  "currentModel": "deepseek-chat",
  "theme": "dark",
  "autoSave": true,
  "sessionHistory": 100
}
```

## 📁 Supported File Types

### 📄 Documents
- PDF, DOC, DOCX, TXT, MD, RTF

### 🖼️ Images
- PNG, JPG, JPEG, GIF, WebP, BMP, SVG

### 📝 Code
- JavaScript, TypeScript, Python, Java, C++, JSON, XML, YAML
- HTML, CSS, Vue, React, Go, Rust, PHP, Ruby

### 💾 Other
- All file types supported with automatic content detection

## 🛠️ Development

### Requirements

- Node.js >= 16.0.0
- npm >= 7.0.0

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
npm run typecheck
```

## 📦 Publishing

### Build and Publish

```bash
npm run build
npm publish
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- All open-source contributors
- Terminal UI design inspirations
- AI technology providers

## 📞 Contact

- GitHub Issues: https://github.com/your-username/aicli/issues
- Email: your-email@example.com

---

## 🎉 Enjoy the Enhanced AI Programming Experience! 🚀

### 🌟 Key Features

| Feature | Description |
|---------|-------------|
| **Screenshot Paste** | Direct screenshot pasting with automatic processing |
| **File Drag & Drop** | Drag files directly into terminal |
| **Streaming Responses** | Real-time AI replies with interrupt support |
| **Modern UI** | Beautiful terminal interface with status bar |
| **Project Awareness** | Automatic project context detection |
| **Multi-Model Support** | Support for multiple AI providers |
| **Smart Commands** | Rich slash commands for productivity |

### 🚀 Technical Highlights

- **TypeScript**: Fully typed for better development experience
- **Modular Architecture**: Clean separation of concerns
- **Event-Driven**: Responsive and efficient event handling
- **Cross-Platform**: Works on macOS, Linux, and Windows
- **Performance Optimized**: Anti-flicker rendering and memory management

### 💡 Pro Tips

1. **First Time Use**: Configure API key, then run `npm start`
2. **Attachment Features**: Use `/paste` for screenshots, or drag files to terminal
3. **Attachment Management**: Use `/attachments` to view, `/clear` to clear
4. **Project Context**: Start in project directory for automatic detection
5. **Streaming**: Support real-time interruption with Ctrl+C
6. **File Operations**: Use `/tree`, `/search`, `/cat` for file management
7. **Performance**: Interface uses anti-flicker rendering for smooth experience

---

**Enjoy modern AI programming assistance!** 🎯

## 📝 Changelog

### v2.1.0 - 📸 Screenshot Paste Version

#### ✨ New Features
- 🎯 **Screenshot Paste Function**: Support direct screenshot pasting into input field
- 📋 **Smart Clipboard Recognition**: Automatic detection of images, files, text content
- 🎨 **Modern UI Upgrade**: Optimized rendering performance, anti-flicker mechanism
- ⚡ **Performance Optimization**: Resolved interface frequent refresh issues
- 🛠️ **New Commands**: Added `/paste` smart paste command

#### 🔧 Technical Improvements
- Refactored type system, unified to `src/types/index.ts`
- Optimized rendering process, added anti-flicker mechanism
- Fixed stack overflow errors, simplified keyboard event handling
- Enhanced clipboard processor supporting multiple content formats
- Improved file processor supporting large file handling

#### 📚 Documentation
- Updated README with screenshot paste usage guide
- Improved project structure documentation

### v2.0.0 - 🚀 Enhanced Base Version

- Modern terminal interface design
- Streaming response support
- Status bar display
- Project awareness functionality
- Enhanced slash commands
- Session management system