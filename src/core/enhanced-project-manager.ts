import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { smartConfig } from './smart-config';
import { enhancedFileOperations } from './enhanced-file-operations';

export interface ProjectTemplate {
  name: string;
  description: string;
  type: 'node' | 'python' | 'web' | 'rust' | 'go' | 'java' | 'generic';
  files: Array<{
    path: string;
    content: string;
    template?: string;
  }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  commands: string[];
}

export interface ProjectConfig {
  name: string;
  version: string;
  description: string;
  type: string;
  author?: string;
  license?: string;
  repository?: string;
  keywords?: string[];
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  build?: {
    command: string;
    output: string;
  };
  test?: {
    command: string;
    coverage?: boolean;
  };
  deploy?: {
    command: string;
    target: string;
  };
}

export interface ProjectAnalysis {
  path: string;
  type: string;
  structure: {
    directories: string[];
    files: string[];
    totalFiles: number;
    totalSize: number;
  };
  dependencies: {
    total: number;
    outdated: string[];
    security: string[];
    unused?: string[];
  };
  code: {
    totalLines: number;
    languages: Record<string, { files: number; lines: number }>;
    complexity: 'low' | 'medium' | 'high';
    maintainability: 'excellent' | 'good' | 'fair' | 'poor';
  };
  quality: {
    testCoverage?: number;
    documentation: 'none' | 'minimal' | 'good' | 'excellent';
    linting: boolean;
    formatting: boolean;
  };
  recommendations: string[];
}

export interface BuildOptions {
  clean?: boolean;
  watch?: boolean;
  production?: boolean;
  sourcemaps?: boolean;
  minify?: boolean;
  analyze?: boolean;
}

export class EnhancedProjectManager extends EventEmitter {
  private currentProject: ProjectConfig | null = null;
  private projectRoot: string = process.cwd();
  private analysisCache: Map<string, ProjectAnalysis> = new Map();
  private templates: Map<string, ProjectTemplate> = new Map();

  constructor() {
    super();
    this.initializeTemplates();
  }

