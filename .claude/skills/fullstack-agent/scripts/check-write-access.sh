#!/usr/bin/env bash
# Usage: check-write-access.sh <github-username>
# Checks whether <github-username> has write (or higher) access to the
# current repo's GitHub remote. Prints "write-access" and exits 0 if so;
# prints "no-write-access" and exits 1 otherwise.
set -euo pipefail

username="${1:?usage: check-write-access.sh <github-username>}"

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

permission="$(gh api "repos/${repo}/collaborators/${username}/permission" --jq .permission 2>/dev/null || echo "none")"

case "$permission" in
  admin|maintain|write)
    echo "write-access"
    exit 0
    ;;
  *)
    echo "no-write-access"
    exit 1
    ;;
esac
