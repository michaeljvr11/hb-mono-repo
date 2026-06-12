# HB Monorepo — Agent Operating Manual

## Mission
Cross-border e-commerce & logistics platform (South Africa → Namibia). Two business
models in one codebase: platform-fulfilled listings and a vendor marketplace.
Optimize for clean vertical slices, strong typing across the API/UI boundary via
`@hb/shared`, and test coverage on money/inventory/order logic.

Architecture details and key decisions: see `README.md` (current truth).

## Source of truth
- **Business rules & domain model:** Obsidian vault (use `obsidian` MCP tools).
- **Designs & tokens:** `docs/design/DESIGN.md` + `docs/design/<screen>/`.
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

## Non-negotiables
- Shared types live in `libs/shared`; API and web both import from it. **Never duplicate DTOs.**
- Every endpoint input is a DTO validated with class-validator, implementing the shared interface.
- Every service method touching money, inventory, or order state gets a unit test in the same PR.
- Schema changes go through TypeORM migrations. `synchronize` stays off. Always.
- Money: `numeric(12,2)` + explicit currency column. ZAR/NAD peg is data, never an assumption.
- Conventional Commits. One card == one branch == one PR. Branch: `feat/<card-id>-<slug>`.
- **NEVER merge to `main`. Open the PR and stop. A human owns prod.** (Enforced by hooks.)
- Never read or print `.env` files. Use `.env.example` as the reference.

## The golden path
`/ship-card <card-id>` — pull card → gather context (Obsidian + design) → plan →
implement → test → review → open PR → move card to "In Review". See `.claude/commands/ship-card.md`.

## Orchestration modes
- Single card, one layer → single session or one subagent.
- Repeatable roles → subagents in `.claude/agents/`.
- Dependent API + UI + tests work → Agent Team (lead coordinates, teammates own separate files).
- Don't fan out five agents for a one-line change.
