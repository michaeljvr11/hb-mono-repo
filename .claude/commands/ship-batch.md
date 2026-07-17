---
description: >
  Take multiple Trello cards through the full AI-factory pipeline in one run —
  context → plan → clarify → implement (parallel or sequential) → test → review → PR.
  For large, well-specified work, offload implementation to Claude Fable 5.
  Stops before merge; a human owns prod.
---
Ship Trello cards $ARGUMENTS (space- or comma-separated card ids, or a single
card id for a one-shot large build) through the full pipeline as **one bundled
branch and PR**. This is the multi-card / large-build sibling of `/ship-card` —
same golden-path stages, same non-negotiables, same guardrails. Use it when:

- Several cards are one tightly-coupled feature and splitting them would create
  integration seams (the established precedent in this repo: PRs #26, #27, #28
  each bundled 2–4 cards — cart+orders+checkout+verification, storefront+search,
  etc.). Card-bundling across cards is an owner-approved exception to the
  one-card-one-branch rule in `CLAUDE.md` — this command IS that approval
  mechanism, so state the bundling reason in the PR body same as those did.
- A single card is large enough to warrant an autonomous, long-horizon build
  (a full CRUD module, a new subsystem) where offloading to Claude Fable 5 is
  worth its cost and latency.

If a card is small and self-contained, use `/ship-card` instead — don't reach
for this command for a one-line change.

