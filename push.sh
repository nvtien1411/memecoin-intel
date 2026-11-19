#!/usr/bin/env bash
# Push Memecoin Intelligence Terminal to GitHub.
#
# Run this once. It opens a browser (or prints a code) so YOU authorize GitHub.
# No password or token ever passes through chat.
#
#   bash push.sh
#
set -euo pipefail

REPO_NAME="memecoin-intel"
export PATH="$PATH:/c/Program Files/GitHub CLI"

cd "$(dirname "$0")"

echo "==> 1/4  GitHub CLI"
if ! command -v gh >/dev/null 2>&1; then
  echo "gh not found. Install it first:"
  echo "  winget install --id GitHub.cli -e"
  exit 1
fi
gh --version | head -1

echo
echo "==> 2/4  Authentication"
if gh auth status >/dev/null 2>&1; then
  echo "Already authenticated:"
  gh auth status 2>&1 | sed -n '2,3p'
else
  echo "Not logged in. Choose: GitHub.com -> HTTPS -> Login with a web browser."
  echo "A one-time code will appear below — paste it in the browser page that opens."
  echo
  gh auth login --hostname github.com --git-protocol https --web
fi

echo
echo "==> 3/4  Repository"
USER=$(gh api user --jq .login)
echo "Account: $USER"

if gh repo view "$USER/$REPO_NAME" >/dev/null 2>&1; then
  echo "Repo $USER/$REPO_NAME already exists — using it."
else
  gh repo create "$REPO_NAME" --public \
    --description "Evidence-based on-chain verdict for memecoins: effective holder concentration, deployer history, exit liquidity, flow quality. Solana, BSC, Base, Ethereum, Robinhood Chain." \
    --source . --remote origin --push
  echo "Created and pushed: https://github.com/$USER/$REPO_NAME"
  exit 0
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$USER/$REPO_NAME.git"
else
  git remote add origin "https://github.com/$USER/$REPO_NAME.git"
fi

echo
echo "==> 4/4  Push"
git branch -M main
git push -u origin main

echo
echo "Done: https://github.com/$USER/$REPO_NAME"
echo
echo "Next — deploy to Vercel:"
echo "  1. Go to https://vercel.com/new"
echo "  2. Import the repo you just pushed"
echo "  3. Framework preset: Next.js (auto-detected). No env vars required."
echo "  4. Deploy."
echo
echo "Optional env var for faster Solana tracing:"
echo "  SOLANA_RPC_URL=<your private Solana RPC endpoint>"
