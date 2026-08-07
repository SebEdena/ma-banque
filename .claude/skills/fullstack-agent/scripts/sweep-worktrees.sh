#!/usr/bin/env bash
# Lists every non-primary git worktree and reports a cleanup verdict for
# each, one line per worktree:
#   SAFE-TO-DELETE <path> <branch>   — merged PR, worktree clean
#   FLAG: <reason> <path> <branch>   — needs a human decision
# Never deletes anything itself; deletion stays the manager's call.
set -euo pipefail

STALE_DAYS=14
repo_root="$(git rev-parse --show-toplevel)"

process_worktree() {
  local path="$1" branch="$2"
  [ -z "$branch" ] && return 0

  local slug="$branch"

  # Dirty check first — always takes priority over any other verdict.
  if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
    echo "FLAG: dirty (uncommitted or unpushed work) $path $branch"
    return 0
  fi

  local pr_json pr_state
  pr_json="$(gh pr list --head "$branch" --state all --json state,url --jq '.[0]' 2>/dev/null || echo "")"
  pr_state="$(echo "$pr_json" | grep -o '"state":"[A-Z]*"' | cut -d'"' -f4 || true)"

  if [ "$pr_state" = "MERGED" ]; then
    echo "SAFE-TO-DELETE $path $branch"
    return 0
  fi

  if [ "$pr_state" = "CLOSED" ]; then
    echo "FLAG: closed-without-merge $path $branch"
    return 0
  fi

  if [ "$pr_state" = "OPEN" ]; then
    echo "FLAG: open-pr (not a cleanup candidate) $path $branch"
    return 0
  fi

  # No PR at all — check whether the feature spec still exists.
  if ! compgen -G "$repo_root/docs/spec/*${slug}*" > /dev/null; then
    echo "FLAG: orphaned (no spec file matching '$slug' under docs/spec/) $path $branch"
    return 0
  fi

  # No PR, spec still exists — check staleness via last commit date.
  local last_commit_epoch now_epoch age_days
  last_commit_epoch="$(git -C "$path" log -1 --format=%ct 2>/dev/null || echo 0)"
  now_epoch="$(date +%s)"
  age_days=$(( (now_epoch - last_commit_epoch) / 86400 ))

  if [ "$age_days" -ge "$STALE_DAYS" ]; then
    echo "FLAG: stale (no commits in ${age_days}d, no open PR) $path $branch"
  else
    echo "FLAG: in-progress (no PR yet, ${age_days}d since last commit) $path $branch"
  fi
}

path=""
branch=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      if [ -n "$path" ] && [ "$path" != "$repo_root" ]; then
        process_worktree "$path" "$branch"
      fi
      path="${line#worktree }"
      branch=""
      ;;
    "branch "*)
      branch="${line#branch refs/heads/}"
      ;;
    "")
      : # blank line separates worktree blocks; nothing to do here
      ;;
  esac
done < <(git worktree list --porcelain)

if [ -n "$path" ] && [ "$path" != "$repo_root" ]; then
  process_worktree "$path" "$branch"
fi
