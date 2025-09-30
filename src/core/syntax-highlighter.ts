import chalk from 'chalk';

export interface HighlighterConfig {
  enabled: boolean;
  theme: 'auto' | 'light' | 'dark';
  languages: string[];
  maxLineLength: number;
}

export interface SyntaxToken {
  text: string;
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'variable' | 'operator' | 'punctuation' | 'type' | 'error';
  position: { start: number; end: number };
}

export class SyntaxHighlighter {
  private config: HighlighterConfig;
  private themes: Record<string, Record<string, (text: string) => string>>;

  constructor(config?: Partial<HighlighterConfig>) {
    this.config = {
      enabled: true,
      theme: 'auto',
      languages: ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'],
      maxLineLength: 1000,
      ...config
    };

    this.themes = {
      light: {
        keyword: chalk.gray,
        string: chalk.green,
        number: chalk.magenta,
        comment: chalk.gray.dim,
        function: chalk.blue,
        variable: chalk.cyan,
        operator: chalk.red,
        punctuation: chalk.gray,
        type: chalk.yellow,
        error: chalk.red.bold
      },
      dark: {
        keyword: chalk.magenta,
        string: chalk.green,
        number: chalk.yellow,
        comment: chalk.gray.dim,
        function: chalk.blue,
        variable: chalk.cyan,
        operator: chalk.red,
        punctuation: chalk.gray,
        type: chalk.yellow,
        error: chalk.red.bold
      }
    };
  }

  highlight(code: string, language?: string): string {
    if (!this.config.enabled) {
      return code;
    }

    const detectedLanguage = language || this.detectLanguage(code);
    const tokens = this.tokenize(code, detectedLanguage);

    return this.applyFormatting(tokens);
  }

