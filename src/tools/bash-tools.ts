import { spawn, ChildProcess } from 'child_process';
import { ToolDefinition, ToolContext } from '../core/tool-system';

interface BashInput {
  command: string;
  working_directory?: string;
  env?: Record<string, string>;
  timeout?: number;
  run_in_background?: boolean;
  [key: string]: unknown;
}

interface BashOutputInput {
  shell_id: string;
  timeout?: number;
  [key: string]: unknown;
}

interface KillShellInput {
  shell_id: string;
  [key: string]: unknown;
}

// 存储后台进程
const backgroundProcesses = new Map<string, ChildProcess>();

export const bashTool: ToolDefinition<BashInput> = {
  name: 'bash',
  description: 'Execute a bash command',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute'
      },
      working_directory: {
        type: 'string',
        description: 'Working directory for the command'
      },
      env: {
        type: 'object',
        description: 'Environment variables for the command'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds'
      },
      run_in_background: {
        type: 'boolean',
        description: 'Whether to run the command in the background'
      }
    },
    required: ['command']
  },
  category: 'bash',
  dangerous: true,
  requiresConfirmation: true,
  handler: async (input, context) => {
    return new Promise((resolve) => {
      const shellId = `shell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const workingDir = input.working_directory || context.projectId;

      // Security check for working directory
      if (!workingDir.startsWith(context.projectId)) {
        resolve({
          content: null,
          error: 'Access denied: working directory outside project root'
        });
        return;
      }

      const env = { ...process.env, ...input.env };
      const timeout = input.timeout || 30000; // 30 seconds default

      if (input.run_in_background) {
        // 后台运行
        const child = spawn(input.command, [], {
          shell: true,
          cwd: workingDir,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        backgroundProcesses.set(shellId, child);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('exit', (code, signal) => {
          backgroundProcesses.delete(shellId);
          resolve({
            content: {
              shell_id: shellId,
              exit_code: code,
              signal,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              background: true,
              completed: true
            }
          });
        });

        child.on('error', (error) => {
          backgroundProcesses.delete(shellId);
          resolve({
            content: null,
            error: error.message
          });
        });

        // 立即返回后台进程信息
        resolve({
          content: {
            shell_id: shellId,
            command: input.command,
            working_directory: workingDir,
            background: true,
            completed: false,
            pid: child.pid
          }
        });
      } else {
        // 前台运行
        const child = spawn(input.command, [], {
          shell: true,
          cwd: workingDir,
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('exit', (code, signal) => {
          clearTimeout(timeoutTimer);
          resolve({
            content: {
              exit_code: code,
              signal,
              stdout: stdout.trim(),
              stderr: stderr.trim()
            }
          });
        });

        child.on('error', (error) => {
          clearTimeout(timeoutTimer);
          resolve({
            content: null,
            error: error.message
          });
        });

        // 设置超时
        const timeoutTimer = setTimeout(() => {
          child.kill();
          resolve({
            content: null,
            error: `Command timed out after ${timeout}ms`
          });
        }, timeout);
      }
    });
  }
};

export const bashOutputTool: ToolDefinition<BashOutputInput> = {
  name: 'bash_output',
  description: 'Get output from a background bash process',
  inputSchema: {
    type: 'object',
    properties: {
      shell_id: {
        type: 'string',
        description: 'The shell ID to get output from'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds'
      }
    },
    required: ['shell_id']
  },
  category: 'bash',
  handler: async (input, context) => {
    const process = backgroundProcesses.get(input.shell_id);
    if (!process) {
      return {
        content: null,
        error: 'Shell process not found'
      };
    }

    const timeout = input.timeout || 5000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let completed = false;

      const collectOutput = () => {
        if (process.stdout) {
          process.stdout.on('data', (data) => {
            stdout += data.toString();
          });
        }

        if (process.stderr) {
          process.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        process.on('exit', (code, signal) => {
          completed = true;
          backgroundProcesses.delete(input.shell_id);
          resolve({
            content: {
              shell_id: input.shell_id,
              exit_code: code,
              signal,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              completed: true
            }
          });
        });

        process.on('error', (error) => {
          completed = true;
          backgroundProcesses.delete(input.shell_id);
          resolve({
            content: null,
            error: error.message
          });
        });
      };

      collectOutput();

      // 设置超时
      setTimeout(() => {
        if (!completed) {
          resolve({
            content: {
              shell_id: input.shell_id,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              completed: false,
              still_running: true
            }
          });
        }
      }, timeout);
    });
  }
};

export const killShellTool: ToolDefinition<KillShellInput> = {
  name: 'kill_shell',
  description: 'Kill a background shell process',
  inputSchema: {
    type: 'object',
    properties: {
      shell_id: {
        type: 'string',
        description: 'The shell ID to kill'
      }
    },
    required: ['shell_id']
  },
  category: 'bash',
  handler: async (input, context) => {
    const process = backgroundProcesses.get(input.shell_id);
    if (!process) {
      return {
        content: null,
        error: 'Shell process not found'
      };
    }

    try {
      process.kill();
      backgroundProcesses.delete(input.shell_id);

      return {
        content: {
          shell_id: input.shell_id,
          killed: true
        }
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

// 辅助函数：列出所有后台进程
export function listBackgroundProcesses(): Array<{
  shell_id: string;
  pid: number;
  command: string;
  startTime: Date;
}> {
  const processes: Array<{
    shell_id: string;
    pid: number;
    command: string;
    startTime: Date;
  }> = [];

  for (const [shellId, childProcess] of backgroundProcesses.entries()) {
    if (childProcess.pid) {
      processes.push({
        shell_id: shellId,
        pid: childProcess.pid,
        command: childProcess.spawnfile || 'unknown',
        startTime: new Date()
      });
    }
  }

  return processes.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

// 辅助函数：清理所有后台进程
export function cleanupBackgroundProcesses(): void {
  for (const [shellId, childProcess] of backgroundProcesses.entries()) {
    try {
      childProcess.kill('SIGTERM');
    } catch (error) {
      // 忽略清理错误
    }
  }
  backgroundProcesses.clear();
}