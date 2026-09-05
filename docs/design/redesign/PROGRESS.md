# PROGRESS — HB Storefront Overhaul

> **This file is the truth.** On session start: find the first phase not `DONE`, read its
> "Next action", continue from exactly there. Do not re-research, re-plan or re-audit.
> Branch: `feat/storefront-visual-overhaul`. Never merge to `main`.

| Phase | Status |
|---|---|
| 0 Orient, research, plan | DONE |
| 1 Token foundation | TODO |
| 2 Desktop nav + shell | TODO |
| 3 Storefront + product card | TODO |
| 4 Trust, states, perceived performance | TODO |
| 5 PDP, cart, checkout | TODO |
| 6 Follow-up cards | TODO (kept current in `PLAN.md` §5 as phases run) |

---

## Phase 0 — Orient, research, plan — DONE
- **Files:** `docs/design/redesign/{RESEARCH.md,PLAN.md,PROGRESS.md}`
- **Commit:** first commit on `feat/storefront-visual-overhaul` (`docs(redesign): …`); SHA
  recorded at the top of the Phase 1 entry when that phase starts.
- **Decisions not obvious from the diff:**
  - Design thesis is **The Corridor** (PLAN §1). Orange is reserved for buyer-helpful
    attention only; the spring easing is the single expressive curve.
  - Dark theme ships in Phase 1 as `[data-theme="dark"]` opt-in; `prefers-color-scheme`
    auto-activation is deferred to the end of Phase 4 (PLAN §2.1).
  - Header nav is a visible category bar + flyout, not a hover mega-menu (PLAN Phase 2).
  - Product-grid skeletons pulled forward into Phase 3.
  - Research budget: 13 lookups used; RESEARCH.md is complete, do not add lookups.
- **Environment notes:** `obsidian` MCP was down this session (not needed for this effort).
  Preview configs exist in `.claude/launch.json` (`web (Angular SSR dev server)` :4200,
  `api (NestJS, watch mode)` :3000). Bash heredocs with `<<'EOF'` failed under this shell;
  use the Write tool for multi-line files.
- **Next action:** Phase 1. Start by `sed -n '1,60p' apps/web/src/styles.scss` to see the
  current `:root`, then implement the token set exactly as PLAN Phase 1 lists it.

## Phase 1 — Token foundation — TODO
- **Next action:** see Phase 0 → Next action.

## Phase 2 — Desktop nav + shell — TODO
- **Next action:** before designing the flyout, hit `GET /categories` on the running API to
  see whether any category has a `parentId`; then follow PLAN Phase 2.

## Phase 3 — Storefront + product card — TODO
- **Next action:** check `VendorDto` for a verified flag and `images.length` on seed data,
  then follow PLAN Phase 3.

## Phase 4 — Trust, states, perceived performance — TODO
- **Next action:** `grep -rl hourglass_top apps/web/src --include=*.html` for the remaining
  templates; follow PLAN Phase 4.

## Phase 5 — PDP, cart, checkout — TODO
- **Next action:** follow PLAN Phase 5.

## Phase 6 — Follow-up cards — TODO
- **Next action:** review PLAN §5, add anything exposed in Phases 1–5, and (if Trello MCP is
  up) create the cards on the board; record card IDs here.