1. CONTEXT
   - Read every card (title, description, checklist, attachments, comments) via
     `trello` tools. Cards live on board "H&B E-commerce"; ready queue is "To Do".
   - Search the Obsidian vault for the business rules / spec / decision notes
     each card touches. If cards share a spec note, that's a signal they belong
     in one PR — the vertical-slice-in-one-PR pattern only works when the
     integration points are already documented as related.
   - If any card is UI work, read `docs/design/<screen>/` and `docs/design/DESIGN.md`.
   - Build a **CONTEXT MANIFEST per card** (same as `/ship-card`) plus a
     **cross-card manifest**: the shared `@hb/shared` contracts every card
     touches, and where their integration points are (e.g. "cart shape must
     agree with order-item shape must agree with checkout UI"). Pass both into
     every specialist prompt.

2. PLAN — decide the shape before writing code
   - **Bundling justification**: write one sentence per card on why it's in this
     batch (tightly coupled feature / one-shot large scope). This becomes the
     PR's bundling note.
   - **Mode decision — parallel vs sequential**, per card or per slice:
     - **Sequential** (default — matches this repo's established pattern):
       cards/slices share files, a data model, or an integration seam. Work
       through them one at a time in dependency order, each its own commit.
       Use this whenever slices touch the same `@hb/shared` contract or the
       same NestJS module — parallel edits there just produce merge conflicts
       you resolve serially anyway.
     - **Parallel**: cards are genuinely independent (disjoint files, no shared
       contract change, e.g. one card is an admin screen and another is an
       unrelated public API endpoint). Dispatch specialists for each in the
       same message so their tool calls run concurrently (Agent Team mode per
       `CLAUDE.md` → Orchestration modes) — each teammate owns its own files,
       lead reconciles. Still lands on the **same branch and PR** unless the
       user explicitly asked for separate PRs; don't create parallel git
       worktrees/branches for this unless the cards are large enough that
       merge risk from true concurrent branch work is worth the coordination
       overhead — ask the user first if unsure.
     - A batch can mix both: sequential where coupled, parallel where not.
   - **Offloading to Claude Fable 5**: for a single large, well-specified,
     long-horizon build (not a handful of small coupled cards), consider
     dispatching the implementation via the `Agent` tool with
     `model: "fable"` instead of the default specialist agents. Fable 5 is
     tuned for exactly this — large autonomous builds with the full task
     spec given up front, at `effort: high` or `xhigh` equivalent. Trade-offs
     to weigh before choosing it: individual turns can run many minutes,
     pricing is above Opus-tier, and it needs the *entire* task specified in
     one prompt rather than incremental steering — write the CONTEXT MANIFEST
     and every acceptance criterion into that one dispatch, since you won't
     be there to correct course mid-run the way you would with a lighter
     agent. Default to the normal `backend-engineer` / `frontend-engineer`
     agents (sonnet) for anything that isn't genuinely large — offloading to
     Fable isn't free and isn't the default.
   - Write the plan (bundling note + mode decision) as a comment on **every**
     card in the batch — so each card's history shows it shipped as part of
     this batch, same as the shared-branch exception note in prior PRs. Move
     every card to "In Progress". Create branch `feat/<primary-card-id>-<slug>`
     from up-to-date main (primary = the first/most-significant card id).

3. CLARIFY — the interactive boundary before any code gets written
   - Check the plan against every card's CONTEXT MANIFEST and acceptance criteria, **and** against
     the batch-level decisions from PLAN: is the bundling justification actually solid for every
     card, is the parallel-vs-sequential split defensible, is a Fable-5 offload decision resting on
     a task spec that's actually complete? Look for the same per-card ambiguity `/ship-card` checks
     for (acceptance criteria with more than one reasonable reading, an unresolved business rule, an
     underspecified contract shape), plus batch-specific ambiguity: do two cards imply conflicting
     shapes for the same shared contract, does the mode decision hinge on a coupling assumption that
     isn't actually confirmed, is the "large enough for Fable" call actually justified.
   - If everything needed to implement the whole batch is already settled, skip this step silently
     — don't manufacture questions to seem thorough.
   - If something is genuinely unclear on any card or at the batch level: **stop here.** Do not
     guess and quietly note it as an assumption, and do not carry an unresolved conflict into
     IMPLEMENT hoping the slices reconcile themselves. Ask the developer directly —
     `AskUserQuestion` for a short closed set of concrete resolutions, plain text for open-ended
     answers. Batch every open question from every card into one turn rather than trickling them
     out card by card. Wait for the answer, fold it into the plan and every affected card's comment,
     then continue to IMPLEMENT.

4. IMPLEMENT — same PULL-then-build loop as `/ship-card`, extended for the batch
   For each slice of work (a slice may span multiple cards or be one card broken
   into vertical slices — one commit per slice either way):
   - PULL: `git pull` this project and the Obsidian vault before every slice —
     re-read the relevant note(s), adjust plan/card comments if anything moved
     since PLAN.
   - BUILD: dispatch per the mode decided in step 2 —
     - Sequential slice → one specialist (`backend-engineer` / `frontend-engineer`
       / `design-to-code`), same as `/ship-card`, or an `Agent` call with
       `model: "fable"` if this slice is the large offloaded build.
     - Parallel slices → multiple `Agent` calls in the **same message** so they
       run concurrently, each with its own CONTEXT MANIFEST scoped to its own
       files; do not let two parallel dispatches touch the same file.
   - COMMIT CODE: commit the slice (Conventional Commits), body ending with
     `Co-Authored-By: Claude <noreply@anthropic.com>`.
   - NOTE THE SLICE: bullets for yourself — what changed, key decisions,
     follow-ups, which card(s) it closes. Accumulate; docs-writer runs once at
     DELIVER, not per slice.
   Then start the next slice from PULL again.

5. TEST
   - test-engineer writes/updates tests for the whole batch.
   - Run: `npm run test:api`, `npm run test -w @hb/web`, `npm run lint:api`,
     `npm run build`. Fix failures before proceeding.

6. REVIEW
   - Run code-reviewer on the full diff. Address every FAIL. Re-run affected
     tests. A bundled diff is bigger than a single-card diff — expect the
     reviewer to need the cross-card manifest from step 1 to judge integration
     points correctly; pass it in.

7. DELIVER
   - Commit any remaining changes, same AI-authorship trailer as step 3.
   - DOCUMENT (once): dispatch docs-writer with the CONTEXT MANIFEST(s) plus
     accumulated slice notes for the whole batch. It appends Implementation
     Notes to every Obsidian spec note touched and records one session log
     covering the whole batch (`History/<Name>/session-<n>.md`).
   - COMMIT DOCS: commit spec-note updates + session log straight to the vault's
     `main` (no branch/PR there — see `/ship-card`).
   - Open **one PR** for the whole batch using the template. Title and body
     name every card bundled in, state the bundling reason from step 2, and
     link every Trello card + every Obsidian note touched — mirror the
     "One-time bundling" framing from PRs #26/#27/#28 so the exception to
     one-card-one-branch is self-documenting in the PR itself.
   - Comment the PR link on **every** card in the batch (Node.js
     `url.searchParams.set('text', ...)`, never `curl --data-urlencode` — see
     the trello-mcp-rest-fallback memory). Move every card to "In Review".
   - EVIDENCE: run `npm run evidence` to recompile `docs/ai-evidence/REPORT.md`
     — the generator already traces `feat/<card-id>-<slug>` branches to PRs, so
     the batch's primary card shows up there; note in the PR body which other
     card ids are bundled in, since the generator only traces the primary.
     Have docs-writer refresh the headline figures in the Obsidian
     **AI Factory — Evidence Log** note.
   - STOP. Do not merge. A human owns prod.
