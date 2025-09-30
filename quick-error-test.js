#!/usr/bin/env node

// 快速测试AI错误恢复
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 快速测试AI错误恢复...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let step = 0;

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  if (text.includes('就绪') && step === 0) {
    step = 1;
    console.log('✅ 程序启动');

    setTimeout(() => {
      child.stdin.write('test message\n');
    }, 1000);
  }

  if (text.includes('AI服务调用失败') && step === 1) {
    step = 2;
    console.log('✅ AI错误显示');

    setTimeout(() => {
      child.stdin.write('/exit\n');
    }, 1000);
  }
});

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);

  const hasAIError = output.includes('AI服务调用失败');
  const hasReady = output.includes('就绪');
  const errorCount = (output.match(/AI服务调用失败/g) || []).length;

  console.log(`📊 结果:`);
  console.log(`  • 退出代码: ${code}`);
  console.log(`  • AI错误显示: ${hasAIError ? '是' : '否'}`);
  console.log(`  • 错误次数: ${errorCount}`);
  console.log(`  • 界面恢复: ${hasReady ? '是' : '否'}`);

  if (code === 0 && hasAIError && hasReady) {
    console.log('\n🎉 AI错误恢复修复成功！');
  } else {
    console.log('\n❌ 仍有问题');
    console.log('最后1000字符输出:');
    console.log(output.substring(output.length - 1000));
  }

  process.exit(code === 0 && hasAIError && hasReady ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 15000);