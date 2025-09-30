import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext } from '../types';

export class ProjectContextManager {
  private context: ProjectContext | null = null;

  async detectProject(cwd: string = process.cwd()): Promise<ProjectContext> {
    const rootPath = await this.findProjectRoot(cwd);
    const files = await this.scanProjectFiles(rootPath);
    const dependencies = await this.extractDependencies(rootPath);
    const gitRepo = await this.checkGitRepo(rootPath);
    const type = this.detectProjectType(rootPath);

    this.context = {
      rootPath,
      name: path.basename(rootPath),
      type,
      language: this.detectLanguage(type),
      lastModified: new Date(),
      files,
      dependencies,
      gitRepo,
      workspaceFiles: await this.getWorkspaceFiles(rootPath)
    };

    return this.context;
  }

  private async findProjectRoot(startPath: string): Promise<string> {
    let currentPath = startPath;

    while (currentPath !== path.dirname(currentPath)) {
      const packageJson = path.join(currentPath, 'package.json');
      const pyProject = path.join(currentPath, 'pyproject.toml');
      const cargoToml = path.join(currentPath, 'Cargo.toml');
      const goMod = path.join(currentPath, 'go.mod');

      if (fs.existsSync(packageJson) || fs.existsSync(pyProject) ||
          fs.existsSync(cargoToml) || fs.existsSync(goMod)) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    }

    return startPath;
  }

  private async scanProjectFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'target', '__pycache__'];

    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            scan(fullPath);
          }
        } else {
          const relativePath = path.relative(rootPath, fullPath);
          const ext = path.extname(entry.name).toLowerCase();
          const sourceExts = ['.ts', '.js', '.py', '.rs', '.go', '.java', '.jsx', '.tsx'];

          if (sourceExts.includes(ext) || entry.name === 'README.md') {
            files.push(relativePath);
          }
        }
      }
    };

    scan(rootPath);
    return files;
  }

  private async extractDependencies(rootPath: string): Promise<Record<string, string>> {
    const dependencies: Record<string, string> = {};

    const packageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        dependencies.push = packageJson.dependencies || {};
        dependencies.dev = packageJson.devDependencies || {};
      } catch (error) {
        // Ignore parse errors
      }
    }

    return dependencies;
  }

  private async checkGitRepo(rootPath: string): Promise<boolean> {
    return fs.existsSync(path.join(rootPath, '.git'));
  }

  private detectProjectType(rootPath: string): 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic' {
    if (fs.existsSync(path.join(rootPath, 'package.json'))) return 'node';
    if (fs.existsSync(path.join(rootPath, 'pyproject.toml')) ||
        fs.existsSync(path.join(rootPath, 'requirements.txt'))) return 'python';
    if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) return 'rust';
    if (fs.existsSync(path.join(rootPath, 'go.mod'))) return 'go';
    if (fs.existsSync(path.join(rootPath, 'pom.xml')) ||
        fs.existsSync(path.join(rootPath, 'build.gradle'))) return 'java';

    return 'generic';
  }

  private detectLanguage(type: string): string {
    const languageMap: Record<string, string> = {
      'node': 'TypeScript/JavaScript',
      'python': 'Python',
      'rust': 'Rust',
      'go': 'Go',
      'java': 'Java',
      'generic': 'Unknown'
    };
    return languageMap[type] || 'Unknown';
  }

  private async getWorkspaceFiles(rootPath: string): Promise<string[]> {
    const workspaceFiles: string[] = [];
    const commonFiles = [
      'README.md', 'LICENSE', 'CONTRIBUTING.md', 'CHANGELOG.md',
      '.gitignore', '.eslintrc', '.prettierrc', 'tsconfig.json'
    ];

    for (const file of commonFiles) {
      if (fs.existsSync(path.join(rootPath, file))) {
        workspaceFiles.push(file);
      }
    }

    return workspaceFiles;
  }

  getContext(): ProjectContext | null {
    return this.context;
  }

  getContextSummary(): string {
    if (!this.context) return 'No project context detected';

    return `Project: ${this.context.type} at ${this.context.rootPath}\n` +
           `Files: ${this.context.files.length} source files\n` +
           `Git: ${this.context.gitRepo ? 'Yes' : 'No'}\n` +
           `Dependencies: ${Object.keys(this.context.dependencies).length} packages`;
  }
}

export const projectContext = new ProjectContextManager();