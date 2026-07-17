---
description: Front-of-funnel planning. Turn a feature request into an Obsidian spec note + well-formed Trello cards with acceptance criteria. Feeds /ship-card. Does not write code.
---
Turn the feature request "$ARGUMENTS" into implementable requirements. Dispatch the
`product-planner` agent (or do this directly for a small request). Stop before coding —
`/ship-card` owns implementation.

0. PULL — before doing anything else, `git pull` both repos: this project and the Obsidian
   vault. Specs get written against stale state easily since this command runs less often
   than `/ship-card` and has no built-in refresh point. Then check `origin/main` (`git log
   origin/main --oneline -20` or similar) and the vault for work that already covers this
   request under a different card or branch — Michael ships in parallel, so a request that
   sounds new may already be merged or mid-flight. If it is, say so and scope down to the
   real gap instead of speccing duplicate work.

1. RESEARCH — search the Obsidian vault (`obsidian` tools) for the business rules, domain
   model, and decisions this feature touches. Read `libs/shared` + `README.md` for the
   current contract. Note conflicts or gaps; do not invent rules.

2. SPECIFY — write or update an Obsidian note for the feature: problem, scope, the business
   rules it must honour, `@hb/shared` contract impact, out-of-scope, and open questions.
   Link related notes with `[[wikilinks]]`.

3. SLICE → CARDS — break it into thin vertical slices and create one Trello card per slice
   in the **"To Do"** list (`trello` tools). Each card needs a clear title, a description
   linking the Obsidian note, and an **acceptance-criteria checklist**. Honour the
   non-negotiables: money/inventory/order logic ⇒ a test; schema change ⇒ a migration;
   every endpoint ⇒ a validated DTO implementing the shared interface.

4. HANDOFF — summarise: the note written, the card ids created, and any decision a human
   should confirm. These cards are now the ready queue `/ship-card <card-id>` pulls from.

Do not write application code or open branches/PRs here. Planning only.