  private detectLanguage(code: string): string {
    const languagePatterns: Record<string, RegExp[]> = {
      javascript: [
        /(?:function|var|let|const|if|else|for|while|return|class|import|export|from)\b/,
        /\/\/[\s\S]*?(?:\n|$)|\/\*[\s\S]*?\*\//,
        /(?:`[^`]*`|'[^']*'|"(?:[^"\\]|\\.)*")/,
        /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/,
        /\b(?:number|string|boolean|object|array|function|undefined|null)\b/
      ],
      typescript: [
        /(?:interface|type|namespace|enum|abstract|implements|extends|readonly|private|public|protected)\b/,
        /:\s*[a-zA-Z_$][a-zA-Z0-9_$<>\[\],]*/,
        /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/,
        /\b(?:number|string|boolean|object|Array<.*>|Function|void|any|never|unknown)\b/
      ],
      python: [
        /(?:def|class|if|elif|else|for|while|import|from|as|try|except|finally|with|return|yield|lambda|and|or|not|in|is)\b/,
        /#[^\n]*/,
        /(?:\"\"\"[\s\S]*?\"\"\"|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
        /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /\b(?:int|float|str|bool|list|dict|tuple|set|None|True|False)\b/
      ],
      java: [
        /(?:public|private|protected|static|final|abstract|class|interface|extends|implements|if|else|for|while|do|switch|case|default|try|catch|finally|throw|throws|return|import|package)\b/,
        /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
        /"(?:[^"\\]|\\.)*"/,
        /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/,
        /\b(?:int|long|float|double|boolean|char|String|void|class|interface)\b/
      ],
      cpp: [
        /(?:include|ifdef|ifndef|define|undef|using|namespace|class|struct|union|enum|public|private|protected|virtual|override|friend|explicit|operator|template|typename|const|static|extern|register|volatile|mutable|inline|if|else|for|while|do|switch|case|default|try|catch|throw|return|new|delete|this|true|false|null)\b/,
        /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
        /"(?:[^"\\]|\\.)*"|'[^']*'/,
        /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /\b(?:int|long|short|float|double|char|bool|void|auto|const|static)\b/
      ],
      go: [
        /(?:package|import|func|var|const|type|struct|interface|if|else|for|range|switch|case|default|go|defer|go|chan|select|return|break|continue|fallthrough)\b/,
        /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
        /"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/,
        /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /\b(?:int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|bool|string|error|rune|byte|uintptr)\b/
      ],
      rust: [
        /(?:let|mut|const|static|fn|struct|enum|trait|impl|for|while|loop|if|else|match|use|mod|crate|super|self|Self|return|break|continue|true|false|unsafe|async|await|move|pub|priv|ref|Box|Rc|Arc)\b/,
        /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
        /"(?:[^"\\]|\\.)*"|r#*"(?:[^"\\]|\\.)*"#*|'(?:[^'\\]|\\.)*'/,
        /\b[a-zA-Z_][a-zA-Z0-9_]*\s*[!]?\(/,
        /\b(?:i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|char|str|Option|Result|Vec|String|Box|Arc|Rc)\b/
      ]
    };

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      if (this.config.languages.includes(lang)) {
        let matches = 0;
        for (const pattern of patterns) {
          if (pattern.test(code)) {
            matches++;
          }
        }
        if (matches > 0) {
          return lang;
        }
      }
    }

    return 'text';
  }

  private tokenize(code: string, language: string): SyntaxToken[] {
    const tokens: SyntaxToken[] = [];
    const patterns = this.getTokenPatterns(language);

    let remaining = code;
    let position = 0;

    while (remaining.length > 0) {
      let matched = false;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = remaining.match(pattern);
        if (match && match.index === 0) {
          const text = match[0];
          tokens.push({
            text,
            type: type as SyntaxToken['type'],
            position: { start: position, end: position + text.length }
          });

          remaining = remaining.slice(text.length);
          position += text.length;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // 没有匹配的模式，消耗一个字符
        tokens.push({
          text: remaining[0],
          type: 'variable',
          position: { start: position, end: position + 1 }
        });

        remaining = remaining.slice(1);
        position++;
      }
    }

    return tokens;
  }

  private getTokenPatterns(language: string): Record<string, RegExp> {
    const commonPatterns = {
      comment: /\/\/.*?\n|\/\*[\s\S]*?\*\/|#.*/g,
      string: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
      number: /\b\d+(\.\d+)?([eE][+-]?\d+)?(f|F|l|L|u|U)?\b/g,
      punctuation: /[{}\[\]();,.]/g,
      operator: /[+\-*/%=<>!&|^~?:]+/g
    };

    const languagePatterns: Record<string, Record<string, RegExp>> = {
      javascript: {
        ...commonPatterns,
        keyword: /\b(?:function|var|let|const|if|else|for|while|return|class|import|export|from|try|catch|finally|throw|new|this|super|extends|implements|interface|enum|type|abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield)\b/g,
        function: /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g,
        type: /\b(?:number|string|boolean|object|array|function|undefined|null|symbol|bigint)\b/g
      },
      typescript: {
        ...commonPatterns,
        keyword: /\b(?:abstract|any|as|asserts|bigint|boolean|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|module|namespace|never|new|null|number|object|package|private|protected|public|readonly|require|return|set|static|string|super|switch|this|throw|true|try|type|typeof|undefined|unknown|var|void|while|with|yield)\b/g,
        function: /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g,
        type: /\b(?:number|string|boolean|object|Array<.*>|Function|void|any|never|unknown|Record<.*>|Promise<.*>)\b/g
      },
      python: {
        ...commonPatterns,
        keyword: /\b(?:def|class|if|elif|else|for|while|import|from|as|try|except|finally|with|return|yield|lambda|and|or|not|in|is|pass|break|continue|global|nonlocal|assert|del|raise)\b/g,
        function: /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g,
        type: /\b(?:int|float|str|bool|list|dict|tuple|set|None|True|False|bytes|complex)\b/g
      },
      java: {
        ...commonPatterns,
        keyword: /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|null)\b/g,
        function: /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g,
        type: /\b(?:int|long|short|byte|float|double|boolean|char|String|void|Integer|Long|Short|Byte|Float|Double|Boolean|Character|Object)\b/g
      },
      text: {
        comment: /\/\/.*?\n|\/\*[\s\S]*?\*\/|#.*/g,
        string: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
        number: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g,
        punctuation: /[{}\[\]();,.]/g,
        operator: /[+\-*/%=<>!&|^~?:]+/g,
        variable: /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g
      }
    };

    return languagePatterns[language] || languagePatterns.text;
  }

  private applyFormatting(tokens: SyntaxToken[]): string {
    const theme = this.themes[this.config.theme] || this.themes.dark;
    let result = '';

    for (const token of tokens) {
      const formatter = theme[token.type] || chalk.white;
      result += formatter(token.text);
    }

    return result;
  }

  // 高亮文件内容
  highlightFile(content: string, filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'c': 'cpp',
      'go': 'go',
      'rs': 'rust'
    };

    const language = extension ? languageMap[extension] : this.detectLanguage(content);
    return this.highlight(content, language);
  }

  // 格式化代码块显示
  formatCodeBlock(code: string, language?: string, maxLines: number = 20): string {
    const highlighted = this.highlight(code, language);
    const lines = highlighted.split('\n');

    // 限制行数
    const displayLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      displayLines.push(chalk.gray(`... and ${lines.length - maxLines} more lines`));
    }

    return displayLines.join('\n');
  }

  // 安全高亮（防止恶意代码）
  safeHighlight(code: string, language?: string): string {
    // 限制代码长度
    const maxLength = 10000;
    const truncated = code.length > maxLength ? code.slice(0, maxLength) + '...' : code;

    // 移除潜在的恶意内容
    const sanitized = truncated
      .replace(/\x1b\[[0-9;]*m/g, '') // 移除ANSI转义序列
      .replace(/\r\n|\r|\n/g, '\n')     // 标准化换行符
      .replace(/\t/g, '  ');                // 制表符转空格

    return this.highlight(sanitized, language);
  }

  // 检查是否支持某种语言
  supportsLanguage(language: string): boolean {
    return this.config.languages.includes(language);
  }

  // 添加自定义语言支持
  addLanguage(language: string, patterns: Record<string, RegExp>): void {
    if (!this.config.languages.includes(language)) {
      this.config.languages.push(language);
    }
    // TODO: 实现自定义模式的存储
  }

  // 更新配置
  updateConfig(newConfig: Partial<HighlighterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // 获取统计信息
  getStatistics(): {
    enabled: boolean;
    theme: string;
    supportedLanguages: string[];
    cacheSize: number;
  } {
    return {
      enabled: this.config.enabled,
      theme: this.config.theme,
      supportedLanguages: [...this.config.languages],
      cacheSize: 0 // TODO: 实现缓存统计
    };
  }
}