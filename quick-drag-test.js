const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 快速拖拽功能验证启动中...\n');

// 确保测试文件存在
const testDir = '/tmp/aicli-drag-drop';
const requiredFiles = ['test-document.txt', 'test-image.png', 'test-code.js'];

let allFilesExist = true;
for (const file of requiredFiles) {
  const filePath = path.join(testDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ 缺少测试文件: ${file}`);
    allFilesExist = false;
  } else {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  }
}

if (!allFilesExist) {
  console.log('\n请先运行: node test-drag-clean.js');
  process.exit(1);
}

console.log('\n🎯 启动AICLI程序（将自动运行10秒）...');

// 启动AICLI程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 10秒后自动退出
setTimeout(() => {
  console.log('\n\n🏁 测试时间结束');
  console.log('💡 请观察刚才的输出中是否包含:');
  console.log('   1. "✅ 终端拖拽检测已启用" 消息');
  console.log('   2. "📋 检测到文件拖入" 边框');
  console.log('   3. 正确的文件类型识别:');
  console.log('      - 📝 test-document.txt (文本)');
  console.log('      - 🖼️ test-image.png (图片)');
  console.log('      - 📝 test-code.js (文本)');
  console.log('   4. "✅ 成功添加 3 个文件" 消息');

  aicli.kill('SIGINT');
  process.exit(0);
}, 10000);

// 错误处理
aicli.on('error', (error) => {
  console.error(`❌ 启动失败: ${error}`);
  process.exit(1);
});

aicli.on('exit', (code) => {
  console.log(`\n📝 程序已退出，退出码: ${code}`);
  process.exit(code);
});