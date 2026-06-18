# AI-Driven Development Factory — Setup & Runbook

How this repo implements the hackathon battle plan (orchestrated multi-agent
"software factory", human-owned prod gate). What's configured, what still needs
credentials, and the demo runbook.

## What's already configured (committed in this repo)

| Piece | Where | Notes |
|---|---|---|
| Project memory | `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` | Read by every agent/teammate automatically |
| Agent roster | `.claude/agents/` | product-planner (opus) · backend-engineer, frontend-engineer, design-to-code, test-engineer (sonnet) · code-reviewer (opus) · docs-writer (haiku) |
| Planning front-end | `.claude/commands/spec-feature.md` | `/spec-feature <request>` → Obsidian spec + Trello cards (no code) |
| Golden path | `.claude/commands/ship-card.md` | `/ship-card <card-id>` runs card → PR |
| CI | `.github/workflows/ci.yml` | mirrors the lint/test/build gates on every PR & push |
| Evidence-on-PR | `.github/workflows/evidence.yml` | posts the AI-contribution headline as a sticky PR comment |
| Cloud AI review | `.github/workflows/claude-review.yml` | optional inline Claude review (no-op until `ANTHROPIC_API_KEY` secret added) |
| Judge one-pager | `docs/ai-evidence/PITCH.md` | criteria → evidence map; the scoring crib sheet |
| Live dashboard | `docs/ai-evidence/dashboard.html` | renders the evidence offline for the demo |
| Prod fence | `.claude/hooks/block-prod-git.js` | Blocks push/merge/force targeting main/master/prod, and `gh pr merge` |
| PR gate | `.claude/hooks/pre-pr-gate.js` | `gh pr create` blocked unless `npm run test:api` is green |
| Lint-on-edit | `.claude/hooks/post-edit-lint.js` | eslint --fix on every edited API .ts; unfixable problems fed back to the agent |
| Guardrail telemetry | `.claude/hooks/_log.js` → `.claude/factory-log.jsonl` | every block/gate/lint event is timestamped and logged for evidence |
| Evidence generator | `docs/ai-evidence/` (`npm run evidence`) | compiles git + telemetry + Trello + PRs into `REPORT.md` — self-updating proof of AI use |
| Secrets fence | `.claude/settings.json` permissions | Agents cannot Read any `.env*` (`.env.example` stays readable) |
| Agent Teams | `.claude/settings.json` env | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (needs Claude Code ≥ 2.1.32) |
| MCP wiring | `.mcp.json` | Obsidian (HTTP) + Trello (npx) + Stitch (npx, legacy export source) — reads credentials from env vars, nothing secret committed. Design now syncs via the built-in `DesignSync` tool (claude.ai/design), not an MCP server. |
| PR template | `.github/pull_request_template.md` | Forces card + Obsidian links = traceability |
| Design system | `docs/design/DESIGN.md` + `docs/design/claude-design/` | Canonical tokens + Claude Design sync bundle (all 7 screens pulled) |

## What YOU still need to do (credentials & external state)

### 1. Obsidian — ⚠ one toggle left (verified 2026-06-12)
Plugin installed, API key valid, MCP handshake works on HTTPS :27124. But Claude Code
rejects the self-signed cert, so: plugin settings → enable **"Non-encrypted (HTTP) Server"**
(port 27123) — that's the endpoint `.mcp.json` points at.
Credentials live in the gitignored local `.mcp.json` (template: `.mcp.json.example`).
Still to seed: domain model + 5–6 business-rule notes (pricing, order-state machine,
cross-border/customs flow, vendor onboarding, listing rules).

### 2. Trello — ✓ DONE (verified 2026-06-12)
Credentials verified against api.trello.com; board **"H&B E-commerce"** reachable.
Lists: **To Do → In Progress → In Review → Done** (+ Documentation). "To Do" is the
ready queue `/ship-card` pulls from; agents move cards to "In Review" with the PR link.
Still to seed: well-formed cards in "To Do" (clear acceptance criteria).

### 3. Design — Claude Design (migrated off Stitch on 2026-06-18)
Source of truth is **Claude Design** (claude.ai/design), driven by the built-in `DesignSync`
tool + the `/design-sync` skill. The design system and all seven screens live in the
`docs/design/claude-design/` sync bundle (DESIGN.md + foundations + screen `@dsCard` cards),
mirrored per-screen under `docs/design/<screen>/`.

