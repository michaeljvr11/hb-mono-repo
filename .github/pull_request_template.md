## Summary

<!-- One paragraph: what changed and why. -->

## Traceability

- **Trello card:** <!-- link (required) -->
- **Obsidian spec/decision:** <!-- note name or link (required for feature work) -->
- **Design:** <!-- docs/design/<screen>/ if UI work -->

## Checklist

- [ ] `npm run test:api` green
- [ ] `npm run test -w @hb/web` green (if web touched)
- [ ] `npm run lint:api` clean
- [ ] `npm run build` passes (shared → api → web)
- [ ] Contract changes made in `libs/shared` — no duplicated DTOs
- [ ] Schema changes have a reviewed migration
- [ ] Money/inventory/order-state logic has unit tests
- [ ] UI follows `docs/design/DESIGN.md` tokens; SSR-safe (no unguarded browser APIs)

## Authorship

- [ ] AI-authored (orchestrated via `/ship-card`)
- [ ] Human-authored
- [ ] Mixed

> ⚠️ Merging to `main` is a **human-only** action. Agents open PRs and stop.
