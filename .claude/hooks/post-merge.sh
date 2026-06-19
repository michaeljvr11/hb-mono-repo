#!/usr/bin/env sh
# Regenerate AI evidence after any local merge so that union-merged files
# reflect the complete, combined factory-log from both branches.
ROOT="$(git rev-parse --show-toplevel)"
echo "[post-merge] Regenerating AI evidence report..."
npm run evidence --prefix "$ROOT" 2>&1 || true
echo "[post-merge] Done. Stage and commit docs/ai-evidence/ if the report changed."
