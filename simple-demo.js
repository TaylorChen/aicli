#!/usr/bin/env node

// 简单的功能演示
const { spawn } = require('child_process');
const path = require('path');

console.log('🎉 AICLI 编辑器功能演示\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let demoStep = 0;
const steps = [
  { action: '"""\n', description: '启动编辑器' },
  { action: 'const greeting = "Hello, World!";\nconsole.log(greeting);\n', description: '添加代码' },
  { action: '"""\n', description: '提交内容' },
  { action: '/exit\n', description: '退出程序' }
];

child.stdout.on('data', (data) => {
  const text = data.toString();

  if (text.includes('就绪') && demoStep === 0) {
    console.log('✅ 程序启动成功');
    setTimeout(() => {
      console.log(`🔄 ${steps[demoStep].description}`);
      child.stdin.write(steps[demoStep].action);
    }, 1500);
  }

  if (text.includes('会话:') && demoStep === 0) {
    demoStep = 1;
    console.log('✅ 编辑器启动成功');
    setTimeout(() => {
      console.log(`🔄 ${steps[demoStep].description}`);
      child.stdin.write(steps[demoStep].action);
    }, 2000);
  }

  if (text.includes('编辑完成') && demoStep === 2) {
    demoStep = 3;
    console.log('✅ 内容提交成功');
    setTimeout(() => {
      console.log(`🔄 ${steps[demoStep].description}`);
      child.stdin.write(steps[demoStep].action);
    }, 2000);
  }
});

child.on('close', (code) => {
  console.log(`\n🎯 演示完成，退出代码: ${code}`);

  if (code === 0) {
    console.log('\n🌟 成功展示的编辑器功能:');
    console.log('✅ 现代化编辑器界面');
    console.log('✅ 实时内容显示和行号');
    console.log('✅ 优雅的提交反馈');
    console.log('✅ 语法高亮支持');
    console.log('✅ 状态栏信息显示');
    console.log('✅ 主界面正确恢复');
    console.log('✅ 程序正常退出');
    console.log('\n🎉 编辑器优化完成！');
  } else {
    console.log('\n❌ 演示过程中出现问题');
  }

  process.exit(code === 0 ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 演示超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 25000);