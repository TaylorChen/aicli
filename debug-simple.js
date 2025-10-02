const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 调试拖拽检测功能...\n');

// 先创建测试文件
const testDir = '/tmp/aicli-drag-drop';
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testFile = path.join(testDir, `debug-test-${Date.now()}.txt`);
fs.writeFileSync(testFile, '调试测试文件内容');
console.log('✅ 创建测试文件:', path.basename(testFile));

// 启动程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 8秒后退出
setTimeout(() => {
  aicli.kill('SIGINT');
  process.exit(0);
}, 8000);