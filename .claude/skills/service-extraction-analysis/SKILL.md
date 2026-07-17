---
name: service-extraction-analysis
description: >
  Analyze the monorepo for candidate services worth extracting out of
  apps/api / apps/web into their own deployable units, based on git churn,
  cross-module coupling, and module size/growth — not a hunch. Use when the
  user asks "what could we split out of the monorepo", "service extraction
  analysis", "microservice candidates", or wants a data-backed input to a
  future decomposition decision. Report-only — produces ranked candidates
  with rationale for a human to weigh, does not restructure anything.
---

# service-extraction-analysis

The monorepo is the right shape today (per `README.md` / `CLAUDE.md`). This skill doesn't
argue otherwise — it produces the analytics a future "should we split X out" conversation
would need, so that decision is made from data (churn, coupling, blast radius) rather than
gut feel. It never moves code.

## 1. Define module boundaries

Enumerate the natural module boundaries to score:
- `apps/api/src/<module>` — one row per NestJS module directory (check `*.module.ts` files
  to confirm the boundary, not just the directory name).
- `apps/web/src/app/<feature>` — one row per top-level Angular feature area.

Skip cross-cutting infra (`common/`, `config/`, `shared/` wrappers) — those aren't
extraction candidates, they're the glue.

## 2. Score each module

For each module, gather:

- **Churn** — `git log --all --no-merges --numstat -- <path>` since repo start: commit
  count, lines changed, distinct authors. High + isolated churn = a module evolving on its
  own cadence, a good extraction signal.
- **Coupling** — grep for cross-module imports both directions: how many other modules
  import from this one, and how many does it import from. Low inbound coupling from
  unrelated modules = cleaner extraction boundary. High bidirectional coupling = not ready,
  say so.
- **Size** — file count + LOC (`git ls-files -- <path> | xargs wc -l` equivalent, excluding
  generated files per the same `GENERATED` pattern `docs/ai-evidence/generate.mjs` uses).
- **Shared-contract surface** — how much of `libs/shared` this module's DTOs/interfaces
  touch. A module with a small, clean shared-contract slice extracts more easily than one
  entangled across many shared interfaces.
- **Test isolation** — does the module have its own `*.spec.ts` files that don't reach into
  other modules' internals? Poor isolation is a cost to flag, not a blocker.

## 3. Rank and write candidates

Score qualitatively (`strong` / `moderate` / `weak` candidate) — do not fabricate a
precision-weighted formula from noisy inputs. Justify each ranking in one or two sentences
referencing the actual numbers gathered.

Write to `docs/ai-evidence/extraction-candidates.json`:

```json
{
  "generatedAt": "<ISO timestamp>",
  "candidates": [
    {
      "module": "apps/api/src/search",
      "rank": "strong",
      "commits": 42,
      "authors": 2,
      "loc": 1800,
      "inboundCoupling": 1,
      "outboundCoupling": 3,
      "rationale": "..."
    }
  ]
}
```

This file is a data source for the AI Factory Evidence Dashboard — `npm run evidence`
picks it up automatically (degrades gracefully if absent) and renders an "Extraction
candidates" section in `REPORT.md` / `dashboard.html`.

## 4. Report to the user

Lead with the top 2-3 candidates and why, then note this is an input to a future decision,
not a recommendation to act now — extraction has real operational cost (deploy pipeline,
data ownership, network boundary) that this analysis doesn't attempt to price.
