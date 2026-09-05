# How to run the storefront overhaul (human runbook)

This folder is a resumable design effort executed by Claude Fable against a fixed
~US$34 budget. **This file is for you. `BRIEF.md` is for the model.**

## The files

| File | Who writes it | What it is |
|---|---|---|
| `BRIEF.md` | Written up front | The prompt. Don't paste it into chat — point Fable at the path. |
| `RESEARCH.md` | Fable, Phase 0 | Its design research and what it chose to reject. |
| `PLAN.md` | Fable, Phase 0 | Its design thesis + phase plan. May amend the phasing in `BRIEF.md` §5 with justification. |
| `PROGRESS.md` | Fable, every phase | **The resume state.** Status per phase, files, commit SHA, decisions, and a "Next action" line. |

## Starting from scratch

1. Turn usage credits on (Fable bills to credits, not plan quota).
2. New Claude Code session in this repo, model set to **Claude Fable**.
3. First message:

```
Read docs/design/redesign/BRIEF.md and begin at §0.2.
```

## The phases

From `BRIEF.md` §5, in deliberate ROI order. Stopping after Phase 3 still leaves the
site materially better.

| # | Phase | Produces |
|---|---|---|
| 0 | Orient, research, plan | `RESEARCH.md`, `PLAN.md`, `PROGRESS.md`, branch created. No production code. |
| 1 | Token foundation | Real `:root` system (spacing, elevation, motion, z-index, breakpoints), type scale fixed, dark theme, `DESIGN.md` updated. |
| 2 | Desktop nav + shell | Category navigation in the header, persistent desktop search, real 1024/1280/1440+ tiers. |
| 3 | Storefront + product presentation | Real hero, rebuilt product card, fluid grids that use wide viewports. |
| 4 | Trust, states, perceived performance | Skeleton loaders, recoverable empty/error states, cross-border trust surfaced, purposeful micro-interactions. |
| 5 | PDP, cart, checkout | Bottom-of-funnel visual + trust pass. No logic changes. |
| 6 | Follow-ups NOT implemented | Proposed Trello cards written into `PLAN.md` (e.g. `ProductDto` rating fields). |

## How to tell a phase just ended

Per `BRIEF.md` §6, Fable finishes a phase by:

- running `npm run build` and `npm run test -w @hb/web`,
- screenshotting the affected screens itself (it should not ask you to check),
- making **one Conventional Commit** with the `Co-Authored-By` trailer,
- updating `PROGRESS.md` to mark the phase `DONE`.

When you see it commit and update `PROGRESS.md`, that's the boundary.

## At every phase boundary: clear and resume

This is the main cost control. A single long run drags Phase 0 through every later
turn at $10/MTok input. Clearing means each phase starts on a small cold context.

1. `/clear`
2. Paste:

```
Read docs/design/redesign/PROGRESS.md and continue from the first phase not marked DONE.
```

That is also the recovery line for *any* stop — crash, interruption, budget exhaustion.
Nothing about it is Fable-specific: hand it to Opus or Sonnet if the credits run out and
the work continues, just with less design ambition.

## Watching the budget

**The repo's own token logging will not help you.** `.claude/hooks/log-agent-tokens.js`
writes `agent_token_usage` records to `.claude/factory-log.jsonl`, but the harness isn't
populating `data.usage` — every entry logs zeros. Use the Anthropic Console usage page.

Rough shape: $34 at $10/$50 per MTok is on the order of 2–3M input and ~400K output.

## When it's done (or the money is)

The branch is `feat/storefront-visual-overhaul`. **Never merge to `main`** — open the PR
and stop, a human owns prod. Note the hook gotcha: `.claude/hooks/block-prod-git.js`
matches literal command text, so omit `--base main` and run the `git push` as a separate
command from the `gh pr create`.

If the budget runs out mid-effort, that is a designed outcome, not a failure. `PLAN.md`
and `PROGRESS.md` are the deliverable that makes the rest cheap to finish later.
