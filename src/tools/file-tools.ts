import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolContext } from '../core/tool-system';

interface FileReadInput {
  file_path: string;
  max_length?: number;
  offset?: number;
  [key: string]: unknown;
}

interface FileWriteInput {
  file_path: string;
  content: string;
  create_backup?: boolean;
  [key: string]: unknown;
}

interface FileEditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
  [key: string]: unknown;
}

interface FileMultiEditInput {
  file_path: string;
  edits: Array<{
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }>;
  [key: string]: unknown;
}

interface GlobInput {
  pattern: string;
  path?: string;
  [key: string]: unknown;
}

interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count' | 'files';
  [key: string]: unknown;
}

export const fileReadTool: ToolDefinition<FileReadInput> = {
  name: 'file_read',
  description: 'Read the contents of a file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file to read'
      },
      max_length: {
        type: 'number',
        description: 'Maximum number of characters to read'
      },
      offset: {
        type: 'number',
        description: 'Offset in characters to start reading from'
      }
    },
    required: ['file_path']
  },
  category: 'file',
  handler: async (input, context) => {
    try {
      const fullPath = path.resolve(context.projectId, input.file_path);

      // Security check
      if (!fullPath.startsWith(context.projectId)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${input.file_path}`);
      }

      let content = fs.readFileSync(fullPath, 'utf8');

      // Apply offset
      if (input.offset && input.offset > 0) {
        content = content.slice(input.offset);
      }

      // Apply max length
      if (input.max_length && content.length > input.max_length) {
        content = content.slice(0, input.max_length) + '\n...[truncated]';
      }

      return {
        content: content
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const fileWriteTool: ToolDefinition<FileWriteInput> = {
  name: 'file_write',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file to write'
      },
      content: {
        type: 'string',
        description: 'The content to write to the file'
      },
      create_backup: {
        type: 'boolean',
        description: 'Whether to create a backup before writing'
      }
    },
    required: ['file_path', 'content']
  },
  category: 'file',
  dangerous: true,
  requiresConfirmation: true,
  handler: async (input, context) => {
    try {
      const fullPath = path.resolve(context.projectId, input.file_path);

      // Security check
      if (!fullPath.startsWith(context.projectId)) {
        throw new Error('Access denied: file outside project root');
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create backup if requested and file exists
      if (input.create_backup && fs.existsSync(fullPath)) {
        const backupPath = fullPath + '.backup';
        fs.copyFileSync(fullPath, backupPath);
      }

      fs.writeFileSync(fullPath, input.content, 'utf8');

      return {
        content: `File written successfully: ${input.file_path}`
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const fileEditTool: ToolDefinition<FileEditInput> = {
  name: 'file_edit',
  description: 'Edit a file by replacing specific text',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file to edit'
      },
      old_string: {
        type: 'string',
        description: 'The text to replace'
      },
      new_string: {
        type: 'string',
        description: 'The text to replace with'
      },
      replace_all: {
        type: 'boolean',
        description: 'Whether to replace all occurrences'
      }
    },
    required: ['file_path', 'old_string', 'new_string']
  },
  category: 'file',
  dangerous: true,
  requiresConfirmation: true,
  handler: async (input, context) => {
    try {
      const fullPath = path.resolve(context.projectId, input.file_path);

      // Security check
      if (!fullPath.startsWith(context.projectId)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${input.file_path}`);
      }

      let content = fs.readFileSync(fullPath, 'utf8');

      if (input.replace_all) {
        const regex = new RegExp(input.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(regex, input.new_string);
      } else {
        const index = content.indexOf(input.old_string);
        if (index === -1) {
          throw new Error('Text to replace not found');
        }
        content = content.slice(0, index) + input.new_string + content.slice(index + input.old_string.length);
      }

      fs.writeFileSync(fullPath, content, 'utf8');

      return {
        content: `File edited successfully: ${input.file_path}`
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const fileMultiEditTool: ToolDefinition<FileMultiEditInput> = {
  name: 'file_multi_edit',
  description: 'Perform multiple edits to a single file',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file to edit'
      },
      edits: {
        type: 'array',
        description: 'Array of edits to perform',
        items: {
          type: 'object',
          properties: {
            old_string: {
              type: 'string',
              description: 'The text to replace'
            },
            new_string: {
              type: 'string',
              description: 'The text to replace with'
            },
            replace_all: {
              type: 'boolean',
              description: 'Whether to replace all occurrences'
            }
          },
          required: ['old_string', 'new_string']
        }
      }
    },
    required: ['file_path', 'edits']
  },
  category: 'file',
  dangerous: true,
  requiresConfirmation: true,
  handler: async (input, context) => {
    try {
      const fullPath = path.resolve(context.projectId, input.file_path);

      // Security check
      if (!fullPath.startsWith(context.projectId)) {
        throw new Error('Access denied: file outside project root');
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${input.file_path}`);
      }

      let content = fs.readFileSync(fullPath, 'utf8');

      // Apply all edits in order
      for (const edit of input.edits) {
        if (edit.replace_all) {
          const regex = new RegExp(edit.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          content = content.replace(regex, edit.new_string);
        } else {
          const index = content.indexOf(edit.old_string);
          if (index === -1) {
            throw new Error(`Text to replace not found: ${edit.old_string}`);
          }
          content = content.slice(0, index) + edit.new_string + content.slice(index + edit.old_string.length);
        }
      }

      fs.writeFileSync(fullPath, content, 'utf8');

      return {
        content: `File edited successfully with ${input.edits.length} edits: ${input.file_path}`
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const globTool: ToolDefinition<GlobInput> = {
  name: 'glob',
  description: 'Find files matching a pattern',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match'
      },
      path: {
        type: 'string',
        description: 'The directory to search in (default: current directory)'
      }
    },
    required: ['pattern']
  },
  category: 'search',
  handler: async (input, context) => {
    try {
      const searchPath = input.path ? path.resolve(context.projectId, input.path) : context.projectId;

      // Security check
      if (!searchPath.startsWith(context.projectId)) {
        throw new Error('Access denied: search path outside project root');
      }

      const { glob } = await import('glob');
      const options = {
        cwd: searchPath,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
      };

      const files = await glob(input.pattern, options);
      return {
        content: files
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const grepTool: ToolDefinition<GrepInput> = {
  name: 'grep',
  description: 'Search for text patterns in files',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern to search for'
      },
      path: {
        type: 'string',
        description: 'The directory to search in (default: current directory)'
      },
      include: {
        type: 'string',
        description: 'File patterns to include'
      },
      exclude: {
        type: 'string',
        description: 'File patterns to exclude'
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count', 'files'],
        description: 'Output mode'
      }
    },
    required: ['pattern']
  },
  category: 'search',
  handler: async (input, context) => {
    try {
      const searchPath = input.path ? path.resolve(context.projectId, input.path) : context.projectId;

      // Security check
      if (!searchPath.startsWith(context.projectId)) {
        throw new Error('Access denied: search path outside project root');
      }

      const { execSync } = require('child_process');
      let command = `rg "${input.pattern}" "${searchPath}"`;

      if (input.include) {
        command += ` -g "${input.include}"`;
      }
      if (input.exclude) {
        command += ` -g "!${input.exclude}"`;
      }

      switch (input.output_mode) {
        case 'files_with_matches':
          command += ' --files-with-matches';
          break;
        case 'count':
          command += ' --count';
          break;
        case 'files':
          command += ' --files';
          break;
      }

      const result = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      return {
        content: result.trim()
      };
    } catch (error) {
      return {
        content: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};