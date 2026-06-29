---
description: Take a Trello card through the full pipeline — context → plan → implement → test → review → PR. Stops before merge; a human owns prod.
---
Take Trello card $ARGUMENTS through the full pipeline. For dependent API+UI work run as
an Agent Team; for a single-layer card one subagent is enough — don't over-orchestrate.

1. CONTEXT
   - Read the card (title, description, checklist, attachments, comments) via `trello` tools.
     Cards live on board "H&B E-commerce"; the ready queue is the "To Do" list.
   - Search the Obsidian vault for the relevant business rules / spec / decision notes.
     Vault layout: spec/decision notes live at the root; per-operator session logs live under
     `History/Josh/` and `History/Michael/` as `session-<n>.md`.
   - If the card is UI work, read docs/design/<screen>/ and docs/design/DESIGN.md.
   - **Build a CONTEXT MANIFEST** — the exact paths you just located: the spec/decision note
     path(s), the relevant `@hb/shared` contract file(s), the design folder (if UI), and any
     source files the card clearly touches. **Pass this manifest verbatim into every specialist
     prompt** so they `Read` the named files directly instead of re-searching the vault and
     codebase from scratch.

2. PLAN
   - Write a short plan and post it as a comment on the card. Move the card to "In Progress".
   - Create branch `feat/<card-id>-<slug>` from up-to-date main.

3. IMPLEMENT (dispatch specialists, in dependency order — work in a loop, one slice at a time)
   The Obsidian vault and this project are both git repos shared via git. For each slice of
   work, run the same loop and don't move on until it closes:
   - PULL: `git pull` the latest changes for BOTH repos first — the Obsidian vault repo and
     this project repo — so you build on current state. Then re-read the relevant Obsidian
     note(s) to catch any business-rule / spec / decision changes made since CONTEXT. If the
     spec moved, adjust the plan (and the card comment) before writing code.
   - BUILD: backend-engineer for API + `libs/shared` contract changes, then
     frontend-engineer for UI, and/or design-to-code for new screens. Pass the CONTEXT
     MANIFEST into each specialist so they read named files instead of re-searching.
   - COMMIT CODE: commit the slice to this project's feature branch (Conventional Commits),
     ending the body with the AI-authorship trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
   - NOTE THE SLICE: jot a few bullets for yourself — what changed, key decisions, any
     follow-ups. These accumulate; docs-writer turns the whole set into spec notes + a session
     log **once**, at DELIVER. Do NOT dispatch docs-writer per slice — one cold agent boot per
     card, not per slice, is the saving here.
   Then start the next slice from PULL again.

4. TEST
   - test-engineer writes/updates tests.
   - Run: `npm run test:api`, `npm run test -w @hb/web`, `npm run lint:api`, `npm run build`.
   - Fix failures before proceeding.

5. REVIEW
   - Run code-reviewer on the diff. Address every FAIL. Re-run affected tests.

6. DELIVER
   - Commit any remaining changes (Conventional Commits). End every commit body with the
     AI-authorship trailer `Co-Authored-By: Claude <noreply@anthropic.com>` — this is the
     auditable record of AI authorship (see `docs/ai-evidence/`). The per-slice code commits
     from step 3 should already be in place. Push the feature branch.
   - DOCUMENT (once, here — not per slice): dispatch docs-writer a single time with the
     CONTEXT MANIFEST plus your accumulated slice notes. It (a) appends Implementation Notes
     covering the whole card to the relevant Obsidian spec note, and (b) records the session in
     the vault's History folder. Session logs live at `History/<Name>/session-<n>.md`, where
     `<Name>` is the operator — `Josh` or `Michael`, matched to the local git user — and `<n>`
     increments from the highest existing `session-*.md` in that folder. Capture: card worked,
     what changed, key decisions, test/review outcome, follow-ups.
   - COMMIT DOCS: after docs-writer completes, commit BOTH the spec-note updates and the
     session log to the Obsidian vault repo (same AI-authorship trailer). **The vault always
     commits straight to `main` and pushes** — it's a shared knowledge base we keep fresh, so
     no feature branches or PRs for the vault (unlike this project, where code goes through a
     branch + PR and a human owns the merge to `main`).
   - Open a PR using the template — link the Trello card and the Obsidian note.
   - Comment the PR link on the card. **Always use Node.js `url.searchParams.set('text', ...)`
     to post the comment** — never `curl --data-urlencode`, which puts text in the form body
     and causes Trello to store raw URL-encoded strings like `%2A%2A` instead of `**`.
     See the trello-mcp-rest-fallback memory for the exact Node.js snippet.
     Then move the card to "In Review".
   - EVIDENCE: run `npm run evidence` to recompile `docs/ai-evidence/REPORT.md`, and have
     docs-writer refresh the headline figures in the Obsidian note **AI Factory — Evidence Log**.
   - STOP. Do not merge. A human owns prod.
