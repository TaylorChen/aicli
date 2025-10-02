const os = require('os');
const path = require('path');
const fs = require('fs');

console.log('🔍 AICLI 拖拽功能操作指南\n');

// 获取所有监视目录
const watchDirectories = [
  os.tmpdir(),
  path.join(os.tmpdir(), 'aicli-drag-drop'),
  path.join(process.cwd(), 'temp'),
  path.join(process.cwd(), 'dropped-files'),
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Desktop')
];

console.log('📂 AICLI 监视的目录列表:');
watchDirectories.forEach((dir, index) => {
  const exists = fs.existsSync(dir);
  console.log(`   ${index + 1}. ${dir} ${exists ? '✅' : '❌'}`);

  if (exists) {
    try {
      const files = fs.readdirSync(dir);
      const fileCount = files.length;
      console.log(`      📁 包含 ${fileCount} 个文件`);
      if (fileCount > 0 && fileCount <= 5) {
        files.slice(0, 3).forEach(file => {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            console.log(`         - ${file} (${stats.size} bytes)`);
          }
        });
        if (fileCount > 3) {
          console.log(`         ... 还有 ${fileCount - 3} 个文件`);
        }
      }
    } catch (error) {
      console.log(`      ❌ 无法读取目录内容`);
    }
  }
});

console.log('\n🎯 推荐的测试方法:');
console.log('1. 运行命令: npm run modern');
console.log('2. 等待看到 "✅ 终端拖拽检测已启用" 消息');
console.log('3. 打开一个新的终端窗口');
console.log('4. 运行以下命令创建测试文件:');

const testDir = path.join(os.tmpdir(), 'aicli-drag-drop');
console.log(`   mkdir -p "${testDir}"`);
console.log(`   echo "测试文件内容" > "${testDir}/my-test-$(date +%s).txt"`);
console.log(`   echo "console.log('Hello');" > "${testDir}/my-test-$(date +%s).js"`);

console.log('\n💡 或者直接拖拽文件到以下目录:');
console.log(`   📁 ${testDir}`);
console.log(`   📁 ${path.join(os.homedir(), 'Downloads')}`);
console.log(`   📁 ${path.join(os.homedir(), 'Desktop')}`);

console.log('\n⚠️ 重要提示:');
console.log('- 不要直接拖拽文件到终端窗口');
console.log('- 而是将文件拖拽到上述监视目录中');
console.log('- 程序会自动检测到新文件并显示拖拽界面');

console.log('\n🚀 现在可以启动程序测试了!');