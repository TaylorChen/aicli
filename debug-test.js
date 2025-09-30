#!/usr/bin/env node

// 简单的调试测试
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 调试测试...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log('输出:', text);

  if (text.includes('就绪')) {
    setTimeout(() => {
      console.log('发送帮助命令...');
      child.stdin.write('/help\n');
    }, 1000);
  }
});

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
}, 10000);