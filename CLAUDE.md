# HB Monorepo — Agent Operating Manual

## Mission
Cross-border e-commerce & logistics platform (South Africa → Namibia). Two business
models in one codebase: platform-fulfilled listings and a vendor marketplace.
Optimize for clean vertical slices, strong typing across the API/UI boundary via
`@hb/shared`, and test coverage on money/inventory/order logic.

Architecture details and key decisions: see `README.md` (current truth).

## Source of truth
- **Business rules & domain model:** Obsidian vault (use `obsidian` MCP tools).
- **Designs & tokens:** Claude Design (claude.ai/design) is the source of truth. The design system lives in the `docs/design/claude-design/` sync bundle and pushes up via the `DesignSync` tool (use the `/design-sync` skill). `docs/design/DESIGN.md` holds the canonical tokens; `docs/design/<screen>/` holds the saved HTML export + screenshot for traceability. (Migrated off Stitch on 2026-06-18; the `stitch` MCP is retained only as a legacy export source — do not treat it as live truth.)
- **Work items:** Trello board (use `trello` MCP tools).
- **API contract:** `libs/shared` (`@hb/shared`) — interfaces + enums only.

## Layout
- `apps/api` — NestJS 11 + TypeORM + Postgres (see `apps/api/CLAUDE.md`)
- `apps/web` — Angular 21 SSR + Material (see `apps/web/CLAUDE.md`)
- `libs/shared` — pure TS contracts; API DTO classes `implement` these interfaces

## Commands (run from repo root)
- `npm run build` — shared → api → web
- `npm run dev:api` / `npm run dev:web`
- `npm run test:api` / `npm run test -w @hb/web`
- `npm run lint:api`
- `npm run db:up` then `npm run migration:run`
- `sh .claude/hooks/install-merge-drivers.sh` — **run once after every fresh clone** to install
  the post-merge git hook (auto-regenerates `docs/ai-evidence/` after any `git merge`/`git pull`)

## Non-negotiables
- Shared types live in `libs/shared`; API and web both import from it. **Never duplicate DTOs.**
- Every endpoint input is a DTO validated with class-validator, implementing the shared interface.
- Every service method touching money, inventory, or order state gets a unit test in the same PR.
- Schema changes go through TypeORM migrations. `synchronize` stays off. Always.
- Money: `numeric(12,2)` + explicit currency column. ZAR/NAD peg is data, never an assumption.
- Conventional Commits. One card == one branch == one PR. Branch: `feat/<card-id>-<slug>`.
- **Every AI-produced commit ends with `Co-Authored-By: Claude <noreply@anthropic.com>`** — the
  auditable record of AI authorship. The guardrail hooks log to `.claude/factory-log.jsonl`
  automatically; run `npm run evidence` to recompile `docs/ai-evidence/REPORT.md`.
- **NEVER merge to `main`. Open the PR and stop. A human owns prod.** (Enforced by hooks.)
- Never read or print `.env` files. Use `.env.example` as the reference.

## The golden path
`/spec-feature <request>` — front of the funnel: research business rules → write the Obsidian
spec → create well-formed Trello cards with acceptance criteria (no code). Then:
`/ship-card <card-id>` — pull card → gather context (Obsidian + design) → plan →
implement → test → review → open PR → move card to "In Review". See `.claude/commands/`.

Evidence of AI use compiles automatically (hooks log to `.claude/factory-log.jsonl`); run
`npm run evidence` for the report (`docs/ai-evidence/`), and see `docs/ai-evidence/PITCH.md`
for the judge-facing summary.

## Orchestration modes
- Single card, one layer → single session or one subagent.
- Repeatable roles → subagents in `.claude/agents/`.
- Dependent API + UI + tests work → Agent Team (lead coordinates, teammates own separate files).
- Don't fan out five agents for a one-line change.
