---
description: Take a Trello card through the full pipeline — context → plan → implement → test → review → PR. Stops before merge; a human owns prod.
---
Take Trello card $ARGUMENTS through the full pipeline. For dependent API+UI work run as
an Agent Team; for a single-layer card one subagent is enough — don't over-orchestrate.

1. CONTEXT
   - Read the card (title, description, checklist, attachments, comments) via `trello` tools.
     Cards live on board "H&B E-commerce"; the ready queue is the "To Do" list.
   - Search the Obsidian vault for the relevant business rules / spec / decision notes.
   - If the card is UI work, read docs/design/<screen>/ and docs/design/DESIGN.md.

2. PLAN
   - Write a short plan and post it as a comment on the card. Move the card to "In Progress".
   - Create branch `feat/<card-id>-<slug>` from up-to-date main.

3. IMPLEMENT (dispatch specialists, in dependency order)
   - backend-engineer for API + `libs/shared` contract changes, then
   - frontend-engineer for UI, and/or design-to-code for new screens.

4. TEST
   - test-engineer writes/updates tests.
   - Run: `npm run test:api`, `npm run test -w @hb/web`, `npm run lint:api`, `npm run build`.
   - Fix failures before proceeding.

5. REVIEW
   - Run code-reviewer on the diff. Address every FAIL. Re-run affected tests.

6. DELIVER
   - Commit (Conventional Commits), push the feature branch.
   - Open a PR using the template — link the Trello card and the Obsidian note.
   - Comment the PR link on the card and move it to "In Review".
   - Dispatch docs-writer to append Implementation Notes to the Obsidian note.
   - STOP. Do not merge. A human owns prod.
