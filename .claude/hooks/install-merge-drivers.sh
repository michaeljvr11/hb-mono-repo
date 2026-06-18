#!/usr/bin/env sh
# Run once per clone to wire up the git merge drivers declared in .gitattributes.
#
# evidence-regen: always keeps our version during merge (exit 0 = resolved).
# The post-merge hook then runs "npm run evidence" to produce the correct content.
git config merge.evidence-regen.name "AI evidence regeneration driver"
git config merge.evidence-regen.driver "true"
echo "Merge drivers installed."
