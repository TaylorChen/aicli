#!/usr/bin/env node

// 快速测试空输入
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 快速测试空输入处理...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let testStep = 0;

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  if (text.includes('就绪') && testStep === 0) {
    testStep = 1;
    console.log('✅ 程序启动成功');

    // 发送空输入
    setTimeout(() => {
      child.stdin.write('\n');
    }, 1000);
  }

  if (text.includes('就绪') && testStep === 1) {
    testStep = 2;
    console.log('✅ 空输入处理正常 - 无错误消息');

    // 发送有效输入
    setTimeout(() => {
      child.stdin.write('/exit\n');
    }, 1000);
  }
});

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);

  // 检查结果
  const hasError = output.includes('错误') || output.includes('处理消息时出错');
  const readyCount = (output.match(/就绪/g) || []).length;

  console.log(`📊 统计:`);
  console.log(`  • 就绪提示次数: ${readyCount}`);
  console.log(`  • 错误消息: ${hasError ? '发现' : '无'}`);

  if (code === 0 && readyCount >= 2 && !hasError) {
    console.log('🎉 空输入处理修复成功！');
    console.log('✅ 空输入不再产生错误');
    console.log('✅ 程序正常继续运行');
  } else {
    console.log('❌ 空输入处理仍有问题');
    console.log('输出片段:');
    console.log(output.substring(output.length - 1000));
  }

  process.exit(code === 0 && readyCount >= 2 && !hasError ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 10000);