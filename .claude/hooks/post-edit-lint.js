#!/usr/bin/env node
// PostToolUse hook: lint API files the moment they're edited. eslint --fix runs
// silently; anything it can't fix is fed back to the agent via exit 2.
const { execSync } = require('child_process');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const fp = ((data.tool_input && data.tool_input.file_path) || '').toString();
  if (!fp || !fp.endsWith('.ts')) process.exit(0);
  const norm = fp.replace(/\\/g, '/');
  const m = norm.match(/^(.*\/apps\/api)\/(src|test)\//);
  if (!m) process.exit(0);

  try {
    execSync(`npx eslint --fix "${fp}"`, { cwd: m[1], stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    const out = (
      (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    ).slice(-2000);
    console.error('eslint found problems it could not auto-fix:\n' + out);
    process.exit(2);
  }
  process.exit(0);
});
