#!/usr/bin/env node

// 演示改进后的编辑器功能
const { spawn } = require('child_process');
const path = require('path');

console.log('🎉 AICLI 多行编辑器功能演示\n');

const demoSteps = [
  {
    name: '启动编辑器',
    action: '"""\n',
    delay: 2000,
    waitFor: '会话:',
    description: '演示现代化编辑器界面'
  },
  {
    name: '显示帮助',
    action: '/help\n',
    delay: 2000,
    waitFor: '编辑器帮助',
    description: '演示完整的帮助系统'
  },
  {
    name: '添加代码内容',
    action: 'function hello() {\n  console.log("Hello, World!");\n}\n',
    delay: 1000,
    description: '演示代码输入和语法高亮'
  },
  {
    name: '查看统计信息',
    action: '/lines\n',
    delay: 2000,
    waitFor: '编辑统计',
    description: '演示统计功能'
  },
  {
    name: '提交内容',
    action: '"""\n',
    delay: 3000,
    waitFor: '编辑完成',
    description: '演示优雅的提交反馈'
  },
  {
    name: '退出程序',
    action: '/exit\n',
    delay: 1000,
    description: '演示正常退出'
  }
];

let currentStep = 0;

console.log('📋 演示步骤:');
demoSteps.forEach((step, index) => {
  console.log(`${index + 1}. ${step.name} - ${step.description}`);
});

console.log('\n🚀 开始演示...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  // 检查当前步骤的等待条件
  if (currentStep < demoSteps.length) {
    const step = demoSteps[currentStep];
    if (step.waitFor && text.includes(step.waitFor)) {
      console.log(`✅ ${step.name} 完成`);
      currentStep++;

      if (currentStep < demoSteps.length) {
        setTimeout(() => {
          console.log(`🔄 ${demoSteps[currentStep].name}`);
          child.stdin.write(demoSteps[currentStep].action);
        }, step.delay);
      }
    }
  }

  // 显示重要信息
  if (text.includes('就绪') && currentStep === 0) {
    setTimeout(() => {
      console.log('🔄 启动编辑器');
      child.stdin.write(demoSteps[0].action);
    }, 1500);
  }
});

child.on('close', (code) => {
  console.log(`\n🎯 演示完成，退出代码: ${code}`);

  console.log('\n🌟 编辑器新特性总结:');
  console.log('✨ 现代化界面设计');
  console.log('✨ 完整的帮助系统');
  console.log('✨ 语法高亮支持');
  console.log('✨ 实时统计信息');
  console.log('✨ 优雅的提交反馈');
  console.log('✨ 更好的文件拖拽集成');
  console.log('✨ 接近 qorder 和 claude cli 的用户体验');

  process.exit(code === 0 ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 演示超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 30000);