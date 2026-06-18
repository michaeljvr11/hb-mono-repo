# Design sync — multi-device collaboration

The HB design system is maintained from **multiple devices/accounts** (currently Josh +
Michael) and pushed to **claude.ai/design**. A claude.ai/design project is owned **per
account**, so there is no single shared project: each dev syncs the *same* local bundle
(`docs/design/claude-design/`) to **their own** project. Every such project has the identical
name **"HB — Trans-Frontier Commerce System"** and type `PROJECT_TYPE_DESIGN_SYSTEM`.

**Therefore a project's UUID is per-device and must never be shared in git** — exactly like
`.env` (committed template `.env.example`, real values stay local).

## `.design-sync/` file layout
| File | Tracked? | Purpose |
|---|---|---|
| `config.example.json` | committed | The shared contract: `projectName` + `localDir`. No UUID. |
| `config.json` | **git-ignored, per-device** | Your device's resolved config, including *your* `projectId`. |
| `NOTES.md` | committed | This file. |

## First sync on a device (no local `config.json` yet)
1. Copy the template — `cp .design-sync/config.example.json .design-sync/config.json`.
2. Resolve **your** project id by name — `DesignSync list_projects`, find the project named
   **"HB — Trans-Frontier Commerce System"** that *you own*, and write its id into `projectId`.
   - If no such project exists for your account, create it once
     (`DesignSync create_project name="HB — Trans-Frontier Commerce System"`) and use that id.
   - **Never** create a second project with that name, and **never** create a fresh project
     just because the committed example has an empty `projectId`.
3. Sync normally with `/design-sync`. Your `projectId` stays local (git-ignored) forever.

## A 404 on a `projectId` is expected, not a problem
If `DesignSync get_project` returns HTTP 404 for an id, that id belongs to a **different
account/device**. Resolve your own by name (step 2). Do **not** create a duplicate, assume the
bundle was lost, or "fix" it by committing a repointed UUID — the bundle in
`docs/design/claude-design/` is the single source of truth; the per-account projects are just
render targets for it.

## Known project ids (reference only — never paste into committed files)
| Owner | projectId |
|---|---|
| Josh ("The Space Pirate") | `6e8a5c5d-c00c-434a-8610-29942eceed29` |
| Michael | `79b1b10c-28fd-496f-9956-6f71670c11d1` |
