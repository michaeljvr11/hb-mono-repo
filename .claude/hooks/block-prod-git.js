#!/usr/bin/env node
// PreToolUse hook: hard fence around prod. Blocks git/gh commands that would
// push, merge, or force anything into main/master/prod. Exit 2 = block, stderr
// goes back to the agent. The fence must not rely on the model "remembering".
//
// Carve-out: the Obsidian vault (`hb-vault`) is a shared knowledge base whose
// documented workflow is to commit straight to main and push — unlike this
// project, where a human owns the merge to main. The vault repo (identified by
// its origin remote) is therefore exempt from the protected-branch *push* block;
// force-pushes and remote branch deletes stay blocked everywhere.
const { execSync } = require('child_process');
const { logEvent } = require('./_log');

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
  const cwd = data.cwd || process.cwd();

  const PROTECTED = /\b(main|master|prod)\b/;

  const block = (reason) => {
    logEvent('prod_fence_block', { reason, command: cmd.slice(0, 300) });
    console.error(
      `BLOCKED by prod fence (${reason}). Push only feature branches and open a PR — a human owns the merge to main.`
    );
    process.exit(2);
  };

  const currentBranch = () => {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      return '';
    }
  };

  // Resolve the repo a git command targets (honors `git -C <path>`), then check
  // whether it is the exempt vault repo by its origin remote.
  const targetDir = () => {
    const m = cmd.match(/\bgit\b\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
    return (m && (m[1] || m[2] || m[3])) || cwd;
  };
  const isVaultRepo = () => {
    try {
      const url = execSync('git config --get remote.origin.url', {
        cwd: targetDir(),
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      return /hb-vault(\.git)?$/i.test(url);
    } catch {
      return false;
    }
  };

  if (/\bgh\s+pr\s+merge\b/.test(cmd)) block('gh pr merge is human-only');

  const pushMatch = cmd.match(/\bgit\b[^|;&]*\bpush\b(.*)$/);
  if (pushMatch) {
    if (/(\s|^)(--force|--force-with-lease|-f)\b/.test(cmd)) block('force push');
    if (/--delete\b/.test(cmd) && PROTECTED.test(cmd)) block('remote branch delete');
    // The vault commits straight to main by design — exempt it from the rest.
    if (!isVaultRepo()) {
      if (PROTECTED.test(cmd)) block('push names a protected branch');
      // bare push (no explicit refspec) resolves to HEAD — block if HEAD is protected
      const args = pushMatch[1].trim().split(/\s+/).filter((t) => t && !t.startsWith('-'));
      if (args.length <= 1) {
        const branch = currentBranch();
        if (PROTECTED.test(branch)) block(`bare push from protected branch '${branch}'`);
      }
    }
  }

  if (/\bgit\b[^|;&]*\b(merge|rebase)\b/.test(cmd)) {
    const branch = currentBranch();
    if (PROTECTED.test(branch)) block(`merge/rebase while on protected branch '${branch}'`);
  }

  process.exit(0);
});
