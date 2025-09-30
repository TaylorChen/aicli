import { ToolRegistry } from './tool-system';
import {
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  fileMultiEditTool,
  globTool,
  grepTool
} from '../tools/file-tools';
import {
  bashTool,
  bashOutputTool,
  killShellTool
} from '../tools/bash-tools';

// 创建全局工具注册表实例
export const toolRegistry = new ToolRegistry();

// 注册所有工具
export function initializeTools(): void {
  // 文件工具
  toolRegistry.register(fileReadTool as any);
  toolRegistry.register(fileWriteTool as any);
  toolRegistry.register(fileEditTool as any);
  toolRegistry.register(fileMultiEditTool as any);
  toolRegistry.register(globTool as any);
  toolRegistry.register(grepTool as any);

  // Bash 工具
  toolRegistry.register(bashTool as any);
  toolRegistry.register(bashOutputTool as any);
  toolRegistry.register(killShellTool as any);

  console.log(`✅ 已注册 ${toolRegistry.getAll().length} 个工具`);
}

// 导出权限管理器
export { permissionManager } from './tool-system';