**Live project:** the **"HB — Trans-Frontier Commerce System"** design system on
claude.ai/design. Projects are **per-account** — each dev owns a copy under a different id, so
resolve yours by name (`DesignSync list_projects`); per-device setup lives in
`.design-sync/NOTES.md`. Don't hard-code a project UUID.

> **Login required:** `DesignSync` needs an interactive claude.ai login. A
> `CLAUDE_CODE_OAUTH_TOKEN` session can't be granted design scopes — run `/login` before
> pushing or pulling.

The legacy **Stitch** MCP (`@google/stitch-mcp@latest`, token `STITCH_API_KEY` in `.mcp.json`,
regenerate at stitch.withgoogle.com if needed) is retained only to re-pull historical exports;
it is no longer live truth.

**What agents must do before implementing any new screen:**
1. Read the mirrored design under `docs/design/<screen>/` (export.html + reference.png).
   All seven current screens are already pulled.
2. For a new/updated screen, sync it from the Claude Design project via `/design-sync`
   (`DesignSync` tool) into the `docs/design/claude-design/` bundle, then mirror the export
   + screenshot to `docs/design/<screen>/`.
3. Capture any token changes into `docs/design/DESIGN.md` (canonical reference).
4. Hand the export to the `design-to-code` agent, which converts it to an idiomatic
   Angular standalone component — never paste raw exported markup into the app.

### 4. GitHub — ✓ DONE (2026-06-12)
gh CLI 2.93.0 installed, authed as michaeljvr11. Branch protection live on `main`:
1 approving review required, force pushes and deletions disallowed (repo is public,
so protection is enforced on the free plan).

### 5. (Optional) Enable inline Claude PR review
`ci.yml` and `evidence.yml` work out of the box (only `GITHUB_TOKEN`, which is automatic).
The cloud Claude review in `claude-review.yml` stays a no-op (green, skipped) until you add a
repo secret **`ANTHROPIC_API_KEY`** (repo → Settings → Secrets and variables → Actions). Verify
the `anthropics/claude-code-action` version/inputs against its current docs before relying on it.

### 6. Verify (do this BEFORE the event)
1. Restart Claude Code in this repo; approve the project `.mcp.json` servers when prompted.
2. `/mcp` — both servers connected.
3. Trivial calls: "list Trello lists on the board" · "search Obsidian for <note>" · "list my Claude Design projects" (needs `/login`).
4. Test the fence: ask the agent to `git push origin main` — the hook must refuse.
5. **Dry-run `/ship-card` on one seeded card.** Fix friction now, not on stage.

## Demo runbook
1. Open on the control plane: `claude agents` (or Agent Team in-process view).
2. `/ship-card <id>` — narrate: card moves itself → branch → specialists fire →
   tests green → reviewer gates → PR opens with card+spec links.
3. Show a guardrail live: ask it to merge to main; the hook refuses.
4. Human reviews + merges. "AI does the work; humans own production — enforced in code."
5. Quantify — don't hand-wave: run `npm run evidence` live and open
   [`docs/ai-evidence/REPORT.md`](ai-evidence/REPORT.md). It compiles, from machine-readable
   sources, the AI-authored-commit %, churn by area, test surface, the guardrail telemetry
   (every prod-fence block, every PR gate), and the card → branch → PR traceability chain.
   Methodology: [`docs/ai-evidence/README.md`](ai-evidence/README.md).

## Evidence system (how we prove the value, not just assert it)
The award rewards *evidence of value added*. Three mechanisms capture it continuously:
1. **AI-authorship trailer** — every AI commit ends `Co-Authored-By: Claude <noreply@anthropic.com>`,
   so `git log --all --grep="Co-Authored-By.*Claude"` is a tamper-evident authorship audit.
2. **Guardrail telemetry** — the hooks append structured events to `.claude/factory-log.jsonl`
   on every fire, turning "we have guardrails" into "here is the log of every time they fired".
3. **Evidence generator** — `npm run evidence` mines those plus git, Trello and GitHub into
   `docs/ai-evidence/REPORT.md`. Re-runnable any time; always reflects current reality.
