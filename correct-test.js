const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🎯 使用正确临时目录的拖拽测试...\n');

// 使用正确的临时目录
const tempDir = path.join(os.tmpdir(), 'aicli-drag-drop');
console.log('📁 正确的测试目录:', tempDir);

// 启动AICLI程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 程序启动3秒后创建文件
setTimeout(() => {
  console.log('\n📁 创建测试文件到正确目录...');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 创建测试文件
  const files = [
    {
      name: `correct-test-${Date.now()}.txt`,
      content: `正确目录测试文件\n创建时间: ${new Date().toISOString()}`
    },
    {
      name: `correct-test-${Date.now()}.png`,
      content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
    },
    {
      name: `correct-test-${Date.now()}.js`,
      content: `// 正确目录测试JS文件\nconsole.log("Hello Correct Directory!");`
    }
  ];

  files.forEach((file, index) => {
    const filePath = path.join(tempDir, file.name);
    fs.writeFileSync(filePath, file.content);
    console.log(`   ${index + 1}. ✅ ${file.name}`);
  });

  console.log('\n💡 观察程序输出中的拖拽检测信息...');

}, 3000);

// 10秒后退出
setTimeout(() => {
  console.log('\n🏁 测试结束');
  console.log('💡 现在应该能看到正确的拖拽检测了！');

  aicli.kill('SIGINT');
  process.exit(0);
}, 10000);

aicli.on('error', (error) => {
  console.error(`❌ 启动失败: ${error}`);
  process.exit(1);
});