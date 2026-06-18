#!/usr/bin/env node
// Shared append-only event logger for the AI Factory hooks.
// Every guardrail interaction (prod-fence block, PR gate run, lint-on-edit)
// records one JSON line in .claude/factory-log.jsonl. That file is the
// tamper-evident audit trail the evidence generator (docs/ai-evidence) mines.
//
// HARD RULE: logging must NEVER change a hook's control flow. If anything here
// throws, we swallow it — a logging failure must not block the agent and, far
// more importantly, must not let the prod fence fail open.
const fs = require('fs');
const path = require('path');

// _log.js lives in .claude/hooks/, so repo root is two levels up.
const LOG_PATH = path.resolve(__dirname, '..', '..', '.claude', 'factory-log.jsonl');

/**
 * Append one event to the factory log.
 * @param {string} type  short event kind, e.g. 'prod_fence_block'
 * @param {object} fields any extra structured detail
 */
function logEvent(type, fields = {}) {
  try {
    const event = {
      ts: new Date().toISOString(),
      type,
      ...fields,
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(event) + '\n');
  } catch {
    // intentionally ignored — see HARD RULE above.
  }
}

module.exports = { logEvent, LOG_PATH };