  // 初始化项目模板
  private initializeTemplates(): void {
    const templates: ProjectTemplate[] = [
      {
        name: 'node-typescript',
        description: 'Node.js TypeScript项目',
        type: 'node',
        files: [
          {
            path: 'package.json',
            content: JSON.stringify({
              name: '{{name}}',
              version: '1.0.0',
              description: '{{description}}',
              main: 'dist/index.js',
              scripts: {
                'build': 'tsc',
                'dev': 'ts-node src/index.ts',
                'test': 'jest',
                'lint': 'eslint src --ext .ts',
                'start': 'node dist/index.js'
              },
              dependencies: {},
              devDependencies: {
                'typescript': '^5.0.0',
                'ts-node': '^10.9.0',
                '@types/node': '^20.0.0',
                'jest': '^29.0.0',
                '@types/jest': '^29.0.0',
                'eslint': '^8.0.0',
                '@typescript-eslint/eslint-plugin': '^6.0.0',
                '@typescript-eslint/parser': '^6.0.0'
              }
            }, null, 2)
          },
          {
            path: 'tsconfig.json',
            content: JSON.stringify({
              compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                lib: ['ES2020'],
                outDir: './dist',
                rootDir: './src',
                strict: true,
               esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true
              },
              include: ['src/**/*'],
              exclude: ['node_modules', 'dist', '**/*.test.ts']
            }, null, 2)
          },
          {
            path: 'src/index.ts',
            content: `/**
 * {{name}} - {{description}}
 * @version 1.0.0
 */

console.log('Hello from {{name}}!');

export function main(): void {
  // Your main logic here
}

if (require.main === module) {
  main();
}`
          },
          {
            path: '.gitignore',
            content: `node_modules/
dist/
*.log
.env
.DS_Store
coverage/
.nyc_output/`
          },
          {
            path: 'README.md',
            content: `# {{name}}

{{description}}

## 安装

\`\`\`bash
npm install
\`\`\`

## 开发

\`\`\`bash
npm run dev
\`\`\`

## 构建

\`\`\`bash
npm run build
\`\`\`

## 测试

\`\`\`bash
npm test
\`\`\``
          }
        ],
        dependencies: {},
        devDependencies: {
          'typescript': '^5.0.0',
          'ts-node': '^10.9.0'
        },
        scripts: {
          'build': 'tsc',
          'dev': 'ts-node src/index.ts',
          'test': 'jest'
        },
        commands: [
          'npm install',
          'npm run dev',
          'npm run build',
          'npm test'
        ]
      },
      {
        name: 'python-web',
        description: 'Python Web项目',
        type: 'python',
        files: [
          {
            path: 'requirements.txt',
            content: `fastapi>=0.104.0
uvicorn>=0.24.0
pydantic>=2.4.0
python-multipart>=0.0.6
jinja2>=3.1.0`
          },
          {
            path: 'main.py',
            content: `"""
{{name}} - {{description}}
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="{{name}}", version="1.0.0")

@app.get("/")
async def root():
    return {"message": "Welcome to {{name}}!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)`
          },
          {
            path: '.gitignore',
            content: `__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
.env
.venv
env/
venv/
ENV/`
          },
          {
            path: 'README.md',
            content: `# {{name}}

{{description}}

## 安装

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## 运行

\`\`\`bash
python main.py
\`\`\`

## API文档

启动服务后访问 http://localhost:8000/docs 查看API文档`
          }
        ],
        dependencies: {
          'fastapi': '>=0.104.0',
          'uvicorn': '>=0.24.0'
        },
        commands: [
          'pip install -r requirements.txt',
          'python main.py'
        ]
      },
      {
        name: 'web-frontend',
        description: 'Web前端项目',
        type: 'web',
        files: [
          {
            path: 'package.json',
            content: JSON.stringify({
              name: '{{name}}',
              version: '1.0.0',
              description: '{{description}}',
              scripts: {
                'dev': 'vite',
                'build': 'vite build',
                'preview': 'vite preview',
                'lint': 'eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --fix --ignore-path .gitignore'
              },
              dependencies: {
                'vue': '^3.3.0'
              },
              devDependencies: {
                '@vitejs/plugin-vue': '^4.3.0',
                'vite': '^4.4.0',
                'eslint': '^8.45.0',
                '@vue/eslint-config-typescript': '^11.0.0'
              }
            }, null, 2)
          },
          {
            path: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`
          },
          {
            path: 'src/main.js',
            content: `import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')`
          },
          {
            path: 'src/App.vue',
            content: `<template>
  <div id="app">
    <h1>{{ name }}</h1>
    <p>{{ description }}</p>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      projectName: 'Project Name',
      projectDescription: 'Project Description'
    }
  }
}
</script>

<style scoped>
#app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}
</style>`
          },
          {
            path: 'vite.config.js',
            content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000
  }
})`
          }
        ],
        dependencies: {
          'vue': '^3.3.0'
        },
        devDependencies: {
          '@vitejs/plugin-vue': '^4.3.0',
          'vite': '^4.4.0'
        },
        scripts: {
          'dev': 'vite',
          'build': 'vite build'
        },
        commands: [
          'npm install',
          'npm run dev'
        ]
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.name, template);
    });
  }

  // 创建新项目
  async createProject(options: {
    name: string;
    template: string;
    path?: string;
    description?: string;
    author?: string;
    replace?: Record<string, string>;
  }): Promise<ProjectConfig> {
    try {
      const template = this.templates.get(options.template);
      if (!template) {
        throw new Error(`未找到模板: ${options.template}`);
      }

      const projectPath = options.path || path.join(process.cwd(), options.name);
      const projectConfig: ProjectConfig = {
        name: options.name,
        version: '1.0.0',
        description: options.description || template.description,
        type: template.type,
        author: options.author,
        dependencies: template.dependencies,
        devDependencies: template.devDependencies,
        scripts: template.scripts
      };

      // 创建项目目录
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // 生成项目文件
      for (const file of template.files) {
        const filePath = path.join(projectPath, file.path);
        const dir = path.dirname(filePath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        let content = file.content;

        // 模板变量替换
        content = content.replace(/\{\{name\}\}/g, options.name);
        content = content.replace(/\{\{description\}\}/g, options.description || template.description);

        // 自定义替换
        if (options.replace) {
          for (const [key, value] of Object.entries(options.replace)) {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          }
        }

        fs.writeFileSync(filePath, content);
      }

      this.currentProject = projectConfig;
      this.projectRoot = projectPath;

      this.emit('projectCreated', { path: projectPath, config: projectConfig, template: options.template });
      return projectConfig;
    } catch (error) {
      this.emit('error', { operation: 'createProject', error });
      throw error;
    }
  }

  // 分析项目
  async analyzeProject(projectPath?: string): Promise<ProjectAnalysis> {
    try {
      const rootPath = projectPath || this.projectRoot;

      // 检查缓存
      const cacheKey = `${rootPath}:${Date.now()}`;
      const cached = this.analysisCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const analysis: ProjectAnalysis = {
        path: rootPath,
        type: await this.detectProjectType(rootPath),
        structure: await this.analyzeProjectStructure(rootPath),
        dependencies: await this.analyzeDependencies(rootPath),
        code: await this.analyzeCode(rootPath),
        quality: await this.analyzeQuality(rootPath),
        recommendations: []
      };

      // 生成建议
      analysis.recommendations = this.generateRecommendations(analysis);

      // 缓存结果
      this.analysisCache.set(cacheKey, analysis);
      this.emit('projectAnalyzed', analysis);

      return analysis;
    } catch (error) {
      this.emit('error', { operation: 'analyzeProject', error });
      throw error;
    }
  }

  // 构建项目
  async buildProject(options: BuildOptions = {}): Promise<{
    success: boolean;
    output: string;
    duration: number;
    errors?: string[];
  }> {
    try {
      if (!this.currentProject) {
        throw new Error('没有加载项目');
      }

      const startTime = Date.now();
      let buildCommand = this.currentProject.build?.command || 'npm run build';

      // 清理构建目录
      if (options.clean) {
        await this.cleanBuild();
      }

      // 执行构建命令
      const result = await this.executeCommand(buildCommand, options);

      const duration = Date.now() - startTime;
      const buildResult = {
        success: result.success,
        output: result.output,
        duration,
        errors: result.errors
      };

      this.emit('projectBuilt', buildResult);
      return buildResult;
    } catch (error) {
      this.emit('error', { operation: 'buildProject', error });
      throw error;
    }
  }

  // 运行测试
  async runTests(options: {
    coverage?: boolean;
    watch?: boolean;
    specific?: string;
  } = {}): Promise<{
    success: boolean;
    output: string;
    duration: number;
    coverage?: number;
    failedTests?: string[];
  }> {
    try {
      if (!this.currentProject) {
        throw new Error('没有加载项目');
      }

      let testCommand = this.currentProject.test?.command || 'npm test';

      if (options.coverage) {
        testCommand += ' --coverage';
      }

      if (options.watch) {
        testCommand += ' --watch';
      }

      if (options.specific) {
        testCommand += ` -- ${options.specific}`;
      }

      const startTime = Date.now();
      const result = await this.executeCommand(testCommand, options);
      const duration = Date.now() - startTime;

      const testResult = {
        success: result.success,
        output: result.output,
        duration,
        coverage: options.coverage ? this.extractCoverage(result.output) : undefined,
        failedTests: result.success ? undefined : this.extractFailedTests(result.output)
      };

      this.emit('testsCompleted', testResult);
      return testResult;
    } catch (error) {
      this.emit('error', { operation: 'runTests', error });
      throw error;
    }
  }

  // 部署项目
  async deployProject(options: {
    target?: string;
    environment?: 'development' | 'staging' | 'production';
    dryRun?: boolean;
  } = {}): Promise<{
    success: boolean;
    output: string;
    duration: number;
    deployUrl?: string;
  }> {
    try {
      if (!this.currentProject) {
        throw new Error('没有加载项目');
      }

      const deployCommand = this.currentProject.deploy?.command || 'npm run deploy';
      const target = options.target || this.currentProject.deploy?.target || 'default';

      const startTime = Date.now();

      if (options.dryRun) {
        this.emit('deployDryRun', { command: deployCommand, target });
        return {
          success: true,
          output: `模拟部署到 ${target} 环境\\n命令: ${deployCommand}`,
          duration: 0,
          deployUrl: `https://${target}-example.com`
        };
      }

      const result = await this.executeCommand(deployCommand, options);
      const duration = Date.now() - startTime;

      const deployResult = {
        success: result.success,
        output: result.output,
        duration,
        deployUrl: this.generateDeployUrl(target, options.environment)
      };

      this.emit('projectDeployed', deployResult);
      return deployResult;
    } catch (error) {
      this.emit('error', { operation: 'deployProject', error });
      throw error;
    }
  }

  // 加载项目配置
  async loadProject(projectPath?: string): Promise<ProjectConfig> {
    try {
      const rootPath = projectPath || this.projectRoot;
      const config = await this.readProjectConfig(rootPath);

      this.currentProject = config;
      this.projectRoot = rootPath;

      this.emit('projectLoaded', { path: rootPath, config });
      return config;
    } catch (error) {
      this.emit('error', { operation: 'loadProject', error });
      throw error;
    }
  }

  // 获取可用模板
  getAvailableTemplates(): ProjectTemplate[] {
    return Array.from(this.templates.values());
  }

  // 获取项目统计
  async getProjectStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    languages: Record<string, number>;
    dependencies: number;
    lastModified: Date;
  }> {
    try {
      const files = await enhancedFileOperations.listFiles('.', { recursive: true });
      const stats = enhancedFileOperations.getStatistics();

      return {
        totalFiles: files.length,
        totalSize: stats.totalSize,
        languages: stats.languages,
        dependencies: Object.keys(this.currentProject?.dependencies || {}).length,
        lastModified: new Date()
      };
    } catch (error) {
      this.emit('error', { operation: 'getProjectStats', error });
      throw error;
    }
  }

  // 辅助方法
  private async detectProjectType(rootPath: string): Promise<string> {
    const files = fs.readdirSync(rootPath);

    if (files.includes('package.json')) return 'node';
    if (files.includes('pyproject.toml') || files.includes('requirements.txt')) return 'python';
    if (files.includes('Cargo.toml')) return 'rust';
    if (files.includes('go.mod')) return 'go';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'java';
    if (files.includes('index.html') || files.includes('src')) return 'web';

    return 'generic';
  }

  private async analyzeProjectStructure(rootPath: string): Promise<{
    directories: string[];
    files: string[];
    totalFiles: number;
    totalSize: number;
  }> {
    const files = await enhancedFileOperations.listFiles('.', { recursive: true, includeDirectories: false });
    const directories = await enhancedFileOperations.listFiles('.', { recursive: false, includeDirectories: true });

    const stats = enhancedFileOperations.getStatistics();

    return {
      directories: directories.filter(d => d.isDirectory).map(d => d.path),
      files: files.map(f => f.path),
      totalFiles: files.length,
      totalSize: stats.totalSize
    };
  }

  private async analyzeDependencies(rootPath: string): Promise<{
    total: number;
    outdated: string[];
    security: string[];
  }> {
    try {
      const packageJsonPath = path.join(rootPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

        return {
          total: Object.keys(dependencies).length,
          outdated: [], // 模拟过期依赖
          security: [] // 模拟安全问题
        };
      }

      return { total: 0, outdated: [], security: [] };
    } catch {
      return { total: 0, outdated: [], security: [] };
    }
  }

  private async analyzeCode(rootPath: string): Promise<{
    totalLines: number;
    languages: Record<string, { files: number; lines: number }>;
    complexity: 'low' | 'medium' | 'high';
    maintainability: 'excellent' | 'good' | 'fair' | 'poor';
  }> {
    const files = await enhancedFileOperations.listFiles('.', { recursive: true });
    const sourceFiles = files.filter(f => f.isFile && this.isSourceFile(f.path));

    let totalLines = 0;
    const languages: Record<string, { files: number; lines: number }> = {};

    for (const file of sourceFiles) {
      try {
        const content = await enhancedFileOperations.readFile(file.path);
        const lines = content.split('\\n').length;
        totalLines += lines;

        const language = file.language || 'unknown';
        if (!languages[language]) {
          languages[language] = { files: 0, lines: 0 };
        }
        languages[language].files += 1;
        languages[language].lines += lines;
      } catch {
        // 跳过无法读取的文件
      }
    }

    return {
      totalLines,
      languages,
      complexity: totalLines > 10000 ? 'high' : totalLines > 5000 ? 'medium' : 'low',
      maintainability: 'good'
    };
  }

  private async analyzeQuality(rootPath: string): Promise<{
    testCoverage?: number;
    documentation: 'none' | 'minimal' | 'good' | 'excellent';
    linting: boolean;
    formatting: boolean;
  }> {
    // 模拟质量分析
    return {
      testCoverage: Math.floor(Math.random() * 100),
      documentation: Math.random() > 0.5 ? 'good' : 'minimal',
      linting: Math.random() > 0.3,
      formatting: Math.random() > 0.4
    };
  }

  private generateRecommendations(analysis: ProjectAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.dependencies.total > 100) {
      recommendations.push('考虑减少依赖数量以提高安全性');
    }

    if (analysis.code.complexity === 'high') {
      recommendations.push('代码复杂度较高，建议重构');
    }

    if (analysis.quality.testCoverage && analysis.quality.testCoverage < 50) {
      recommendations.push('测试覆盖率较低，建议增加测试');
    }

    if (analysis.quality.documentation === 'none') {
      recommendations.push('建议添加项目文档');
    }

    return recommendations;
  }

  private async cleanBuild(): Promise<void> {
    const buildDirs = ['dist', 'build', 'out', 'target'];

    for (const dir of buildDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // 忽略删除错误
      }
    }
  }

  private async executeCommand(command: string, options: any): Promise<{
    success: boolean;
    output: string;
    errors?: string[];
  }> {
    // 模拟命令执行
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: Math.random() > 0.2,
      output: `执行命令: ${command}\\n命令完成输出...`,
      errors: Math.random() > 0.7 ? ['模拟错误信息'] : undefined
    };
  }

  private extractCoverage(output: string): number {
    // 模拟覆盖率提取
    return Math.floor(Math.random() * 100);
  }

  private extractFailedTests(output: string): string[] {
    // 模拟失败测试提取
    return Math.random() > 0.7 ? ['test1', 'test2'] : [];
  }

  private generateDeployUrl(target: string, environment?: string): string {
    return `https://${environment || 'production'}-${target}-example.com`;
  }

  private async readProjectConfig(rootPath: string): Promise<ProjectConfig> {
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '1.0.0',
        description: packageJson.description || '',
        type: 'node',
        main: packageJson.main,
        scripts: packageJson.scripts,
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies
      };
    }

    // 默认配置
    return {
      name: path.basename(rootPath),
      version: '1.0.0',
      description: '',
      type: 'generic'
    };
  }

  private isSourceFile(filePath: string): boolean {
    const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'];
    const ext = path.extname(filePath).toLowerCase();
    return sourceExtensions.includes(ext);
  }

  // 获取状态
  getStatus(): {
    currentProject: ProjectConfig | null;
    projectRoot: string;
    templatesAvailable: number;
    analysisCacheSize: number;
  } {
    return {
      currentProject: this.currentProject,
      projectRoot: this.projectRoot,
      templatesAvailable: this.templates.size,
      analysisCacheSize: this.analysisCache.size
    };
  }

  // 清理缓存
  clearCache(): void {
    this.analysisCache.clear();
    this.emit('cacheCleared');
  }
}

// 导出单例实例
export const enhancedProjectManager = new EnhancedProjectManager();