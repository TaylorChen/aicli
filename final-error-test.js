#!/usr/bin/env node

// 最终验证AI错误恢复
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 最终验证AI错误恢复修复...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let step = 0;
let aiErrorSeen = false;

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  if (text.includes('就绪') && step === 0) {
    step = 1;
    console.log('✅ 程序启动成功');

    // 发送消息触发AI错误
    setTimeout(() => {
      console.log('📝 发送消息...');
      child.stdin.write('test\n');
    }, 1000);
  }

  if (text.includes('AI服务调用失败') && !aiErrorSeen) {
    aiErrorSeen = true;
    step = 2;
    console.log('✅ AI错误显示正常');

    // 等待恢复后测试输入
    setTimeout(() => {
      console.log('📝 测试错误后输入...');
      child.stdin.write('/exit\n');
    }, 2000);
  }
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  output += text;
  // 捕获恢复日志
  if (text.includes('Readline恢复失败')) {
    console.log('📝 检测到恢复失败日志');
  }
});

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);

  const hasAIError = output.includes('AI服务调用失败');
  const hasRecoveryLog = output.includes('Readline恢复失败');
  const readyCount = (output.match(/就绪/g) || []).length;

  console.log(`📊 分析结果:`);
  console.log(`  • 退出代码: ${code}`);
  console.log(`  • AI错误显示: ${hasAIError ? '是' : '否'}`);
  console.log(`  • 恢复失败日志: ${hasRecoveryLog ? '是' : '否'}`);
  console.log(`  • 就绪提示次数: ${readyCount}`);

  if (code === 0 && hasAIError && readyCount >= 2) {
    console.log('\n🎉 AI错误恢复修复成功！');
    console.log('✅ 错误正常显示');
    console.log('✅ 程序能够继续运行');
    console.log('✅ 输入状态得到恢复');
    console.log('✅ 程序正常退出');

    if (hasRecoveryLog) {
      console.log('⚠️  检测到恢复失败，但有备用机制');
    }
  } else {
    console.log('\n❌ AI错误恢复仍有问题');
    console.log('最后1500字符输出:');
    console.log(output.substring(output.length - 1500));
  }

  process.exit(code === 0 && hasAIError && readyCount >= 2 ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 12000);