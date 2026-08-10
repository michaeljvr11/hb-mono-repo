---
description: Take a Trello card through the full pipeline — context → plan → clarify → implement → test → review → PR. Stops before merge; a human owns prod.
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

3. CLARIFY — the interactive boundary before any code gets written
   - Check the plan against the CONTEXT MANIFEST and the card's acceptance criteria for genuine
     ambiguity: an acceptance criterion that admits more than one reasonable implementation, a
     business rule the Obsidian search didn't actually resolve, a contract shape the card leaves
     underspecified, or a scope edge (what happens on X error, does this apply to vendor listings
     too, etc.) the card doesn't address.
   - If everything needed to implement is already settled, skip this step silently — do not
     manufacture questions to seem thorough, and do not re-ask something CONTEXT already answered.
   - If something is genuinely unclear: **stop here.** Do not guess and quietly note the guess as
     an assumption, and do not carry it into IMPLEMENT hoping it comes out right. Ask the developer
     directly — `AskUserQuestion` for a short closed set of concrete resolutions, plain text when
     the answer is open-ended. Ask only what's actually blocking implementation; if several things
     are unclear, batch them into one turn rather than trickling questions out one at a time. Wait
     for the answer, fold it into the plan and the card comment, then continue to IMPLEMENT.

4. IMPLEMENT (dispatch specialists, in dependency order — work in a loop, one slice at a time)
   The Obsidian vault and this project are both git repos shared via git. For each slice of
   work, run the same loop and don't move on until it closes:
   - PULL: `git pull` the latest changes for BOTH repos first — the Obsidian vault repo and
     this project repo — so you build on current state. **Only if the vault pull actually
     brought new commits** (git reports something other than "Already up to date"), re-read
     the relevant Obsidian note(s) to catch any business-rule / spec / decision changes made
     since CONTEXT — skip the re-read on a no-op pull, there's nothing new to catch. If the
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

5. TEST
   - test-engineer writes/updates tests for whatever layer(s) the CONTEXT MANIFEST says
     this card touched.
   - Run only what those layers need — CI (`.github/workflows/ci.yml`) already re-runs
     `lint:api` + `test:api` + the full build as the PR gate, and its web-tests job is
     informational-only, so local runs exist to catch breaks before pushing, not to
     duplicate CI on every layer regardless of relevance:
     - `apps/api` or `libs/shared` touched → `npm run lint:api` && `npm run test:api`.
     - `apps/web` touched → `npm run test -w @hb/web`.
     - Always `npm run build` (shared → api → web) — the one cheap check that catches a
       cross-package contract break before it reaches CI.
   - Fix failures before proceeding.

6. REVIEW
   - Run code-reviewer on the diff. Address every FAIL. Re-run affected tests.

7. DELIVER
   - Commit any remaining changes (Conventional Commits). End every commit body with the
     AI-authorship trailer `Co-Authored-By: Claude <noreply@anthropic.com>` — this is the
     auditable record of AI authorship (see `docs/ai-evidence/`). The per-slice code commits
     from step 3 should already be in place. Push the feature branch.
   - EVIDENCE: run `npm run evidence` to recompile `docs/ai-evidence/REPORT.md` **before**
     dispatching docs-writer — its figures feed directly into the DOCUMENT step below, so
     compiling it first means docs-writer only needs to boot once for this card, not twice.
   - DOCUMENT (once, here — not per slice): dispatch docs-writer a single time with the
     CONTEXT MANIFEST, your accumulated slice notes, and the freshly compiled evidence
     figures. In one pass it (a) appends Implementation Notes covering the whole card to
     the relevant Obsidian spec note, (b) records the session in the vault's History
     folder, and (c) refreshes the headline figures in the Obsidian note
     **AI Factory — Evidence Log**. Session logs live at `History/<Name>/session-<n>.md`,
     where `<Name>` is the operator — `Josh` or `Michael`, matched to the local git user —
     and `<n>` increments from the highest existing `session-*.md` in that folder. **Keep
     this log terse** (docs-writer's short template — ~10-15 lines, no rationale essays);
     the detailed decisions belong in the spec note's Implementation Notes, not here.
   - COMMIT DOCS: after docs-writer completes, commit the spec-note updates, the session
     log, AND the evidence-log refresh together in **one** commit to the Obsidian vault
     repo (same AI-authorship trailer). **The vault always commits straight to `main` and
     pushes** — it's a shared knowledge base we keep fresh, so no feature branches or PRs
     for the vault (unlike this project, where code goes through a branch + PR and a human
     owns the merge to `main`).
   - Open a PR using the template — link the Trello card and the Obsidian note.
   - Comment the PR link on the card. **Always use Node.js `url.searchParams.set('text', ...)`
     to post the comment** — never `curl --data-urlencode`, which puts text in the form body
     and causes Trello to store raw URL-encoded strings like `%2A%2A` instead of `**`.
     See the trello-mcp-rest-fallback memory for the exact Node.js snippet.
     Then move the card to "In Review".
   - STOP. Do not merge. A human owns prod.
