# AI-Driven Development Factory — Setup & Runbook

How this repo implements the hackathon battle plan (orchestrated multi-agent
"software factory", human-owned prod gate). What's configured, what still needs
credentials, and the demo runbook.

## What's already configured (committed in this repo)

| Piece | Where | Notes |
|---|---|---|
| Project memory | `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` | Read by every agent/teammate automatically |
| Agent roster | `.claude/agents/` | backend-engineer, frontend-engineer, design-to-code, test-engineer (sonnet) · code-reviewer (opus) · docs-writer (haiku) |
| Golden path | `.claude/commands/ship-card.md` | `/ship-card <card-id>` runs card → PR |
| Prod fence | `.claude/hooks/block-prod-git.js` | Blocks push/merge/force targeting main/master/prod, and `gh pr merge` |
| PR gate | `.claude/hooks/pre-pr-gate.js` | `gh pr create` blocked unless `npm run test:api` is green |
| Lint-on-edit | `.claude/hooks/post-edit-lint.js` | eslint --fix on every edited API .ts; unfixable problems fed back to the agent |
| Secrets fence | `.claude/settings.json` permissions | Agents cannot Read any `.env*` (`.env.example` stays readable) |
| Agent Teams | `.claude/settings.json` env | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (needs Claude Code ≥ 2.1.32) |
| MCP wiring | `.mcp.json` | Obsidian (HTTP) + Trello (npx) + Stitch (npx) — reads credentials from env vars, nothing secret committed |
| PR template | `.github/pull_request_template.md` | Forces card + Obsidian links = traceability |
| Design scaffold | `docs/design/DESIGN.md` | Placeholder — replace with Stitch export |

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

### 3. Stitch — ✓ DONE (verified 2026-06-13)
MCP connected via `@google/stitch-mcp@latest` (stdio). API token is in `.mcp.json`
under `STITCH_API_KEY` (gitignored; regenerate at stitch.withgoogle.com → Settings →
API Tokens if it stops working — tokens expire after 90 days).

**What agents must do before implementing any new screen:**
1. Use the `stitch` MCP tools to pull the target screen's design and design tokens.
   Start by listing available projects/screens, then fetch the specific screen's
   markup and token values.
2. Capture any token overrides into `docs/design/DESIGN.md` (colors, type scale,
   spacing) so they remain the canonical reference.
3. Save the raw Stitch HTML+Tailwind export to `docs/design/<screen>/export.html`
   and a screenshot to `docs/design/<screen>/reference.png` for traceability.
4. Hand the export to the `design-to-code` agent, which converts it to an idiomatic
   Angular standalone component — never paste raw exported markup into the app.

**Fallback (if MCP is down):** export HTML+Tailwind manually from the Stitch UI
into `docs/design/<screen>/export.html` + `reference.png`. The `design-to-code`
agent reads those files directly; the workflow is identical.

### 4. GitHub — ✓ DONE (2026-06-12)
gh CLI 2.93.0 installed, authed as michaeljvr11. Branch protection live on `main`:
1 approving review required, force pushes and deletions disallowed (repo is public,
so protection is enforced on the free plan).

### 5. Verify (do this BEFORE the event)
1. Restart Claude Code in this repo; approve the project `.mcp.json` servers when prompted.
2. `/mcp` — both servers connected.
3. Trivial calls: "list Trello lists on the board" · "search Obsidian for <note>" · "list my Stitch projects".
4. Test the fence: ask the agent to `git push origin main` — the hook must refuse.
5. **Dry-run `/ship-card` on one seeded card.** Fix friction now, not on stage.

## Demo runbook
1. Open on the control plane: `claude agents` (or Agent Team in-process view).
2. `/ship-card <id>` — narrate: card moves itself → branch → specialists fire →
   tests green → reviewer gates → PR opens with card+spec links.
3. Show a guardrail live: ask it to merge to main; the hook refuses.
4. Human reviews + merges. "AI does the work; humans own production — enforced in code."
5. Quantify: N cards, N PRs, % AI-authored lines, zero unreviewed prod merges.
