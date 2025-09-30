import fs from 'fs';
import path from 'path';
import os from 'os';

export interface HistoryEntry {
  command: string;
  timestamp: Date;
  session: string;
  cwd: string;
}

export class CommandHistory {
  private history: HistoryEntry[] = [];
  private maxSize: number;
  private historyFile: string;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.historyFile = path.join(os.homedir(), '.aicli', 'history.json');
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const content = fs.readFileSync(this.historyFile, 'utf-8');
        const data = JSON.parse(content);

        // 迁移旧格式的数据
        if (Array.isArray(data)) {
          this.history = data.map((item, index) => ({
            command: typeof item === 'string' ? item : item.command || '',
            timestamp: new Date(typeof item === 'string' ? Date.now() : item.timestamp || Date.now()),
            session: typeof item === 'string' ? '' : item.session || '',
            cwd: typeof item === 'string' ? process.cwd() : item.cwd || process.cwd()
          }));
        } else {
          this.history = [];
        }

        // 清理无效条目
        this.history = this.history.filter(entry => entry.command && entry.command.trim());
      }
    } catch (error) {
      console.warn('Failed to load command history:', error);
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      const historyDir = path.dirname(this.historyFile);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.warn('Failed to save command history:', error);
    }
  }

  add(command: string, session: string = ''): void {
    // 不添加空命令或重复命令
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // 避免连续重复
    if (this.history.length > 0 && this.history[this.history.length - 1].command === trimmedCommand) {
      return;
    }

    // 添加新条目
    const entry: HistoryEntry = {
      command: trimmedCommand,
      timestamp: new Date(),
      session,
      cwd: process.cwd()
    };

    this.history.push(entry);

    // 限制历史大小
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }

    // 异步保存，避免阻塞
    setImmediate(() => this.saveHistory());
  }

  getHistory(): string[] {
    return this.history.map(entry => entry.command);
  }

  getDetailedHistory(): HistoryEntry[] {
    return [...this.history];
  }

  search(query: string, limit: number = 10): HistoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.history
      .filter(entry => entry.command.toLowerCase().includes(lowerQuery))
      .slice(-limit)
      .reverse();
  }

  getRecent(count: number = 10): HistoryEntry[] {
    return this.history.slice(-count);
  }

  getBySession(session: string): HistoryEntry[] {
    return this.history.filter(entry => entry.session === session);
  }

  getByDate(startDate: Date, endDate: Date): HistoryEntry[] {
    return this.history.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  }

  clear(): void {
    this.history = [];
    this.saveHistory();
  }

  clearSession(session: string): void {
    this.history = this.history.filter(entry => entry.session !== session);
    this.saveHistory();
  }

  clearBefore(date: Date): void {
    this.history = this.history.filter(entry => new Date(entry.timestamp) >= date);
    this.saveHistory();
  }

  export(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.history, null, 2);
    } else if (format === 'csv') {
      const headers = ['Command', 'Timestamp', 'Session', 'CWD'];
      const rows = this.history.map(entry => [
        `"${entry.command.replace(/"/g, '""')}"`,
        entry.timestamp.toISOString(),
        entry.session,
        `"${entry.cwd.replace(/"/g, '""')}"`
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\\n');
    }

    return '';
  }

  import(data: string, format: 'json' | 'csv' = 'json'): void {
    try {
      if (format === 'json') {
        const imported = JSON.parse(data);
        if (Array.isArray(imported)) {
          this.history = [...this.history, ...imported];
        }
      } else if (format === 'csv') {
        const lines = data.split('\\n');
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length >= 4) {
            const entry: HistoryEntry = {
              command: values[0].replace(/"/g, ''),
              timestamp: new Date(values[1]),
              session: values[2].replace(/"/g, ''),
              cwd: values[3].replace(/"/g, '')
            };
            this.history.push(entry);
          }
        }
      }

      // 去重并限制大小
      this.deduplicate();
      if (this.history.length > this.maxSize) {
        this.history = this.history.slice(-this.maxSize);
      }

      this.saveHistory();
    } catch (error) {
      throw new Error(`Failed to import history: ${error}`);
    }
  }

  private deduplicate(): void {
    const seen = new Set();
    this.history = this.history.filter(entry => {
      const key = `${entry.command}|${entry.timestamp.getTime()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  getStatistics(): {
    total: number;
    unique: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    topCommands: Array<{ command: string; count: number }>;
  } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const commandCounts = new Map<string, number>();
    this.history.forEach(entry => {
      commandCounts.set(entry.command, (commandCounts.get(entry.command) || 0) + 1);
    });

    const topCommands = Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: this.history.length,
      unique: commandCounts.size,
      today: this.history.filter(entry => new Date(entry.timestamp) >= today).length,
      thisWeek: this.history.filter(entry => new Date(entry.timestamp) >= weekAgo).length,
      thisMonth: this.history.filter(entry => new Date(entry.timestamp) >= monthAgo).length,
      topCommands
    };
  }

  getSize(): number {
    return this.history.length;
  }

  setMaxSize(newSize: number): void {
    this.maxSize = newSize;
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
      this.saveHistory();
    }
  }
}