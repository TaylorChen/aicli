const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 实时拖拽功能测试启动中...\n');

// 启动AICLI程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 程序启动5秒后创建测试文件
setTimeout(() => {
  console.log('\n📁 程序已启动，现在创建测试文件...');

  const testDir = '/tmp/aicli-drag-drop';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFiles = [
    {
      name: `live-test-${Date.now()}.txt`,
      content: `实时测试文本文件\n创建时间: ${new Date().toISOString()}\nHello Drag & Drop!`
    },
    {
      name: `live-test-${Date.now()}.png`,
      content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
    },
    {
      name: `live-test-${Date.now()}.js`,
      content: `// 实时测试JavaScript文件\nconsole.log("Hello Live Drag & Drop!");\nfunction test() { return new Date(); }`
    }
  ];

  testFiles.forEach((file, index) => {
    const filePath = path.join(testDir, file.name);
    fs.writeFileSync(filePath, file.content);
    const stats = fs.statSync(filePath);
    console.log(`   ${index + 1}. ✅ ${file.name} (${stats.size} bytes)`);
  });

  console.log('\n💡 文件已创建！观察程序是否检测到拖拽...');

  // 3秒后再创建一个文件
  setTimeout(() => {
    const delayedFile = path.join(testDir, `delayed-test-${Date.now()}.md`);
    fs.writeFileSync(delayedFile, `# 延迟测试Markdown\n创建时间: ${new Date().toISOString()}\nThis is a test.`);
    console.log(`   4. ✅ 延迟文件创建: ${path.basename(delayedFile)}`);
  }, 3000);

}, 5000);

// 15秒后自动退出
setTimeout(() => {
  console.log('\n\n🏁 测试结束');
  console.log('💡 如果拖拽功能正常，你应该看到:');
  console.log('   1. "📋 检测到文件拖入" 边框');
  console.log('   2. 正确的文件类型识别 (文本/图片)');
  console.log('   3. 文件处理进度条');
  console.log('   4. "✅ 成功添加 X 个文件" 消息');

  aicli.kill('SIGINT');
  process.exit(0);
}, 15000);

aicli.on('error', (error) => {
  console.error(`❌ 启动失败: ${error}`);
  process.exit(1);
});

aicli.on('exit', (code) => {
  console.log(`\n📝 程序已退出，退出码: ${code}`);
  process.exit(code);
});