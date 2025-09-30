import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { smartConfig } from './smart-config';
import { SyntaxHighlighter } from './syntax-highlighter';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  created: Date;
  modified: Date;
  isDirectory: boolean;
  isFile: boolean;
  language?: string;
  lineCount?: number;
}

export interface FileOperation {
  type: 'read' | 'write' | 'create' | 'delete' | 'rename' | 'copy' | 'move';
  path: string;
  content?: string;
  newPath?: string;
  oldPath?: string;
  backup?: boolean;
}

export interface FileAnalysis {
  path: string;
  language: string;
  lineCount: number;
  characterCount: number;
  functionCount: number;
  complexity: 'low' | 'medium' | 'high';
  dependencies: string[];
  exports: string[];
  imports: string[];
  suggestions: string[];
}

export interface SearchOptions {
  pattern: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  fileType?: string[];
  exclude?: string[];
  maxResults?: number;
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  context: {
    before: string;
    after: string;
  };
}

export class EnhancedFileOperations extends EventEmitter {
  private projectRoot: string;
  private highlighter: SyntaxHighlighter;
  private fileCache: Map<string, FileInfo> = new Map();
  private analysisCache: Map<string, FileAnalysis> = new Map();

  constructor(projectRoot: string = process.cwd()) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.highlighter = new SyntaxHighlighter();
  }

  // 基础文件操作
  async readFile(filePath: string, encoding: string = 'utf8'): Promise<string> {
    try {
      const fullPath = this.resolvePath(filePath);
      await this.validateFileAccess(fullPath, 'read');

      if (!fs.existsSync(fullPath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const content = fs.readFileSync(fullPath, encoding as BufferEncoding);

      // 更新缓存
      this.updateFileCache(fullPath);

      this.emit('fileRead', { path: filePath, size: content.length });
      return content;
    } catch (error) {
      this.emit('error', { operation: 'read', path: filePath, error });
      throw error;
    }
  }

  async writeFile(filePath: string, content: string, options: {
    createBackup?: boolean;
    createDirectories?: boolean;
    encoding?: string;
  } = {}): Promise<void> {
    try {
      const fullPath = this.resolvePath(filePath);
      await this.validateFileAccess(fullPath, 'write');

      const {
        createBackup = true,
        createDirectories = true,
        encoding = 'utf8'
      } = options;

      // 创建目录
      if (createDirectories) {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // 创建备份
      if (createBackup && fs.existsSync(fullPath)) {
        await this.createBackup(fullPath);
      }

      fs.writeFileSync(fullPath, content, encoding as BufferEncoding);

      // 更新缓存
      this.updateFileCache(fullPath);
      this.clearAnalysisCache(fullPath);

      this.emit('fileWritten', { path: filePath, size: content.length });
    } catch (error) {
      this.emit('error', { operation: 'write', path: filePath, error });
      throw error;
    }
  }

  async deleteFile(filePath: string, createBackup: boolean = true): Promise<void> {
    try {
      const fullPath = this.resolvePath(filePath);
      await this.validateFileAccess(fullPath, 'delete');

      if (!fs.existsSync(fullPath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      // 创建备份
      if (createBackup) {
        await this.createBackup(fullPath);
      }

      fs.unlinkSync(fullPath);

      // 清除缓存
      this.fileCache.delete(fullPath);
      this.clearAnalysisCache(fullPath);

      this.emit('fileDeleted', { path: filePath });
    } catch (error) {
      this.emit('error', { operation: 'delete', path: filePath, error });
      throw error;
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      const fullOldPath = this.resolvePath(oldPath);
      const fullNewPath = this.resolvePath(newPath);

      await this.validateFileAccess(fullOldPath, 'read');
      await this.validateFileAccess(fullNewPath, 'write');

      if (!fs.existsSync(fullOldPath)) {
        throw new Error(`源文件不存在: ${oldPath}`);
      }

      // 创建目标目录
      const newDir = path.dirname(fullNewPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      // 检查目标是否已存在
      if (fs.existsSync(fullNewPath)) {
        throw new Error(`目标文件已存在: ${newPath}`);
      }

      fs.renameSync(fullOldPath, fullNewPath);

      // 更新缓存
      const fileInfo = this.fileCache.get(fullOldPath);
      if (fileInfo) {
        this.fileCache.delete(fullOldPath);
        this.fileCache.set(fullNewPath, { ...fileInfo, path: newPath });
      }

      this.clearAnalysisCache(fullOldPath);

      this.emit('fileRenamed', { oldPath, newPath });
    } catch (error) {
      this.emit('error', { operation: 'rename', path: oldPath, error });
      throw error;
    }
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const fullSourcePath = this.resolvePath(sourcePath);
      const fullDestPath = this.resolvePath(destPath);

      await this.validateFileAccess(fullSourcePath, 'read');
      await this.validateFileAccess(fullDestPath, 'write');

      if (!fs.existsSync(fullSourcePath)) {
        throw new Error(`源文件不存在: ${sourcePath}`);
      }

      // 创建目标目录
      const destDir = path.dirname(fullDestPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(fullSourcePath, fullDestPath);

      // 更新缓存
      this.updateFileCache(fullDestPath);

      this.emit('fileCopied', { sourcePath, destPath });
    } catch (error) {
      this.emit('error', { operation: 'copy', path: sourcePath, error });
      throw error;
    }
  }

  // 文件信息获取
  getFileInfo(filePath: string): FileInfo {
    try {
      const fullPath = this.resolvePath(filePath);
      const stats = fs.statSync(fullPath, { throwIfNoEntry: false });

      if (!stats) {
        return {
          path: filePath,
          name: path.basename(filePath),
          extension: path.extname(filePath),
          size: 0,
          created: new Date(),
          modified: new Date(),
          isDirectory: false,
          isFile: false
        };
      }

      const info: FileInfo = {
        path: filePath,
        name: path.basename(filePath),
        extension: path.extname(filePath),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      };

      // 检测语言
      if (info.isFile) {
        info.language = this.detectLanguage(filePath);
      }

      // 获取行数
      if (info.isFile && this.isTextFile(filePath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          info.lineCount = content.split('\n').length;
        } catch {
          info.lineCount = 0;
        }
      }

      return info;
    } catch (error) {
      this.emit('error', { operation: 'getInfo', path: filePath, error });
      throw error;
    }
  }

  // 文件列表
  async listFiles(dirPath: string = '.', options: {
    recursive?: boolean;
    includeHidden?: boolean;
    exclude?: string[];
    includeDirectories?: boolean;
    sortBy?: 'name' | 'size' | 'modified' | 'type';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<FileInfo[]> {
    try {
      const fullPath = this.resolvePath(dirPath);
      await this.validateFileAccess(fullPath, 'read');

      if (!fs.existsSync(fullPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const {
        recursive = false,
        includeHidden = false,
        exclude = ['node_modules', '.git', '.idea', '.vscode'],
        includeDirectories = true,
        sortBy = 'name',
        sortOrder = 'asc'
      } = options;

      const files: FileInfo[] = [];

      const scan = async (dir: string, relativePath: string = dirPath) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          // 跳过隐藏文件和排除目录
          if (!includeHidden && entry.name.startsWith('.')) continue;
          if (exclude.includes(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);
          const relativeFilePath = path.join(relativePath, entry.name);

          const info = this.getFileInfo(relativeFilePath);

          if (entry.isDirectory()) {
            if (includeDirectories) {
              files.push(info);
            }
            if (recursive) {
              await scan(fullPath, relativeFilePath);
            }
          } else {
            files.push(info);
          }
        }
      };

      await scan(fullPath);

      // 排序
      files.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'size':
            comparison = a.size - b.size;
            break;
          case 'modified':
            comparison = a.modified.getTime() - b.modified.getTime();
            break;
          case 'type':
            comparison = a.extension.localeCompare(b.extension);
            break;
          default:
            comparison = a.name.localeCompare(b.name);
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      return files;
    } catch (error) {
      this.emit('error', { operation: 'list', path: dirPath, error });
      throw error;
    }
  }

  // 文件搜索
  async searchFiles(pattern: string, options: SearchOptions = { pattern: '' }): Promise<SearchResult[]> {
    try {
      const {
        caseSensitive = false,
        wholeWord = false,
        regex = false,
        fileType,
        exclude = ['node_modules', '.git', '.idea', '.vscode'],
        maxResults = 100
      } = options;

      // 构建搜索正则表达式
      let searchRegex: RegExp;
      if (regex) {
        searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      } else {
        let escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) {
          escapedPattern = `\\b${escapedPattern}\\b`;
        }
        searchRegex = new RegExp(escapedPattern, caseSensitive ? 'g' : 'gi');
      }

      const results: SearchResult[] = [];
      const files = await this.listFiles('.', { recursive: true, exclude });

      for (const file of files) {
        if (file.isDirectory) continue;

        // 文件类型过滤
        if (fileType && !fileType.includes(file.extension)) continue;

        try {
          const content = await this.readFile(file.path);
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match;

            while ((match = searchRegex.exec(line)) !== null) {
              results.push({
                file: file.path,
                line: i + 1,
                content: line,
                context: {
                  before: lines[Math.max(0, i - 1)] || '',
                  after: lines[Math.min(lines.length - 1, i + 1)] || ''
                }
              });

              if (results.length >= maxResults) {
                return results.slice(0, maxResults);
              }
            }
          }
        } catch (error) {
          // 跳过无法读取的文件
          continue;
        }
      }

      return results;
    } catch (error) {
      this.emit('error', { operation: 'search', pattern, error });
      throw error;
    }
  }

  // 代码分析
  async analyzeCode(filePath: string): Promise<FileAnalysis> {
    try {
      const fullPath = this.resolvePath(filePath);
      await this.validateFileAccess(fullPath, 'read');

      // 检查缓存
      const cacheKey = `${fullPath}:${fs.statSync(fullPath).mtime.getTime()}`;
      const cached = this.analysisCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const content = await this.readFile(filePath);
      const fileInfo = this.getFileInfo(filePath);
      const language = fileInfo.language || 'text';

      const analysis: FileAnalysis = {
        path: filePath,
        language,
        lineCount: content.split('\n').length,
        characterCount: content.length,
        functionCount: 0,
        complexity: 'low',
        dependencies: [],
        exports: [],
        imports: [],
        suggestions: []
      };

      // 根据语言进行分析
      switch (language) {
        case 'javascript':
        case 'typescript':
          this.analyzeJavaScript(content, analysis);
          break;
        case 'python':
          this.analyzePython(content, analysis);
          break;
        case 'java':
          this.analyzeJava(content, analysis);
          break;
        default:
          this.analyzeGeneric(content, analysis);
      }

      // 缓存结果
      this.analysisCache.set(cacheKey, analysis);
      this.emit('codeAnalyzed', { path: filePath, analysis });

      return analysis;
    } catch (error) {
      this.emit('error', { operation: 'analyze', path: filePath, error });
      throw error;
    }
  }

  // 批量操作
  async executeBatch(operations: FileOperation[]): Promise<{
    successful: FileOperation[];
    failed: Array<{ operation: FileOperation; error: string }>;
  }> {
    const successful: FileOperation[] = [];
    const failed: Array<{ operation: FileOperation; error: string }> = [];

    for (const operation of operations) {
      try {
        switch (operation.type) {
          case 'read':
            await this.readFile(operation.path);
            break;
          case 'write':
            await this.writeFile(operation.path, operation.content || '', {
              createBackup: operation.backup
            });
            break;
          case 'create':
            await this.writeFile(operation.path, operation.content || '', {
              createBackup: false,
              createDirectories: true
            });
            break;
          case 'delete':
            await this.deleteFile(operation.path, operation.backup);
            break;
          case 'rename':
            if (!operation.newPath) {
              throw new Error('Rename operation requires newPath');
            }
            await this.renameFile(operation.path, operation.newPath);
            break;
          case 'copy':
            if (!operation.newPath) {
              throw new Error('Copy operation requires newPath');
            }
            await this.copyFile(operation.path, operation.newPath);
            break;
          case 'move':
            if (!operation.newPath) {
              throw new Error('Move operation requires newPath');
            }
            await this.renameFile(operation.path, operation.newPath);
            break;
        }
        successful.push(operation);
      } catch (error) {
        failed.push({
          operation,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.emit('batchCompleted', { successful, failed });
    return { successful, failed };
  }

  // 辅助方法
  private resolvePath(filePath: string): string {
    return path.resolve(this.projectRoot, filePath);
  }

  private async validateFileAccess(fullPath: string, operation: 'read' | 'write' | 'delete'): Promise<void> {
    // 安全检查：确保文件在项目根目录内
    if (!fullPath.startsWith(this.projectRoot)) {
      throw new Error('访问被拒绝：文件在项目根目录外');
    }

    // 检查文件是否存在（对于读取和删除操作）
    if (operation !== 'write' && !fs.existsSync(fullPath)) {
      throw new Error(`文件不存在：${fullPath}`);
    }
  }

  private updateFileCache(fullPath: string): void {
    try {
      const relativePath = path.relative(this.projectRoot, fullPath);
      const info = this.getFileInfo(relativePath);
      this.fileCache.set(fullPath, info);
    } catch {
      this.fileCache.delete(fullPath);
    }
  }

  private clearAnalysisCache(fullPath: string): void {
    for (const [key] of this.analysisCache) {
      if (key.startsWith(fullPath)) {
        this.analysisCache.delete(key);
      }
    }
  }

  private async createBackup(fullPath: string): Promise<void> {
    const backupPath = fullPath + `.backup.${Date.now()}`;
    fs.copyFileSync(fullPath, backupPath);
    this.emit('backupCreated', { original: fullPath, backup: backupPath });
  }

  private detectLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'shell',
      '.bash': 'shell',
      '.zsh': 'shell',
      '.fish': 'shell',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.md': 'markdown',
      '.txt': 'text',
      '.sql': 'sql',
      '.dockerfile': 'docker',
      '.gitignore': 'gitignore',
      '.env': 'env'
    };

    return languageMap[extension] || 'text';
  }

  private isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
      '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.sh', '.bash',
      '.zsh', '.fish', '.html', '.css', '.scss', '.sass', '.less', '.json', '.xml',
      '.yaml', '.yml', '.toml', '.ini', '.md', '.txt', '.sql', '.dockerfile',
      '.gitignore', '.env'
    ];

    const extension = path.extname(filePath).toLowerCase();
    return textExtensions.includes(extension);
  }

  private analyzeJavaScript(content: string, analysis: FileAnalysis): void {
    // 简单的JavaScript分析
    const functionMatches = content.match(/function\s+\w+\s*\(|const\s+\w+\s*=\s*\(|=>/g) || [];
    analysis.functionCount = functionMatches.length;

    const importMatches = content.match(/import\s+.*?\s+from\s+['"].*?['"]/g) || [];
    analysis.imports = importMatches.map(match => {
      const result = match.match(/from\s+['"](.*)['"]/);
      return result ? result[1] : '';
    }).filter(Boolean);

    const exportMatches = content.match(/export\s+(default\s+)?(function|class|const|let|var|async\s+function)/g) || [];
    analysis.exports = exportMatches;

    // 复杂度评估
    const complexityIndicators = content.match(/if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(/g) || [];
    if (complexityIndicators.length > 20) {
      analysis.complexity = 'high';
    } else if (complexityIndicators.length > 10) {
      analysis.complexity = 'medium';
    } else {
      analysis.complexity = 'low';
    }

    analysis.suggestions = this.generateSuggestions(analysis);
  }

  private analyzePython(content: string, analysis: FileAnalysis): void {
    const functionMatches = content.match(/def\s+\w+\s*\(/g) || [];
    const classMatches = content.match(/class\s+\w+\s*:/g) || [];
    analysis.functionCount = functionMatches.length + classMatches.length;

    const importMatches = content.match(/^(?:from\s+\w+\s+)?import\s+.+$/gm) || [];
    analysis.imports = importMatches;

    analysis.suggestions = this.generateSuggestions(analysis);
  }

  private analyzeJava(content: string, analysis: FileAnalysis): void {
    const methodMatches = content.match(/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+)\s+\w+\s*\([^)]*\)\s*(?:throws\s+\w+)?\s*\{/g) || [];
    analysis.functionCount = methodMatches.length;

    const importMatches = content.match(/^import\s+.+;/gm) || [];
    analysis.imports = importMatches;

    analysis.suggestions = this.generateSuggestions(analysis);
  }

  private analyzeGeneric(content: string, analysis: FileAnalysis): void {
    analysis.suggestions = [
      '考虑为文件添加适当的语言检测以获得更准确的分析'
    ];
  }

  private generateSuggestions(analysis: FileAnalysis): string[] {
    const suggestions: string[] = [];

    if (analysis.lineCount > 500) {
      suggestions.push('文件较大，考虑拆分成多个小文件');
    }

    if (analysis.functionCount > 20) {
      suggestions.push('函数数量较多，考虑模块化重构');
    }

    if (analysis.complexity === 'high') {
      suggestions.push('代码复杂度较高，建议简化逻辑');
    }

    if (analysis.imports.length > 20) {
      suggestions.push('依赖较多，检查是否有未使用的导入');
    }

    return suggestions;
  }

  // 统计信息
  getStatistics(): {
    totalFiles: number;
    totalSize: number;
    languages: Record<string, number>;
    cacheSize: number;
  } {
    const languages: Record<string, number> = {};
    let totalSize = 0;

    for (const info of this.fileCache.values()) {
      if (info.isFile) {
        totalSize += info.size;
        if (info.language) {
          languages[info.language] = (languages[info.language] || 0) + 1;
        }
      }
    }

    return {
      totalFiles: this.fileCache.size,
      totalSize,
      languages,
      cacheSize: this.analysisCache.size
    };
  }

  // 清理缓存
  clearCache(): void {
    this.fileCache.clear();
    this.analysisCache.clear();
    this.emit('cacheCleared');
  }
}

// 导出单例实例
export const enhancedFileOperations = new EnhancedFileOperations();