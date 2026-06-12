#!/usr/bin/env node
// PreToolUse hook: no green, no PR. Runs the API test suite before allowing
// `gh pr create`. Exit 2 = block with the failure output fed back to the agent.
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
  if (data.tool_name !== 'Bash') process.exit(0);
  const cmd = ((data.tool_input && data.tool_input.command) || '').toString();
  if (!/\bgh\s+pr\s+create\b/.test(cmd)) process.exit(0);

  let root = data.cwd || process.cwd();
  try {
    root = execSync('git rev-parse --show-toplevel', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {}

  try {
    execSync('npm run test:api', { cwd: root, stdio: 'pipe', timeout: 540000 });
  } catch (e) {
    const out = (
      (e.stdout ? e.stdout.toString() : '') +
      '\n' +
      (e.stderr ? e.stderr.toString() : '')
    ).slice(-3000);
    console.error('PR gate: API test suite failed — fix tests before opening a PR.\n' + out);
    process.exit(2);
  }
  process.exit(0);
});
