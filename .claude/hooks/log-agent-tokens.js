#!/usr/bin/env node
// SubagentStop hook: records token usage per specialist-agent invocation to
// .claude/factory-log.jsonl, so the evidence generator can show whether
// changes to agent definitions (e.g. the ponytail minimalism ladder) actually
// move token usage over time. Never blocks the agent — logging failures are
// swallowed by _log.js.
const { logEvent } = require('./_log');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    if (data.hook_event_name !== 'SubagentStop') return;
    const u = data.usage || {};
    logEvent('agent_token_usage', {
      agentType: data.agent_type || 'unknown',
      agentId: data.agent_id,
      sessionId: data.session_id,
      stopReason: data.stop_reason,
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheCreationInputTokens: u.cache_creation_input_tokens || 0,
      cacheReadInputTokens: u.cache_read_input_tokens || 0,
    });
  } catch {
    // intentionally ignored — logging must never block the agent.
  } finally {
    process.exit(0);
  }
});
