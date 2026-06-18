# How we used AI to build HB — judge one-pager

**Thesis: we didn't *use an AI assistant*, we *built an AI software factory.***
A role-specialised agent for every phase of the lifecycle, wired into one command,
with quality and safety **enforced in code** and AI's contribution **measured, not asserted.**

## The 60-second proof
```bash
npm run evidence          # recompiles the report from machine-readable sources
```
Then open **[`REPORT.md`](./REPORT.md)** (or **`dashboard.html`** for the live view).
Everything below links to evidence already in this repo.

## Mapped to the award criteria

| Judging theme | What we did | Evidence |
|---|---|---|
| **Coding assistants** | Specialist agents implement each layer: `backend-engineer`, `frontend-engineer`, `design-to-code` (model-tiered: sonnet to build, opus to review, haiku to doc). | [`.claude/agents/`](../../.claude/agents) · authored-churn table in `REPORT.md` |
| **AI-powered planning** | `/spec-feature` turns a request into an Obsidian spec + well-formed Trello cards; `/ship-card` plans each card before coding. | [`.claude/commands/`](../../.claude/commands) · Trello board flow in `REPORT.md` |
| **Requirements gathering** | Business rules live in an Obsidian vault the agents read via MCP before writing code; AI drafts and maintains those notes. | [`docs/ai-evidence/README.md`](./README.md) · Obsidian *AI Factory — Evidence Log* note |
| **AI-assisted testing** | `test-engineer` writes unit tests; a **hook blocks any PR while API tests are red**; CI re-runs the gate. | [`pre-pr-gate.js`](../../.claude/hooks/pre-pr-gate.js) · [`ci.yml`](../../.github/workflows/ci.yml) · telemetry in `REPORT.md` |
| **AI code review** | `code-reviewer` (opus) gates every diff locally; an optional Claude GitHub Action reviews every PR inline. | [`code-reviewer.md`](../../.claude/agents/code-reviewer.md) · [`claude-review.yml`](../../.github/workflows/claude-review.yml) |
| **Documentation tools** | `docs-writer` updates README/Obsidian after each feature; this evidence pack is itself AI-generated. | [`docs-writer.md`](../../.claude/agents/docs-writer.md) · this folder |
| **Evidence of value** | Every AI commit is trailer-tagged; every guardrail firing is logged; a generator compiles it all. | `git log --all --grep="Co-Authored-By.*Claude"` · [`factory-log.jsonl`](../../.claude/factory-log.jsonl) |

## What makes it *intentional* (not just "we prompted a lot")
- **An agent per SDLC role**, not one chat doing everything — see the lifecycle table in `REPORT.md`.
- **Model-tiering on purpose**: opus where judgement matters (review), haiku where it doesn't (docs) — cost-aware by design.
- **Guardrails in code, not vibes**: the prod fence, PR-gate and secrets fence are hooks the model *cannot* talk its way past. "AI does the work; humans own production" is enforced and logged.
- **A measurement layer**: this evidence system proves the claims and keeps accumulating with every commit and PR.

## Live demo flow (≈3 min)
1. `/ship-card <id>` — narrate: card moves itself → branch → specialists fire → tests gate → reviewer gates → PR opens with card + spec links.
2. Ask it to `git push origin main` — the prod fence **refuses**, and the block lands in `factory-log.jsonl`.
3. `npm run evidence` → open `dashboard.html`: AI-authored %, churn, test surface, guardrail log, card→PR trace.
4. Punchline: *N PRs, X% AI-authored, every guardrail firing logged, zero unreviewed prod merges.*
