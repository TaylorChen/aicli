import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as mimeTypes from 'mime-types';
import { smartConfig } from './smart-config';

export interface ImageInfo {
  path: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  format: string;
  mimeType: string;
  aspectRatio?: number;
  colorDepth?: number;
  hasTransparency?: boolean;
  dominantColor?: string;
}

export interface ProcessedImage {
  original: ImageInfo;
  processed?: {
    path: string;
    size: number;
    width: number;
    height: number;
    format: string;
    quality: number;
  };
  thumbnails: Array<{
    path: string;
    size: number;
    width: number;
    height: number;
    format: string;
  }>;
  analysis?: {
    objects: string[];
    text?: string;
    colors: string[];
    brightness: number;
    contrast: number;
    sharpness: number;
  };
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  generateThumbnails?: boolean;
  thumbnailSizes?: Array<{ width: number; height: number }>;
  enableAnalysis?: boolean;
  compress?: boolean;
}

export interface BatchProcessOptions {
  inputDir: string;
  outputDir: string;
  processingOptions: ImageProcessingOptions;
  filePatterns?: string[];
  parallelProcessing?: boolean;
  maxConcurrency?: number;
}

export class EnhancedImageProcessor extends EventEmitter {
  private supportedFormats: string[];
  private maxFileSize: number;
  private processingCache: Map<string, ProcessedImage> = new Map();

