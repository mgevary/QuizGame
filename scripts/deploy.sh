#!/bin/sh
# deploy.sh — commit, stamp the service-worker cache version with the commit
# hash, and push to GitHub Pages.
#
# The repo IS the site, so there is nothing to build. The only step that
# matters is the version stamp: without it, browsers would keep serving the
# previous cache forever. The rewrite is idempotent — it replaces whatever the
# VERSION line currently says, so it works on every deploy, not just the first.
set -e
cd "$(dirname "$0")/.."

if [ ! -d .git ]; then
  echo "not a git repo — run 'git init' first" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

git add -A
if git diff --cached --quiet && [ -n "$(git rev-parse --verify HEAD 2>/dev/null)" ]; then
  echo "nothing to deploy"
  exit 0
fi

git commit -q -m "${1:-deploy}"

# Stamp with the hash of the commit we just made, then fold the stamp into it
# so the deployed tree and its version always agree.
V="$(git rev-parse --short HEAD)"
sed -i.bak -E "s/^var VERSION = '.*';/var VERSION = '$V';/" sw.js
rm -f sw.js.bak

if ! grep -q "var VERSION = '$V';" sw.js; then
  echo "failed to stamp sw.js" >&2
  exit 1
fi

git add sw.js
git commit -q --amend --no-edit

git push -u origin "$BRANCH"
echo "deployed $V to $BRANCH"
