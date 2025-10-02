const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🧪 自动拖拽功能测试启动中...\n');

// 确保测试目录存在
const testDir = '/tmp/aicli-drag-drop';
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// 启动AICLI程序
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 等待程序启动并完全初始化
setTimeout(() => {
  console.log('\n🎯 开始自动测试拖拽功能...\n');

  // 创建第一个测试文件（应该被检测到）
  const testFile1 = path.join(testDir, `auto-test-1-${Date.now()}.txt`);
  fs.writeFileSync(testFile1, `这是自动测试文件 1\n创建时间: ${new Date().toISOString()}\n内容: Hello Drag & Drop!`);
  console.log(`✅ 创建测试文件1: ${path.basename(testFile1)}`);

  // 2秒后创建第二个文件
  setTimeout(() => {
    const testFile2 = path.join(testDir, `auto-test-2-${Date.now()}.js`);
    fs.writeFileSync(testFile2, `// 自动测试文件 2\nconsole.log('Hello from auto-test!');\nconst test = 'drag drop';`);
    console.log(`✅ 创建测试文件2: ${path.basename(testFile2)}`);

    // 再3秒后创建第三个文件（图片）
    setTimeout(() => {
      const testFile3 = path.join(testDir, `auto-test-3-${Date.now()}.png`);
      const imageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testFile3, imageData);
      console.log(`✅ 创建测试文件3: ${path.basename(testFile3)}`);

      console.log('\n📊 测试文件创建完成！');
      console.log('🔍 请观察AICLI程序窗口是否显示了拖拽检测信息');
      console.log('⏹️  测试将在10秒后自动结束');

      // 10秒后结束测试
      setTimeout(() => {
        console.log('\n🏁 自动测试结束');
        console.log('💡 如果没有看到拖拽检测信息，请检查:');
        console.log('   1. 程序是否显示了"✅ 终端拖拽检测已启用"');
        console.log('   2. 程序是否正常响应（不会hang住）');
        console.log('   3. 可以手动创建文件测试: touch /tmp/aicli-drag-drop/test.txt');

        aicli.kill('SIGINT');
        process.exit(0);
      }, 10000);
    }, 3000);
  }, 2000);
}, 5000); // 5秒后开始测试，确保程序完全启动

// 处理程序退出
aicli.on('exit', (code) => {
  console.log(`\n📝 AICLI程序已退出，退出码: ${code}`);
  process.exit(code);
});

aicli.on('error', (error) => {
  console.error(`❌ 启动AICLI失败: ${error}`);
  process.exit(1);
});