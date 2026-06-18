# Claude Design sync bundle

This directory is the **upload artifact** for the project's Claude Design
(claude.ai/design) design system. It was migrated from the Stitch project
*"Remix of Product Discovery – H&B Marketplace"* (`18341348034117446938`) on 2026-06-18.

**Live project:** `79b1b10c-28fd-496f-9956-6f71670c11d1`  
Direct link: https://claude.ai/design (open the "HB — Trans-Frontier Commerce System" project)

## Layout

```
claude-design/
├── DESIGN.md                  ← design-system doc pushed to the project
├── foundations/
│   ├── colors.html            ← @dsCard "Color palette"
│   └── typography.html        ← @dsCard "Type scale"
└── screens/<slug>/index.html  ← one @dsCard per screen (7 total)
```

Each preview file's **first line** is an `@dsCard` marker:

```html
<!-- @dsCard group="Screens" name="Storefront" -->
```

The Claude Design app compiles these markers into `_ds_manifest.json` on upload — that is
what populates the Design System pane, so the marker must stay on line 1 (no BOM, no blank
line before it). The screen cards are verbatim Stitch HTML exports with the marker prepended;
the raw exports also live at `docs/design/<slug>/export.html` + `reference.png` for the
`design-to-code` agent.

## Regenerating the screen cards

If a screen's `docs/design/<slug>/export.html` changes, rebuild its card by re-prepending
the marker (PowerShell):

```powershell
$enc = New-Object System.Text.UTF8Encoding($false)
$slug = 'storefront'; $name = 'Storefront'
$src = "docs/design/$slug/export.html"
$dst = "docs/design/claude-design/screens/$slug/index.html"
$raw = [System.IO.File]::ReadAllText((Resolve-Path $src))
[System.IO.File]::WriteAllText($dst, "<!-- @dsCard group=`"Screens`" name=`"$name`" -->`n" + $raw, $enc)
```

## Pushing to Claude Design

The push uses the `DesignSync` tool (and the `/design-sync` skill if installed). It requires
an interactive **claude.ai login** — a `CLAUDE_CODE_OAUTH_TOKEN` session cannot be granted
design scopes, so run `/login` first.

Manual push flow (what the agent runs once logged in):

1. `DesignSync get_project` — verify `projectId: 79b1b10c-28fd-496f-9956-6f71670c11d1` is
   still reachable (type must be `PROJECT_TYPE_DESIGN_SYSTEM`).
2. `DesignSync finalize_plan` — `projectId: 79b1b10c-28fd-496f-9956-6f71670c11d1`,
   `localDir: docs/design/claude-design`,
   `writes: ["DESIGN.md", "foundations/**/*.html", "screens/**/*.html"]`.
3. `DesignSync write_files` with the returned `planId` (uploads read from disk; contents
   never enter the model context).

Sync is incremental and one component at a time — never a wholesale replace.
