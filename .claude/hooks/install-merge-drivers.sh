#!/usr/bin/env sh
# Run once per clone to install the post-merge git hook.
# No custom merge drivers are needed — .gitattributes uses only the
# built-in "union" driver, which works without any local configuration.
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

copy_hook() {
  src="$SCRIPT_DIR/$1.sh"
  dst="$HOOKS_DIR/$1"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    chmod +x "$dst"
    echo "Installed git hook: $1"
  fi
}

copy_hook post-merge

echo "Done. Re-run this script after any fresh clone of this repo."
