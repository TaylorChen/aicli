#!/usr/bin/env node

// 全面测试各种输入场景
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 全面输入处理测试...\n');

const child = spawn('node', [path.join(__dirname, 'dist/index.js'), 'modern'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let testStep = 0;
const tests = [
  { name: '空输入', action: '\n', delay: 1000 },
  { name: '多空格输入', action: '   \n', delay: 1000 },
  { name: '制表符输入', action: '\t\n', delay: 1000 },
  { name: '启动编辑器', action: '"""\n', delay: 2000 },
  { name: '编辑器内空输入', action: '\n', delay: 1000 },
  { name: '添加代码', action: 'console.log("test");\n', delay: 1000 },
  { name: '提交编辑器', action: '"""\n', delay: 3000 },
  { name: '退出程序', action: '/exit\n', delay: 1000 }
];

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  if (text.includes('就绪') && testStep === 0) {
    console.log('✅ 程序启动成功');
    setTimeout(() => runNextTest(), 1500);
  }

  if (text.includes('会话:') && testStep === 3) {
    console.log('✅ 编辑器启动成功');
    setTimeout(() => runNextTest(), 1500);
  }

  if (text.includes('编辑完成') && testStep === 7) {
    console.log('✅ 编辑器提交成功');
    setTimeout(() => runNextTest(), 2000);
  }
});

function runNextTest() {
  if (testStep < tests.length) {
    const test = tests[testStep];
    console.log(`🔄 ${test.name}...`);
    child.stdin.write(test.action);
    testStep++;
  }
}

child.on('close', (code) => {
  console.log(`\n程序退出，代码: ${code}`);

  // 分析结果
  const hasError = output.includes('错误') || output.includes('处理消息时出错');
  const readyCount = (output.match(/就绪/g) || []).length;
  const hasEditorSuccess = output.includes('编辑完成');

  console.log(`📊 测试结果:`);
  console.log(`  • 执行测试步骤: ${testStep}/${tests.length}`);
  console.log(`  • 就绪提示次数: ${readyCount}`);
  console.log(`  • 错误消息: ${hasError ? '发现' : '无'}`);
  console.log(`  • 编辑器成功: ${hasEditorSuccess ? '是' : '否'}`);

  const success = code === 0 && !hasError && hasEditorSuccess && testStep >= tests.length - 1;

  if (success) {
    console.log('\n🎉 全面测试通过！');
    console.log('✅ 空输入处理正常');
    console.log('✅ 编辑器功能正常');
    console.log('✅ 程序流程完整');
  } else {
    console.log('\n❌ 测试存在问题');
    console.log('输出片段:');
    console.log(output.substring(output.length - 2000));
  }

  process.exit(success ? 0 : 1);
});

setTimeout(() => {
  console.log('\n⏰ 测试超时');
  child.kill('SIGKILL');
  process.exit(1);
}, 25000);