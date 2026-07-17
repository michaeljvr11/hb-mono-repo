---
name: align-steering-docs
description: >
  Audit whether the steering documentation (root and app CLAUDE.md files, the
  golden-path commands in .claude/commands/, the agent definitions in
  .claude/agents/, and the skills in .claude/skills/) still matches the
  project's actual current state. Use when the user says "check our docs are
  still accurate", "audit CLAUDE.md", "are our agents/skills up to date",
  "align steering docs", or after a period of fast-moving change where
  drift is suspected. Report-only — flags gaps for a human to action, does
  not edit the steering docs itself.
---

# align-steering-docs

Steering docs (CLAUDE.md, `.claude/commands/`, `.claude/agents/`, `.claude/skills/`) are
the contract the whole AI factory runs on. They drift silently: a command changes, a new
app area appears, a non-negotiable stops being enforced, an agent references a tool that
no longer exists. This skill finds that drift and reports it — it does not fix it. Fixing
is a human (or a follow-up, explicitly-approved) edit.

## 1. Gather context

Read, in full:
- Root `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` (whichever exist).
- Every file in `.claude/commands/`.
- Every file in `.claude/agents/`.
- Every `SKILL.md` under `.claude/skills/`.
- `README.md` (declared current truth for architecture).
- `package.json` (root and each app) for the actual npm scripts.

## 2. Compare claims against reality

For each claim a steering doc makes, check it against the live repo — don't take the doc's
word for it:

- **Commands** — does every command named in CLAUDE.md (`npm run build`, `npm run dev:api`,
  etc.) still exist in the relevant `package.json`? Do the described hooks
  (`.claude/hooks/*`) still exist and match their described behaviour?
- **Layout claims** — does `apps/api`, `apps/web`, `libs/shared` still map the way CLAUDE.md
  describes? Has a new top-level app/lib appeared that isn't mentioned anywhere?
  (`docs/architecture/` and `docs/business/` currently exist but aren't referenced in
  CLAUDE.md's "Layout" or "Source of truth" sections — flag this as a candidate gap.)
- **Non-negotiables** — spot-check each one against actual code: are DTOs actually
  `implement`-ing `@hb/shared` interfaces? Is `synchronize` actually off in the TypeORM
  config? Do money columns actually use `numeric(12,2)` + a currency column? Sample, don't
  attempt full coverage — call out where a full check would need a specialist agent.
  Cross-check `CLAUDE.md:33` ("`@hb/shared` interfaces + enums only") for anything that has
  crept into that lib beyond pure contracts.
- **Agent definitions** — does each agent's declared tool list match what the task
  described actually requires? Does it reference files/paths/conventions that still exist?
- **Skill definitions** — does each skill's trigger description still match how users
  actually invoke it? Do the shell commands/paths inside still resolve (spot-check a few)?
- **Golden path** — walk `/spec-feature` → `/ship-card` step by step against what actually
  happens today (Trello list names, Obsidian vault layout, branch naming). Flag any step
  that no longer matches observed practice.
- **Cross-references** — anywhere one doc points at another (e.g. CLAUDE.md → README.md →
  design bundle), confirm the target still exists and still says what's claimed.

## 3. Score and write findings

For each finding, capture: `doc` (file + line), `claim`, `reality`, `severity`
(`stale` / `misleading` / `broken`), and a one-line `recommendation`. Do not apply the
recommendation yourself.

Write the findings to `docs/ai-evidence/steering-audit.json`:

```json
{
  "generatedAt": "<ISO timestamp>",
  "findings": [
    {
      "doc": ".claude/commands/spec-feature.md",
      "line": 12,
      "claim": "...",
      "reality": "...",
      "severity": "stale",
      "recommendation": "..."
    }
  ],
  "docsScanned": ["CLAUDE.md", "apps/api/CLAUDE.md", "..."]
}
```

This file is a data source for the AI Factory Evidence Dashboard — `npm run evidence`
picks it up automatically (degrades gracefully if absent, same as the Trello/`gh`
sources) and renders a "Steering doc health" section in `REPORT.md` / `dashboard.html`.

## 4. Report to the user

Summarise finding counts by severity, call out anything `broken` explicitly, and suggest
next step: usually "confirm these, then I'll draft the doc edits" — do not draft edits in
this same pass unless the user asks.
