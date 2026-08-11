#!/usr/bin/env bash
# Usage: poll-pr-comments.sh <pr-number>
# Fetches both comment surfaces GitHub exposes on a PR — top-level issue
# comments and inline/diff review comments — and merges them into one
# chronological JSON array. `gh pr view --json comments` alone misses inline
# review comments, which is how a reviewer's inline "@agent-review" question
# can slip past a poll that only checks the top-level endpoint.
#
# Each item: { "kind": "top-level"|"inline", "author", "created_at", "body",
#              "path", "line" (inline only) }
set -euo pipefail

pr="${1:?usage: poll-pr-comments.sh <pr-number>}"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

top_level="$(gh pr view "$pr" --json comments --jq \
  '[.comments[] | {kind: "top-level", author: .author.login, created_at: .createdAt, body: .body}]')"

inline="$(gh api "repos/${repo}/pulls/${pr}/comments" --jq \
  '[.[] | {kind: "inline", author: .user.login, created_at: .created_at, body: .body, path: .path, line: .line}]')"

jq -s 'add | sort_by(.created_at)' <(echo "$top_level") <(echo "$inline")
