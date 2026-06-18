# AI Factory — Evidence System

This folder is the **auditable record of how AI tools built HB**. It exists to back
one claim with data rather than assertion: *we used AI intentionally and effectively
across the whole development lifecycle.*

It is **self-updating**. Three mechanisms capture evidence continuously as the project
grows; a generator compiles them into a report on demand.

## The artifacts

| File | What it is |
|---|---|
| [`REPORT.md`](./REPORT.md) | Human-readable evidence report — **start here**. Auto-generated; never hand-edited. |
| [`PITCH.md`](./PITCH.md) | Judge-facing one-pager: award criteria → evidence map. |
| [`dashboard.html`](./dashboard.html) | Live, offline dashboard for the demo — open it in a browser. |
| `report.json` / `report.js` | The data, machine-readable (`.js` is the `window.EVIDENCE` form the dashboard loads). |
| `generate.mjs` | The compiler. Mines git + telemetry + Trello + GitHub. |
| `../../.claude/factory-log.jsonl` | Append-only guardrail telemetry written by the hooks. |

## Regenerate any time

```bash
npm run evidence
```

Re-run it before a demo, after a `/ship-card` cycle, or whenever you want fresh
numbers. It always reflects current reality — no manual bookkeeping.

## How evidence is captured (the three mechanisms)

### 1. AI-authorship trailer → provable authorship
Every AI-produced commit carries a trailer:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

This makes AI authorship **machine-verifiable and tamper-evident** — anyone can audit it:

```bash
git log --all --grep="Co-Authored-By.*Claude" --oneline
```

The convention is enforced by the [`/ship-card`](../../.claude/commands/ship-card.md)
golden path and documented in [`CLAUDE.md`](../../CLAUDE.md). Commits made before the
convention was adopted were still produced through the factory; the trailer makes the
figure rigorous from adoption onward, so the percentage only climbs.

### 2. Guardrail telemetry → the safety story, with data
The three factory hooks ([prod fence](../../.claude/hooks/block-prod-git.js),
[PR gate](../../.claude/hooks/pre-pr-gate.js),
[lint-on-edit](../../.claude/hooks/post-edit-lint.js)) each append a structured event
to `.claude/factory-log.jsonl` via the shared [`_log.js`](../../.claude/hooks/_log.js)
logger every time they fire. So "AI does the work, humans own prod" is not a promise —
it is a timestamped log of every blocked push, every test gate, every lint fixup.

Event types: `prod_fence_block` (with reason), `pr_gate` (pass/fail + duration),
`edit_lint` (file + whether eslint auto-fixed it). Logging is wrapped so a failure can
never alter a hook's decision — the prod fence cannot fail open.

### 3. Existing system-of-record data
The generator also reads what the team already produces in the normal workflow:
git history (churn by area), the Trello board (card flow through the pipeline), and
GitHub PRs (traceability). No extra logging required — it's mined, not manufactured.

## How each headline number is derived

| Metric | Source / method |
|---|---|
| Commits, churn, files | `git log --all --no-merges --numstat`; generated lockfiles excluded |
| AI-tagged % | commits whose body matches `Co-Authored-By.*Claude` |
| Churn by area | path prefix → API / Web / Shared / Docs / Factory / CI / Root |
| Test specs | `git ls-files "*.spec.ts" "*.test.ts"` |
| Guardrail counts | tallied from `.claude/factory-log.jsonl` |
| Card → branch → PR | `feat/<card-id>-<slug>` branch names joined to `gh pr list` |
| Trello card flow | Trello REST API (creds read from gitignored `.mcp.json`) |

Any source that is offline (no `gh` auth, no Trello creds) is skipped gracefully and
noted in the report's *Provenance* section — the report never fabricates a number.

## Mapping to the award criteria

The brief rewards *intentional, effective use of AI throughout development, with evidence
of value*. `REPORT.md` is organised to answer exactly that:

- **Throughout the lifecycle** → the *Lifecycle coverage* table: an AI agent per phase
  (requirements, planning, design, implementation, testing, review, docs).
- **Effective / value added** → authored-code volume, test surface, and the guardrail
  telemetry showing quality and safety enforced automatically.
- **Intentional** → this very system: codified roles, model-tiering, enforced hooks,
  and a measurement layer that proves the claims instead of asserting them.

> Initial `factory-log.jsonl` entries dated 2026-06-18 are from validating the guardrail
> pipeline; genuine development events accumulate on top with every run.
