#!/usr/bin/env node

// 最终验证测试
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 最终验证测试...\n');

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
    console.log('✅ 程序启动，测试空输入...');
    setTimeout(() => {
      child.stdin.write('\n');
    }, 1000);
  }

  if (text.includes('就绪') && step === 1) {
    step = 2;
    console.log('✅ 空输入处理正常，测试退出...');
    setTimeout(() => {
      child.stdin.write('/exit\n');
    }, 1000);
  }
});

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);

  const hasError = output.includes('错误') || output.includes('处理消息时出错');
  const readyCount = (output.match(/就绪/g) || []).length;

  console.log(`📊 结果:`);
  console.log(`  • 退出代码: ${code}`);
  console.log(`  • 就绪次数: ${readyCount}`);
  console.log(`  • 错误消息: ${hasError ? '发现' : '无'}`);

  if (code === 0 && readyCount >= 2 && !hasError) {
    console.log('\n🎉 空输入问题已修复！');
    console.log('✅ 只按回车不再产生错误');
    console.log('✅ 程序正常运行');
  } else {
    console.log('\n❌ 仍有问题需要修复');
    console.log('相关输出:');
    console.log(output.substring(output.length - 1000));
  }

  process.exit(code === 0 && readyCount >= 2 && !hasError ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 8000);