/**
 * 增强的错误处理系统
 * 提供友好的错误信息和自动恢复机制
 */

import chalk from 'chalk';

export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  CONFIG = 'config',
  FILE = 'file',
  USER_INPUT = 'user_input',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

export interface AICliError {
  category: ErrorCategory;
  code: string;
  message: string;
  originalError?: Error;
  suggestion?: string;
  recoverable: boolean;
  retryable: boolean;
}

export class ErrorHandler {
  private static errorHistory: AICliError[] = [];
  private static maxHistorySize = 100;

  /**
   * 处理错误并返回格式化的错误对象
   */
  public static handle(error: any): AICliError {
    const cliError = this.classify(error);
    this.errorHistory.push(cliError);
    
    // 限制历史记录大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
    
    return cliError;
  }

  /**
   * 错误分类
   */
  private static classify(error: any): AICliError {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        category: ErrorCategory.NETWORK,
        code: error.code,
        message: '网络连接失败',
        originalError: error,
        suggestion: '请检查您的网络连接，或稍后再试',
        recoverable: true,
        retryable: true,
      };
    }

    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      return {
        category: ErrorCategory.FILE,
        code: error.code,
        message: '文件访问错误',
        originalError: error,
        suggestion: error.code === 'ENOENT' 
          ? '文件不存在，请检查文件路径' 
          : '没有文件访问权限，请检查文件权限',
        recoverable: true,
        retryable: false,
      };
    }

    if (error.response && error.response.status) {
      const status = error.response.status;
      
      if (status === 401) {
        return {
          category: ErrorCategory.API,
          code: 'API_AUTH_ERROR',
          message: 'API认证失败',
          originalError: error,
          suggestion: '请检查您的API密钥是否正确设置。\n  提示: export DEEPSEEK_API_KEY=your_api_key',
          recoverable: false,
          retryable: false,
        };
      }
      
      if (status === 429) {
        return {
          category: ErrorCategory.API,
          code: 'API_RATE_LIMIT',
          message: 'API请求频率超限',
          originalError: error,
          suggestion: '请稍后再试，或升级您的API计划',
          recoverable: true,
          retryable: true,
        };
      }
      
      if (status >= 500) {
        return {
          category: ErrorCategory.API,
          code: 'API_SERVER_ERROR',
          message: 'API服务器错误',
          originalError: error,
          suggestion: 'API服务器暂时不可用，请稍后再试',
          recoverable: true,
          retryable: true,
        };
      }
      
      return {
        category: ErrorCategory.API,
        code: `API_ERROR_${status}`,
        message: `API请求失败 (${status})`,
        originalError: error,
        suggestion: '请查看详细错误信息',
        recoverable: true,
        retryable: false,
      };
    }

    if (error.message && error.message.includes('Invalid API key')) {
      return {
        category: ErrorCategory.CONFIG,
        code: 'INVALID_API_KEY',
        message: 'API密钥无效',
        originalError: error,
        suggestion: '请设置正确的API密钥。\n  提示: export DEEPSEEK_API_KEY=your_api_key',
        recoverable: false,
        retryable: false,
      };
    }

    if (error.message && error.message.includes('No API key')) {
      return {
        category: ErrorCategory.CONFIG,
        code: 'MISSING_API_KEY',
        message: '未设置API密钥',
        originalError: error,
        suggestion: '请设置API密钥。\n  示例: export DEEPSEEK_API_KEY=your_api_key\n  或使用: aicli --api-key your_api_key',
        recoverable: false,
        retryable: false,
      };
    }

    // 默认未知错误
    return {
      category: ErrorCategory.UNKNOWN,
      code: 'UNKNOWN_ERROR',
      message: error.message || '未知错误',
      originalError: error,
      suggestion: '如果问题持续存在，请报告此错误',
      recoverable: false,
      retryable: false,
    };
  }

  /**
   * 显示错误信息
   */
  public static display(error: AICliError, verbose: boolean = false): void {
    console.error('');
    console.error(chalk.red('✗ Error: ') + chalk.white(error.message));
    
    if (error.suggestion) {
      console.error(chalk.yellow('\n💡 Suggestion: ') + chalk.gray(error.suggestion));
    }

    if (verbose && error.originalError) {
      console.error(chalk.gray('\nDetails:'));
      console.error(chalk.gray(error.originalError.stack || error.originalError.message));
    }

    if (error.retryable) {
      console.error(chalk.cyan('\n🔄 This error is retryable. You can try again.'));
    }

    console.error('');
  }

  /**
   * 自动重试包装器
   */
  public static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const cliError = this.handle(error);
        
        if (!cliError.retryable || attempt === maxRetries) {
          throw error;
        }
        
        console.log(chalk.yellow(`\n⚠ Attempt ${attempt} failed. Retrying in ${delayMs / 1000}s...`));
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // 指数退避
        delayMs *= 2;
      }
    }
    
    throw lastError;
  }

  /**
   * 获取错误历史
   */
  public static getHistory(): AICliError[] {
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史
   */
  public static clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * 获取错误统计
   */
  public static getStats(): Record<ErrorCategory, number> {
    const stats: Record<ErrorCategory, number> = {
      [ErrorCategory.NETWORK]: 0,
      [ErrorCategory.API]: 0,
      [ErrorCategory.CONFIG]: 0,
      [ErrorCategory.FILE]: 0,
      [ErrorCategory.USER_INPUT]: 0,
      [ErrorCategory.SYSTEM]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    };

    this.errorHistory.forEach(error => {
      stats[error.category]++;
    });

    return stats;
  }

  /**
   * 创建自定义错误
   */
  public static createError(
    category: ErrorCategory,
    code: string,
    message: string,
    suggestion?: string
  ): AICliError {
    return {
      category,
      code,
      message,
      suggestion,
      recoverable: false,
      retryable: false,
    };
  }
}

/**
 * 友好的错误消息映射
 */
export const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  ENOTFOUND: '无法连接到服务器。请检查网络连接。',
  ECONNREFUSED: '服务器拒绝连接。请稍后再试。',
  ETIMEDOUT: '连接超时。请检查网络连接或稍后再试。',
  ENOENT: '文件未找到。请检查文件路径。',
  EACCES: '没有文件访问权限。请检查文件权限。',
  API_AUTH_ERROR: 'API认证失败。请检查API密钥。',
  API_RATE_LIMIT: 'API请求频率超限。请稍后再试。',
  API_SERVER_ERROR: 'API服务器错误。请稍后再试。',
  INVALID_API_KEY: 'API密钥无效。请设置正确的API密钥。',
  MISSING_API_KEY: '未设置API密钥。请配置API密钥。',
};

/**
 * 错误建议映射
 */
export const ERROR_SUGGESTIONS: Record<string, string> = {
  ENOTFOUND: '1. 检查网络连接\n  2. 确认API服务器地址正确\n  3. 尝试使用代理',
  ECONNREFUSED: '1. 检查API服务是否运行\n  2. 确认端口号正确\n  3. 检查防火墙设置',
  ETIMEDOUT: '1. 检查网络连接\n  2. 增加超时时间\n  3. 稍后再试',
  API_AUTH_ERROR: '1. 检查API密钥是否正确\n  2. 确认API密钥未过期\n  3. 使用 aicli --api-key 指定密钥',
  API_RATE_LIMIT: '1. 等待一段时间后重试\n  2. 升级API计划\n  3. 减少请求频率',
  MISSING_API_KEY: '1. 设置环境变量: export DEEPSEEK_API_KEY=your_key\n  2. 使用命令行参数: aicli --api-key your_key\n  3. 在配置文件中设置API密钥',
};

