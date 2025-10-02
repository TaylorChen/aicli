const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧪 AICLI 拖拽功能简单测试\n');

// 获取用户的下载目录
const downloadsDir = path.join(os.homedir(), 'Downloads');
const testFile = path.join(downloadsDir, `aicli-test-${Date.now()}.txt`);

console.log('📁 将创建测试文件到:', downloadsDir);
console.log('📄 测试文件名:', path.basename(testFile));

// 启动 AICLI
console.log('\n🚀 启动 AICLI...');
const aicli = spawn('npm', ['run', 'modern'], {
  stdio: 'inherit',
  shell: true
});

// 3秒后创建测试文件
setTimeout(() => {
  try {
    fs.writeFileSync(testFile, `AICLI 拖拽功能测试文件\n创建时间: ${new Date().toISOString()}\n\n这是一个测试文件，用于验证 AICLI 的拖拽检测功能是否正常工作。`);

    console.log(`\n✅ 测试文件已创建: ${path.basename(testFile)}`);
    console.log('💡 请观察 AICLI 窗口是否显示了拖拽检测界面');
    console.log('⏳ 5秒后自动结束测试...\n');

    // 5秒后退出
    setTimeout(() => {
      console.log('🏁 测试结束');
      console.log('💡 如果看到了拖拽检测界面，说明功能正常！');
      console.log('🗑️  清理测试文件...');

      try {
        fs.unlinkSync(testFile);
        console.log('✅ 测试文件已清理');
      } catch (error) {
        console.log('⚠️ 无法清理测试文件，请手动删除');
      }

      aicli.kill('SIGINT');
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error('❌ 创建测试文件失败:', error);
    aicli.kill('SIGINT');
    process.exit(1);
  }
}, 3000);

aicli.on('error', (error) => {
  console.error('❌ 启动 AICLI 失败:', error);
  process.exit(1);
});