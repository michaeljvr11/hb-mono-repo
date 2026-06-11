# Development Workflow

Recommended workflow for future Codex tasks in this repo:

1. Inspect the relevant project folder before editing.
2. Read the nearest `AGENTS.md`.
3. Check the related docs in `docs/`.
4. If the change is large or cross-project, draft a plan using `PLANS.md`.
5. Implement small, focused changes.
6. Run available checks that fit the touched project.
7. Update docs if architecture, APIs, DTOs, models, or business rules changed.
8. Summarize what changed, what was verified, and any remaining risks.

## Project Selection Guide

- Use `hb-landing` for business wording, contact flow, and theme/brand direction.
- Use `hb-backend` for current API truth, domain logic, DTOs, entities, and auth rules.
- Use `hb-frontend` for Angular implementation details, services, routing, and UI work.

## Change Philosophy

- Inspect first, then edit.
- Prefer compatibility over refactors.
- Keep frontend/backend contracts synchronized.
- Mark unclear areas as `Needs verification` instead of guessing.
