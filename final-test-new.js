const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎯 最终拖拽功能测试...\n');

// 启动AICLI程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

let testDirCreated = false;

// 程序启动3秒后开始创建文件
setTimeout(() => {
  console.log('\n📁 AICLI已启动，开始创建测试文件...');

  const testDir = '/tmp/aicli-drag-drop';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  testDirCreated = true;

  // 创建第一个文件
  const file1 = path.join(testDir, `final-test-1-${Date.now()}.txt`);
  fs.writeFileSync(file1, `最终测试文件1\n创建时间: ${new Date().toISOString()}`);
  console.log('✅ 创建文件1:', path.basename(file1));

  // 2秒后创建第二个文件
  setTimeout(() => {
    const file2 = path.join(testDir, `final-test-2-${Date.now()}.png`);
    fs.writeFileSync(file2, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'));
    console.log('✅ 创建文件2:', path.basename(file2));
  }, 2000);

  // 再2秒后创建第三个文件
  setTimeout(() => {
    const file3 = path.join(testDir, `final-test-3-${Date.now()}.js`);
    fs.writeFileSync(file3, `// 最终测试文件3\nconsole.log('Hello Final Test!');`);
    console.log('✅ 创建文件3:', path.basename(file3));
  }, 4000);

}, 3000);

// 12秒后结束测试
setTimeout(() => {
  console.log('\n🏁 测试结束');

  if (!testDirCreated) {
    console.log('❌ 测试目录未创建，检查程序启动');
  } else {
    console.log('💡 检查上面输出中是否有:');
    console.log('   1. 📂 检查目录 ...: 找到 X 个测试文件');
    console.log('   2. 🔍 检测到测试文件: ...');
    console.log('   3. 📋 检测到文件拖入 边框');
    console.log('   4. ✅ 成功添加 X 个文件');
  }

  aicli.kill('SIGINT');
  process.exit(0);
}, 12000);

aicli.on('error', (error) => {
  console.error(`❌ 启动失败: ${error}`);
  process.exit(1);
});