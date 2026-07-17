#!/usr/bin/env node
/**
 * AI Factory — Evidence Generator
 * --------------------------------
 * Compiles auditable evidence of how AI tools built this project into
 * docs/ai-evidence/REPORT.md (+ report.json). Designed to be re-run at any
 * time — it always reflects the latest git history and guardrail telemetry,
 * so evidence keeps compiling as the project grows.
 *
 * Run:  npm run evidence
 *
 * Data sources (each degrades gracefully if unavailable):
 *   1. git history          — commits, AI-attribution trailers, churn by area
 *   2. .claude/factory-log.jsonl — guardrail telemetry written by the hooks
 *   3. gh CLI (optional)     — pull requests
 *   4. Trello REST (optional)— card flow, creds read from .mcp.json if present
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const US = '\x1f'; // unit separator
const RS = '\x1e'; // record separator

const notes = []; // degradation / provenance notes surfaced in the report
const note = (m) => notes.push(m);

function git(args) {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ── Area classification ────────────────────────────────────────────────────
function areaOf(path) {
  const p = path.replace(/\\/g, '/');
  if (p.startsWith('apps/api/')) return 'API (NestJS)';
  if (p.startsWith('apps/web/')) return 'Web (Angular)';
  if (p.startsWith('libs/shared/')) return 'Shared contracts';
  if (p.startsWith('.claude/')) return 'AI Factory config';
  if (p.startsWith('.github/')) return 'CI / templates';
  if (p.startsWith('docs/')) return 'Docs';
  return 'Root & config';
}

// Generated artifacts inflate churn and were not hand-authored — exclude from
// LOC figures so the headline reflects real authored code.
const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|(^|\/)dist\//;
const APP_AREAS = new Set(['API (NestJS)', 'Web (Angular)', 'Shared contracts']);

const AI_TRAILER = /Co-Authored-By:.*Claude/i;

// ── 1. Git history ──────────────────────────────────────────────────────────
function collectGit() {
  const commits = [];
  try {
    const raw = git(`log --all --no-merges --date=short --pretty=format:"%H${US}%an${US}%ad${US}%s${US}%b${RS}"`);
    for (const chunk of raw.split(RS)) {
      const c = chunk.trim();
      if (!c) continue;
      const [hash, author, date, subject, body = ''] = c.split(US);
      commits.push({ hash, author, date, subject, body, ai: AI_TRAILER.test(body), files: [], ins: 0, del: 0 });
    }
  } catch (e) {
    note('git log unavailable — is this a git repo? ' + e.message.split('\n')[0]);
    return null;
  }

  // numstat pass, keyed by hash
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  try {
    const raw = git(`log --all --no-merges --numstat --pretty=format:"${RS}%H"`);
    let cur = null;
    for (const line of raw.split('\n')) {
      if (line.startsWith(RS)) { cur = byHash.get(line.slice(1).trim()); continue; }
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (m && cur && !GENERATED.test(m[3])) {
        const ins = m[1] === '-' ? 0 : +m[1];
        const del = m[2] === '-' ? 0 : +m[2];
        cur.ins += ins; cur.del += del;
        cur.files.push({ path: m[3], ins, del });
      }
    }
  } catch { note('git numstat pass failed — churn figures may be incomplete.'); }

  // Aggregate
  const areas = {};
  const filesTouched = new Set();
  let ins = 0, del = 0, aiIns = 0, aiDel = 0, appCommits = 0;
  for (const c of commits) {
    ins += c.ins; del += c.del;
    if (c.ai) { aiIns += c.ins; aiDel += c.del; }
    let touchesApp = false;
    for (const f of c.files) {
      filesTouched.add(f.path);
      const area = areaOf(f.path);
      if (APP_AREAS.has(area)) touchesApp = true;
      const a = (areas[area] ||= { commits: new Set(), ins: 0, del: 0 });
      a.commits.add(c.hash); a.ins += f.ins; a.del += f.del;
    }
    if (touchesApp) appCommits++;
  }
  const areaRows = Object.entries(areas)
    .map(([name, v]) => ({ name, commits: v.commits.size, ins: v.ins, del: v.del }))
    .sort((a, b) => b.ins + b.del - (a.ins + a.del));

  const dates = commits.map((c) => c.date).filter(Boolean).sort();
  const aiCommits = commits.filter((c) => c.ai).length;

  return {
    totalCommits: commits.length,
    aiCommits,
    aiPct: commits.length ? Math.round((aiCommits / commits.length) * 100) : 0,
    appCommits,
    ins, del, net: ins - del,
    aiIns, aiDel,
    filesTouched: filesTouched.size,
    areaRows,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    recent: commits.slice(0, 12).map((c) => ({ hash: c.hash.slice(0, 7), subject: c.subject, ai: c.ai })),
  };
}

// ── Feature branches → card ids ─────────────────────────────────────────────
function collectBranches() {
  try {
    const raw = git('branch -a --format="%(refname:short)"');
    const feats = new Set();
    for (const line of raw.split('\n')) {
      const b = line.trim().replace(/^origin\//, '');
      const m = b.match(/^feat\/([^/-]+)-(.+)$/);
      if (m) feats.add(JSON.stringify({ branch: `feat/${m[1]}-${m[2]}`, cardId: m[1], slug: m[2] }));
    }
    return [...feats].map((s) => JSON.parse(s));
  } catch { return []; }
}

// ── Test surface ────────────────────────────────────────────────────────────
function collectTests() {
  try {
    const raw = git('ls-files "*.spec.ts" "*.test.ts"');
    const files = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    return {
      total: files.length,
      api: files.filter((f) => f.startsWith('apps/api/')).length,
      web: files.filter((f) => f.startsWith('apps/web/')).length,
    };
  } catch { return { total: 0, api: 0, web: 0 }; }
}

// ── Design exports (Stitch traceability) ────────────────────────────────────
function collectDesign() {
  try {
    const raw = git('ls-files "docs/design/*"');
    const files = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    const screens = new Set();
    for (const f of files) {
      const m = f.match(/^docs\/design\/([^/]+)\//);
      if (m) screens.add(m[1]);
    }
    return { files: files.length, screens: [...screens] };
  } catch { return { files: 0, screens: [] }; }
}

// ── 2. Guardrail telemetry + per-agent token usage ──────────────────────────
function collectTelemetry() {
  const logPath = join(ROOT, '.claude', 'factory-log.jsonl');
  const out = { present: false, prodBlocks: 0, blockReasons: {}, gatePass: 0, gateFail: 0, edits: 0, editsUnfixable: 0, firstTs: null, lastTs: null };
  const agents = new Map(); // agentType -> { invocations, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
  const recentTokenEvents = [];
  if (!existsSync(logPath)) {
    note('No telemetry yet (.claude/factory-log.jsonl absent) — the hooks populate it as the factory runs.');
    out.agentTokens = { present: false, byAgent: [], recent: [] };
    return out;
  }
  out.present = true;
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.ts) { out.firstTs ||= e.ts; out.lastTs = e.ts; }
    if (e.type === 'prod_fence_block') { out.prodBlocks++; out.blockReasons[e.reason] = (out.blockReasons[e.reason] || 0) + 1; }
    else if (e.type === 'pr_gate') { e.result === 'pass' ? out.gatePass++ : out.gateFail++; }
    else if (e.type === 'edit_lint') { out.edits++; if (e.autofixed === false) out.editsUnfixable++; }
    else if (e.type === 'agent_token_usage') {
      const a = agents.get(e.agentType) || { invocations: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
      a.invocations++;
      a.inputTokens += e.inputTokens || 0;
      a.outputTokens += e.outputTokens || 0;
      a.cacheReadTokens += e.cacheReadInputTokens || 0;
      a.cacheCreationTokens += e.cacheCreationInputTokens || 0;
      agents.set(e.agentType, a);
      recentTokenEvents.push({ ts: e.ts, agentType: e.agentType, totalTokens: (e.inputTokens || 0) + (e.outputTokens || 0) });
    }
  }
  const byAgent = [...agents.entries()]
    .map(([agentType, v]) => ({ agentType, ...v, totalTokens: v.inputTokens + v.outputTokens }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
  out.agentTokens = {
    present: byAgent.length > 0,
    byAgent,
    recent: recentTokenEvents.slice(-20),
  };
  return out;
}

// ── 3. Pull requests (gh, optional) ─────────────────────────────────────────
function collectPRs() {
  try {
    const raw = execSync('gh pr list --state all --limit 100 --json number,title,headRefName,url,state', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(raw);
  } catch { note('gh CLI not available/authed — PR list skipped.'); return null; }
}

// ── 4. Steering-doc audit (optional, produced by /align-steering-docs) ─────
function collectSteeringAudit() {
  const p = join(ROOT, 'docs', 'ai-evidence', 'steering-audit.json');
  if (!existsSync(p)) { note('No steering-audit.json yet — run the align-steering-docs skill to populate it.'); return null; }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { note('steering-audit.json unreadable — ' + e.message.split('\n')[0]); return null; }
}

// ── 5. Extraction candidates (optional, produced by /service-extraction-analysis)
function collectExtractionCandidates() {
  const p = join(ROOT, 'docs', 'ai-evidence', 'extraction-candidates.json');
  if (!existsSync(p)) { note('No extraction-candidates.json yet — run the service-extraction-analysis skill to populate it.'); return null; }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { note('extraction-candidates.json unreadable — ' + e.message.split('\n')[0]); return null; }
}

// ── 6. Trello (REST, optional) ──────────────────────────────────────────────
async function collectTrello() {
  const mcpPath = join(ROOT, '.mcp.json');
  if (!existsSync(mcpPath)) { note('No .mcp.json — Trello card flow skipped.'); return null; }
  let creds;
  try { creds = JSON.parse(readFileSync(mcpPath, 'utf8'))?.mcpServers?.trello?.env; } catch { return null; }
  if (!creds?.TRELLO_API_KEY || !creds?.TRELLO_TOKEN || !creds?.TRELLO_BOARD_ID) { note('Trello creds incomplete in .mcp.json — card flow skipped.'); return null; }
  try {
    const url = `https://api.trello.com/1/boards/${creds.TRELLO_BOARD_ID}/lists?cards=open&card_fields=name&fields=name&key=${creds.TRELLO_API_KEY}&token=${creds.TRELLO_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) { note(`Trello API ${res.status} — card flow skipped.`); return null; }
    const lists = await res.json();
    return lists.map((l) => ({ name: l.name, cards: (l.cards || []).length }));
  } catch (e) { note('Trello request failed — ' + e.message.split('\n')[0]); return null; }
}

// ── Report rendering ────────────────────────────────────────────────────────
function md(data) {
  const { git: g, branches, tests, design, telemetry: t, prs, trello, steeringAudit, extractionCandidates, generatedAt } = data;
  const L = [];
  L.push('# AI Factory — Evidence Report');
  L.push('');
  L.push('> Auto-generated by `npm run evidence` — **do not edit by hand.**  ');
  L.push(`> Generated: ${generatedAt}`);
  L.push('');
  L.push('This report is compiled from machine-readable sources (git history, guardrail');
  L.push('telemetry, Trello, GitHub). It is the auditable backing for our claim of');
  L.push('*intentional, effective use of AI* to build this project. Methodology: [README.md](./README.md).');
  L.push('');

  // Headline
  L.push('## Headline');
  L.push('');
  if (g) {
    L.push(`- **${g.totalCommits}** commits` + (g.firstDate ? ` (${g.firstDate} → ${g.lastDate})` : ''));
    L.push(`- **${g.aiCommits}** carry a machine-verifiable AI-authorship trailer (**${g.aiPct}%**)`);
    L.push(`- **+${g.ins.toLocaleString()} / −${g.del.toLocaleString()}** lines across **${g.filesTouched}** files`);
  }
  L.push(`- **${tests.total}** test specs (API ${tests.api} · Web ${tests.web})`);
  L.push(`- Guardrails: **${t.prodBlocks}** prod-fence blocks · **${t.gatePass}** green PR gates · **${t.editsUnfixable}** lint issues fed back to the agent`);
  L.push('');

  // Lifecycle coverage
  L.push('## Lifecycle coverage — an AI agent for every phase');
  L.push('');
  L.push('| Phase | AI driver | Evidence in this repo |');
  L.push('|---|---|---|');
  L.push(`| Requirements | Obsidian MCP + business-rule notes | source-of-truth notes feed every agent |`);
  L.push(`| Planning | \`/ship-card\` plan step + Trello | ${branches.length} feature branch(es) traced to card ids |`);
  L.push(`| Design | Stitch MCP → design-to-code agent | ${design.files} export file(s) across ${design.screens.length} screen(s)${design.screens.length ? ': ' + design.screens.join(', ') : ''} |`);
  L.push(`| Implementation | backend / frontend engineers (sonnet) | ${g ? g.appCommits : 0} commits touching app code |`);
  L.push(`| Testing | test-engineer + PR gate hook | ${tests.total} specs · ${t.gatePass + t.gateFail} gate run(s) |`);
  L.push(`| Review | code-reviewer (opus) | runs on every diff before PR |`);
  L.push(`| Docs | docs-writer (haiku) + this report | ${g ? (g.areaRows.find((r) => r.name === 'Docs')?.commits || 0) : 0} docs commit(s) |`);
  L.push(`| Safety | enforced hooks (not prompts) | ${t.prodBlocks} prod block(s), ${t.editsUnfixable} lint fixups recorded |`);
  L.push('');

  // Authorship & churn
  if (g) {
    L.push('## AI authorship & churn by area');
    L.push('');
    L.push('| Area | Commits | + lines | − lines |');
    L.push('|---|--:|--:|--:|');
    for (const r of g.areaRows) L.push(`| ${r.name} | ${r.commits} | ${r.ins.toLocaleString()} | ${r.del.toLocaleString()} |`);
    L.push(`| **Total** | **${g.totalCommits}** | **${g.ins.toLocaleString()}** | **${g.del.toLocaleString()}** |`);
    L.push('');
    L.push('_Counts span all branches; generated lockfiles (`package-lock.json` etc.) are excluded so');
    L.push('figures reflect authored code. The AI-authorship trailer was adopted as a convention — commits');
    L.push('made before adoption were still produced through the factory but predate the trailer, which makes');
    L.push('the figure tamper-evident going forward (`git log --grep="Co-Authored-By.*Claude"`)._');
    L.push('');
  }

  // Guardrail telemetry
  L.push('## Guardrail telemetry (the safety story, with data)');
  L.push('');
  if (!t.present) {
    L.push('_No events captured yet. The hooks append to `.claude/factory-log.jsonl` as the factory runs;');
    L.push('re-run `npm run evidence` after a `/ship-card` cycle to populate this section._');
  } else {
    L.push(`Window: ${t.firstTs || '—'} → ${t.lastTs || '—'}`);
    L.push('');
    L.push('| Guardrail | Fired | Detail |');
    L.push('|---|--:|---|');
    const reasons = Object.entries(t.blockReasons).map(([k, v]) => `${k} ×${v}`).join('; ') || '—';
    L.push(`| Prod fence (blocked unsafe git) | ${t.prodBlocks} | ${reasons} |`);
    L.push(`| PR gate (tests before PR) | ${t.gatePass + t.gateFail} | ${t.gatePass} pass / ${t.gateFail} fail |`);
    L.push(`| Lint-on-edit | ${t.edits} | ${t.editsUnfixable} needed agent rework |`);
    L.push('');
    L.push('> **Zero unreviewed prod merges** is not a promise — it is enforced by `block-prod-git.js` and logged above.');
  }
  L.push('');

  // Token usage by agent
  L.push('## Token usage by agent');
  L.push('');
  if (!t.agentTokens || !t.agentTokens.present) {
    L.push('_No agent-token telemetry yet — `log-agent-tokens.js` (SubagentStop hook) populates this as specialist');
    L.push('agents (backend-engineer, frontend-engineer, etc.) run. Re-run `npm run evidence` after a `/ship-card`');
    L.push('or `/ship-batch` cycle to populate this section._');
  } else {
    const ba = t.agentTokens.byAgent;
    const totalAll = ba.reduce((s, a) => s + a.totalTokens, 0);
    L.push('| Agent | Invocations | Input tokens | Output tokens | Cache read | Cache write | Total |');
    L.push('|---|--:|--:|--:|--:|--:|--:|');
    for (const a of ba) {
      L.push(`| ${a.agentType} | ${a.invocations} | ${a.inputTokens.toLocaleString()} | ${a.outputTokens.toLocaleString()} | ${a.cacheReadTokens.toLocaleString()} | ${a.cacheCreationTokens.toLocaleString()} | ${a.totalTokens.toLocaleString()} |`);
    }
    L.push(`| **Total** | **${ba.reduce((s, a) => s + a.invocations, 0)}** |  |  |  |  | **${totalAll.toLocaleString()}** |`);
    L.push('');
    L.push('_Tracks whether changes to agent definitions (e.g. the ponytail minimalism ladder) actually move token');
    L.push('spend — compare this table\'s totals across evidence snapshots taken before and after such a change._');
  }
  L.push('');

  // Traceability
  L.push('## Traceability — card → branch → PR');
  L.push('');
  if (branches.length) {
    L.push('| Card id | Branch | PR |');
    L.push('|---|---|---|');
    for (const b of branches) {
      const pr = prs?.find((p) => p.headRefName === b.branch);
      L.push(`| \`${b.cardId}\` | \`${b.branch}\` | ${pr ? `[#${pr.number}](${pr.url}) (${pr.state})` : '—'} |`);
    }
  } else {
    L.push('_No `feat/<card-id>-<slug>` branches found yet._');
  }
  L.push('');

  // Trello flow
  if (trello) {
    L.push('## Trello — work moved through the board by agents');
    L.push('');
    L.push('| List | Open cards |');
    L.push('|---|--:|');
    for (const l of trello) L.push(`| ${l.name} | ${l.cards} |`);
    L.push('');
  }

  // Recent AI commits
  if (g?.recent?.length) {
    L.push('## Recent commits');
    L.push('');
    for (const c of g.recent) L.push(`- \`${c.hash}\` ${c.ai ? '🤖' : '  '} ${c.subject}`);
    L.push('');
  }

  // Steering doc health
  if (steeringAudit) {
    L.push('## Steering doc health');
    L.push('');
    L.push(`Last audited: ${steeringAudit.generatedAt || '—'} · ${(steeringAudit.docsScanned || []).length} doc(s) scanned`);
    L.push('');
    const findings = steeringAudit.findings || [];
    if (findings.length) {
      L.push('| Doc | Severity | Claim vs reality | Recommendation |');
      L.push('|---|---|---|---|');
      for (const f of findings) {
        L.push(`| \`${f.doc}\`${f.line ? `:${f.line}` : ''} | ${f.severity} | ${f.claim} → ${f.reality} | ${f.recommendation} |`);
      }
    } else {
      L.push('_No drift found in the last audit._');
    }
    L.push('');
  }

  // Service extraction candidates
  if (extractionCandidates) {
    L.push('## Monorepo extraction candidates');
    L.push('');
    L.push(`Last analysed: ${extractionCandidates.generatedAt || '—'}`);
    L.push('');
    const candidates = extractionCandidates.candidates || [];
    if (candidates.length) {
      L.push('| Module | Rank | Commits | Authors | LOC | Coupling (in/out) | Rationale |');
      L.push('|---|---|--:|--:|--:|---|---|');
      for (const c of candidates) {
        L.push(`| \`${c.module}\` | ${c.rank} | ${c.commits ?? '—'} | ${c.authors ?? '—'} | ${c.loc ?? '—'} | ${c.inboundCoupling ?? '—'}/${c.outboundCoupling ?? '—'} | ${c.rationale} |`);
      }
    } else {
      L.push('_No candidates surfaced in the last analysis._');
    }
    L.push('');
    L.push('_Analytical input only — extraction has real operational cost this table doesn\'t price._');
    L.push('');
  }

  if (notes.length) {
    L.push('## Provenance / data-source notes');
    L.push('');
    for (const n of notes) L.push(`- ${n}`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

// ── Main ────────────────────────────────────────────────────────────────────
const data = {
  generatedAt: new Date().toISOString(),
  git: collectGit(),
  branches: collectBranches(),
  tests: collectTests(),
  design: collectDesign(),
  telemetry: collectTelemetry(),
  steeringAudit: collectSteeringAudit(),
  extractionCandidates: collectExtractionCandidates(),
  prs: collectPRs(),
  trello: await collectTrello(),
  notes,
};

writeFileSync(join(__dirname, 'report.json'), JSON.stringify(data, null, 2));
// JS-wrapped copy so dashboard.html can load it via <script src> over file://
// (browsers block fetch() on file://, but script tags work).
writeFileSync(join(__dirname, 'report.js'), 'window.EVIDENCE = ' + JSON.stringify(data) + ';\n');
writeFileSync(join(__dirname, 'REPORT.md'), md(data));
console.log('Evidence compiled → docs/ai-evidence/REPORT.md');
if (data.git) console.log(`  ${data.git.totalCommits} commits · ${data.git.aiCommits} AI-tagged · ${data.tests.total} specs · ${data.telemetry.prodBlocks} prod blocks`);
if (notes.length) console.log('  notes: ' + notes.length + ' (see report)');
