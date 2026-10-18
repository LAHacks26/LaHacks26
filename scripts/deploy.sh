#!/usr/bin/env bash
# Pull, build and restart Saffron on the Vultr VM. Runs ON the server as the saffron user.
# From the laptop:  ssh saffron 'sudo -iu saffron bash app/scripts/deploy.sh [branch]'
# The build needs dev dependencies (Tailwind, shadcn CSS), so this is a full npm ci.
set -euo pipefail

BRANCH="${1:-main}"
cd "$HOME/app"

# next build wipes .next first, so a failed build leaves the running site degraded until a good deploy.
PREV=$(git rev-parse --short HEAD)
trap 'echo "DEPLOY FAILED. Site may be degraded. Roll back: git reset --hard $PREV && bash scripts/deploy.sh $BRANCH"' ERR

git fetch --quiet origin
git checkout --quiet -B "$BRANCH" "origin/$BRANCH"

npm ci --no-audit --no-fund
npm run build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
echo "Deployed $(git rev-parse --short HEAD) from $BRANCH"