  constructor() {
    super();
    this.supportedFormats = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
      'image/tiff',
      'image/avif'
    ];
    this.maxFileSize = smartConfig.getWithDefault('image.maxFileSize', 50 * 1024 * 1024); // 50MB
  }

  // 获取图片信息
  async getImageInfo(filePath: string): Promise<ImageInfo> {
    try {
      const fullPath = path.resolve(filePath);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`图片不存在: ${filePath}`);
      }

      const stats = fs.statSync(fullPath);

      if (stats.size > this.maxFileSize) {
        throw new Error(`图片过大 (${(stats.size / 1024 / 1024).toFixed(2)}MB)，最大支持 ${this.maxFileSize / 1024 / 1024}MB`);
      }

      const content = fs.readFileSync(fullPath);
      const filename = path.basename(fullPath);
      const mimeType = mimeTypes.lookup(filename) || 'application/octet-stream';

      if (!mimeType.startsWith('image/')) {
        throw new Error(`文件不是图片格式: ${mimeType}`);
      }

      if (!this.supportedFormats.includes(mimeType)) {
        throw new Error(`不支持的图片格式: ${mimeType}`);
      }

      const info: ImageInfo = {
        path: filePath,
        name: filename,
        size: stats.size,
        format: path.extname(filename).toLowerCase().substring(1),
        mimeType
      };

      // 尝试获取图片尺寸（基础实现）
      try {
        const dimensions = this.getImageDimensions(content, mimeType);
        info.width = dimensions.width;
        info.height = dimensions.height;
        info.aspectRatio = dimensions.width / dimensions.height;
      } catch (error) {
        // 无法获取尺寸时继续处理
      }

      this.emit('imageInfoLoaded', info);
      return info;
    } catch (error) {
      this.emit('error', { operation: 'getInfo', path: filePath, error });
      throw error;
    }
  }

  // 处理单个图片
  async processImage(filePath: string, options: ImageProcessingOptions = {}): Promise<ProcessedImage> {
    try {
      const cacheKey = `${filePath}:${JSON.stringify(options)}`;
      const cached = this.processingCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const imageInfo = await this.getImageInfo(filePath);
      const processed: ProcessedImage = {
        original: imageInfo,
        thumbnails: []
      };

      // 模拟图片处理
      if (options.generateThumbnails && options.thumbnailSizes) {
        processed.thumbnails = await this.generateThumbnails(filePath, options.thumbnailSizes);
      }

      // 模拟图片分析
      if (options.enableAnalysis) {
        processed.analysis = await this.analyzeImage(filePath);
      }

      // 缓存结果
      this.processingCache.set(cacheKey, processed);
      this.emit('imageProcessed', { path: filePath, processed });

      return processed;
    } catch (error) {
      this.emit('error', { operation: 'process', path: filePath, error });
      throw error;
    }
  }

  // 批量处理图片
  async batchProcess(options: BatchProcessOptions): Promise<{
    successful: ProcessedImage[];
    failed: Array<{ path: string; error: string }>;
    totalProcessed: number;
  }> {
    const successful: ProcessedImage[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    try {
      // 查找图片文件
      const imageFiles = await this.findImageFiles(options.inputDir, options.filePatterns);

      if (imageFiles.length === 0) {
        throw new Error(`在目录 ${options.inputDir} 中没有找到图片文件`);
      }

      this.emit('batchStarted', { totalFiles: imageFiles.length });

      if (options.parallelProcessing) {
        // 并行处理
        const concurrency = options.maxConcurrency || 3;
        const chunks = this.chunkArray(imageFiles, concurrency);

        for (const chunk of chunks) {
          const promises = chunk.map(async (file) => {
            try {
              const result = await this.processImage(file, options.processingOptions);
              successful.push(result);
            } catch (error) {
              failed.push({
                path: file,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          });

          await Promise.all(promises);
        }
      } else {
        // 串行处理
        for (const file of imageFiles) {
          try {
            const result = await this.processImage(file, options.processingOptions);
            successful.push(result);
          } catch (error) {
            failed.push({
              path: file,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      const result = {
        successful,
        failed,
        totalProcessed: imageFiles.length
      };

      this.emit('batchCompleted', result);
      return result;
    } catch (error) {
      this.emit('error', { operation: 'batchProcess', error });
      throw error;
    }
  }

  // 图片分析
  async analyzeImage(filePath: string): Promise<{
    objects: string[];
    text?: string;
    colors: string[];
    brightness: number;
    contrast: number;
    sharpness: number;
  }> {
    try {
      // 模拟图片分析 - 在实际实现中会使用AI服务
      const analysis = {
        objects: this.detectObjects(filePath),
        colors: this.extractColors(filePath),
        brightness: this.calculateBrightness(filePath),
        contrast: this.calculateContrast(filePath),
        sharpness: this.calculateSharpness(filePath)
      };

      // 尝试文字识别（模拟）
      if (this.mightContainText(filePath)) {
        (analysis as any).text = await this.extractTextFromImage(filePath);
      }

      this.emit('imageAnalyzed', { path: filePath, analysis });
      return analysis;
    } catch (error) {
      this.emit('error', { operation: 'analyze', path: filePath, error });
      throw error;
    }
  }

  // 生成缩略图
  private async generateThumbnails(filePath: string, sizes: Array<{ width: number; height: number }>): Promise<Array<{
    path: string;
    size: number;
    width: number;
    height: number;
    format: string;
  }>> {
    const thumbnails: Array<{
      path: string;
      size: number;
      width: number;
      height: number;
      format: string;
    }> = [];

    for (const size of sizes) {
      try {
        // 模拟缩略图生成
        const thumbnailPath = this.generateThumbnailPath(filePath, size);
        const thumbnailInfo = {
          path: thumbnailPath,
          size: Math.floor(Math.random() * 50000) + 10000, // 模拟文件大小
          width: size.width,
          height: size.height,
          format: 'jpeg'
        };
        thumbnails.push(thumbnailInfo);
      } catch (error) {
        this.emit('warning', { operation: 'generateThumbnail', path: filePath, size, error });
      }
    }

    return thumbnails;
  }

  // 查找图片文件
  private async findImageFiles(dirPath: string, patterns?: string[]): Promise<string[]> {
    const imageFiles: string[] = [];
    const extensions = this.supportedFormats.map(mime => {
      const ext = mimeTypes.extension(mime);
      return ext ? `.${ext}` : '';
    }).filter(Boolean);

    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // 跳过隐藏目录和常见排除目录
          if (!entry.name.startsWith('.') && !['node_modules', '.git', '.idea', '.vscode'].includes(entry.name)) {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            const relativePath = path.relative(dirPath, fullPath);
            imageFiles.push(relativePath);
          }
        }
      }
    };

    scan(dirPath);
    return imageFiles.sort();
  }

  // 辅助方法
  private getImageDimensions(content: Buffer, mimeType: string): { width: number; height: number } {
    // 简化的图片尺寸检测
    // 在实际实现中，应该使用专业的图片处理库如 sharp

    if (mimeType === 'image/jpeg') {
      // JPEG文件的开头标记
      if (content.length > 4) {
        return { width: 800, height: 600 }; // 模拟值
      }
    } else if (mimeType === 'image/png') {
      // PNG文件的开头标记
      if (content.length > 16) {
        return { width: 1024, height: 768 }; // 模拟值
      }
    }

    // 默认尺寸
    return { width: 640, height: 480 };
  }

  private detectObjects(filePath: string): string[] {
    // 模拟物体检测
    const commonObjects = ['person', 'car', 'building', 'tree', 'animal', 'food', 'text', 'logo'];
    const detected: string[] = [];

    // 随机选择一些物体作为检测结果
    for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
      const object = commonObjects[Math.floor(Math.random() * commonObjects.length)];
      if (!detected.includes(object)) {
        detected.push(object);
      }
    }

    return detected;
  }

  private extractColors(filePath: string): string[] {
    // 模拟颜色提取
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#DDA0DD', '#98D8C8'];
    const selectedColors: string[] = [];

    for (let i = 0; i < Math.min(5, colors.length); i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      if (!selectedColors.includes(color)) {
        selectedColors.push(color);
      }
    }

    return selectedColors;
  }

  private calculateBrightness(filePath: string): number {
    // 模拟亮度计算
    return Math.random() * 100;
  }

  private calculateContrast(filePath: string): number {
    // 模拟对比度计算
    return Math.random() * 100;
  }

  private calculateSharpness(filePath: string): number {
    // 模拟清晰度计算
    return Math.random() * 100;
  }

  private mightContainText(filePath: string): boolean {
    // 简单判断图片是否可能包含文字
    const name = path.basename(filePath).toLowerCase();
    return name.includes('text') || name.includes('doc') || name.includes('screenshot') || name.includes('code');
  }

  private async extractTextFromImage(filePath: string): Promise<string> {
    // 模拟OCR文字识别
    await new Promise(resolve => setTimeout(resolve, 100));

    const sampleTexts = [
      'Sample text detected in image',
      '这是一段示例文字',
      'Hello World',
      '代码示例',
      '文档内容'
    ];

    return sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
  }

  private generateThumbnailPath(originalPath: string, size: { width: number; height: number }): string {
    const dir = path.dirname(originalPath);
    const name = path.basename(originalPath, path.extname(originalPath));
    const ext = path.extname(originalPath);
    return path.join(dir, `${name}_${size.width}x${size.height}${ext}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // 图片格式转换
  async convertFormat(filePath: string, targetFormat: 'jpeg' | 'png' | 'webp', options: {
    quality?: number;
    outputPath?: string;
  } = {}): Promise<string> {
    try {
      const imageInfo = await this.getImageInfo(filePath);
      const outputPath = options.outputPath || this.generateConvertedPath(filePath, targetFormat);

      // 模拟格式转换
      this.emit('formatConverted', {
        from: imageInfo.format,
        to: targetFormat,
        originalPath: filePath,
        outputPath
      });

      return outputPath;
    } catch (error) {
      this.emit('error', { operation: 'convert', path: filePath, error });
      throw error;
    }
  }

  // 图片压缩
  async compressImage(filePath: string, options: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    outputPath?: string;
  } = {}): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    outputPath: string;
  }> {
    try {
      const imageInfo = await this.getImageInfo(filePath);
      const outputPath = options.outputPath || this.generateCompressedPath(filePath);

      // 模拟压缩
      const quality = options.quality || 80;
      const compressedSize = Math.floor(imageInfo.size * (quality / 100));
      const compressionRatio = ((imageInfo.size - compressedSize) / imageInfo.size) * 100;

      this.emit('imageCompressed', {
        originalSize: imageInfo.size,
        compressedSize,
        compressionRatio,
        outputPath
      });

      return {
        originalSize: imageInfo.size,
        compressedSize,
        compressionRatio,
        outputPath
      };
    } catch (error) {
      this.emit('error', { operation: 'compress', path: filePath, error });
      throw error;
    }
  }

  private generateConvertedPath(originalPath: string, targetFormat: string): string {
    const dir = path.dirname(originalPath);
    const name = path.basename(originalPath, path.extname(originalPath));
    return path.join(dir, `${name}.${targetFormat}`);
  }

  private generateCompressedPath(originalPath: string): string {
    const dir = path.dirname(originalPath);
    const name = path.basename(originalPath, path.extname(originalPath));
    const ext = path.extname(originalPath);
    return path.join(dir, `${name}_compressed${ext}`);
  }

  // 统计信息
  getStatistics(): {
    cacheSize: number;
    supportedFormats: string[];
    maxFileSize: number;
    totalProcessed: number;
  } {
    return {
      cacheSize: this.processingCache.size,
      supportedFormats: this.supportedFormats,
      maxFileSize: this.maxFileSize,
      totalProcessed: this.processingCache.size
    };
  }

  // 清理缓存
  clearCache(): void {
    this.processingCache.clear();
    this.emit('cacheCleared');
  }
}

// 导出单例实例
export const enhancedImageProcessor = new EnhancedImageProcessor();