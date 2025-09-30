import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { FileOperation } from '../types';

export class FileOperations {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);

      // Security check - ensure file is within project root
      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeFile(filePath: string, content: string, createBackup: boolean = true): Promise<void> {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);

      // Security check
      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: file outside project root');
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create backup if file exists and backup is enabled
      if (createBackup && fs.existsSync(fullPath)) {
        const backupPath = fullPath + '.backup';
        fs.copyFileSync(fullPath, backupPath);
      }

      fs.writeFileSync(fullPath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);

      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      fs.unlinkSync(fullPath);
    } catch (error) {
      throw new Error(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      const fullOldPath = path.resolve(this.projectRoot, oldPath);
      const fullNewPath = path.resolve(this.projectRoot, newPath);

      if (!fullOldPath.startsWith(this.projectRoot) || !fullNewPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullOldPath)) {
        throw new Error(`File not found: ${oldPath}`);
      }

      const newDir = path.dirname(fullNewPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      fs.renameSync(fullOldPath, fullNewPath);
    } catch (error) {
      throw new Error(`Failed to rename file ${oldPath} to ${newPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createFile(filePath: string, content: string = ''): Promise<void> {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);

      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: file outside project root');
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(fullPath)) {
        throw new Error(`File already exists: ${filePath}`);
      }

      fs.writeFileSync(fullPath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to create file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listFiles(dirPath: string = '.', recursive: boolean = false): Promise<string[]> {
    try {
      const fullPath = path.resolve(this.projectRoot, dirPath);

      if (!fullPath.startsWith(this.projectRoot)) {
        throw new Error('Access denied: directory outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const files: string[] = [];

      const scan = (dir: string, baseDir: string = dirPath) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(baseDir, entry.name);

          if (entry.isDirectory()) {
            if (recursive && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
              scan(fullPath, relativePath);
            }
            files.push(relativePath + '/');
          } else {
            files.push(relativePath);
          }
        }
      };

      scan(fullPath);
      return files.sort();
    } catch (error) {
      throw new Error(`Failed to list files in ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchFiles(pattern: string, dirPath: string = '.'): Promise<{ file: string; matches: number }[]> {
    try {
      const files = await this.listFiles(dirPath, true);
      const results: { file: string; matches: number }[] = [];

      for (const file of files) {
        if (file.endsWith('/')) continue; // Skip directories

        try {
          const content = await this.readFile(file);
          const regex = new RegExp(pattern, 'g');
          const matches = content.match(regex);

          if (matches && matches.length > 0) {
            results.push({ file, matches: matches.length });
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }

      return results.sort((a, b) => b.matches - a.matches);
    } catch (error) {
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getFileInfo(filePath: string): { exists: boolean; size: number; modified: Date; isDirectory: boolean } {
    try {
      const fullPath = path.resolve(this.projectRoot, filePath);

      if (!fullPath.startsWith(this.projectRoot)) {
        return { exists: false, size: 0, modified: new Date(), isDirectory: false };
      }

      const stats = fs.statSync(fullPath, { throwIfNoEntry: false });

      if (!stats) {
        return { exists: false, size: 0, modified: new Date(), isDirectory: false };
      }

      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      return { exists: false, size: 0, modified: new Date(), isDirectory: false };
    }
  }

  async executeBatchOperations(operations: FileOperation[]): Promise<void> {
    const results: { operation: FileOperation; success: boolean; error?: string }[] = [];

    for (const operation of operations) {
      try {
        switch (operation.type) {
          case 'read':
            await this.readFile(operation.path);
            break;
          case 'write':
            await this.writeFile(operation.path, operation.content || '');
            break;
          case 'create':
            await this.createFile(operation.path, operation.content || '');
            break;
          case 'delete':
            await this.deleteFile(operation.path);
            break;
          case 'rename':
            await this.renameFile(operation.path, operation.oldPath || '');
            break;
        }
        results.push({ operation, success: true });
      } catch (error) {
        results.push({
          operation,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Report results
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      throw new Error(`${failed.length} operations failed: ${failed.map(f => f.error).join(', ')}`);
    }
  }

  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  displayFileTree(dirPath: string = '.', maxDepth: number = 3): void {
    try {
      const fullPath = path.resolve(this.projectRoot, dirPath);

      const displayTree = (dir: string, prefix: string = '', depth: number = 0) => {
        if (depth > maxDepth) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
        const files = entries.filter(e => e.isFile());

        // Display directories
        dirs.forEach((entry, index) => {
          const isLast = index === dirs.length - 1 && files.length === 0;
          const currentPrefix = isLast ? '└── ' : '├── ';
          const childPrefix = isLast ? '    ' : '│   ';

          console.log(chalk.cyan(prefix + currentPrefix + entry.name + '/'));

          const fullPath = path.join(dir, entry.name);
          displayTree(fullPath, prefix + childPrefix, depth + 1);
        });

        // Display files
        files.forEach((entry, index) => {
          const isLast = index === files.length - 1;
          const currentPrefix = isLast ? '└── ' : '├── ';

          const fileInfo = this.getFileInfo(path.join(dirPath, entry.name));
          const sizeStr = fileInfo.size > 0 ? ` (${this.formatFileSize(fileInfo.size)})` : '';

          console.log(chalk.white(prefix + currentPrefix + entry.name) + chalk.gray(sizeStr));
        });
      };

      console.log(chalk.cyan(`\n📁 File Tree: ${dirPath}`));
      console.log(chalk.gray('─'.repeat(50)));
      displayTree(fullPath);
      console.log('');
    } catch (error) {
      console.log(chalk.red(`Failed to display file tree: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}