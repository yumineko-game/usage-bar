#!/usr/bin/env bash
set -euo pipefail

repo=""
verify_kind=""
target=""
allow_upstream_write=0
what_if=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/gh-safe.sh --repo owner/repo --verify-kind repo|pr|issue|release [--target id-or-tag] [--allow-upstream-write] [--what-if] -- <gh args...>

Examples:
  bash scripts/gh-safe.sh --repo nesszer/Win-CodexBar --verify-kind pr --target 361 --what-if -- pr comment 361 --body-file .review/comment.md
  bash scripts/gh-safe.sh --repo nesszer/Win-CodexBar --verify-kind repo --what-if -- pr create --title "..." --body-file body.md
  bash scripts/gh-safe.sh --repo microsoft/winget-pkgs --verify-kind repo --what-if -- pr create --head Finesssee:branch --title "..." --body-file body.md
EOF
}

while (($#)); do
  case "$1" in
    --repo) repo="${2:-}"; shift 2 ;;
    --verify-kind) verify_kind="${2:-}"; shift 2 ;;
    --target) target="${2:-}"; shift 2 ;;
    --allow-upstream-write) allow_upstream_write=1; shift ;;
    --what-if) what_if=1; shift ;;
    --) shift; break ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown wrapper argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

gh_args=("$@")

[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid --repo '$repo'; expected owner/repo." >&2; exit 2; }
case "$verify_kind" in repo|pr|issue|release) ;; *) echo "Invalid --verify-kind '$verify_kind'." >&2; exit 2 ;; esac
((${#gh_args[@]} > 0)) || { echo 'No gh command supplied after --.' >&2; exit 2; }

if [[ "${repo,,}" == "steipete/codexbar" ]]; then
  ((allow_upstream_write == 1)) || { echo 'Writes to steipete/CodexBar are blocked by default. Explicit current-turn authorization is required.' >&2; exit 3; }
else
  # Winget release step: the fork receives the manifest branch, and the PR opens on microsoft/winget-pkgs.
  case "${repo,,}" in
    nesszer/win-codexbar|finesssee/winget-pkgs|microsoft/winget-pkgs|yumineko-game/usage-bar) ;;
    *) echo "GitHub writes are not allowlisted for '$repo'." >&2; exit 3 ;;
  esac
fi

git_tag_write=0
if [[ "${repo,,}" == "yumineko-game/usage-bar" ]]; then
  version_tag='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
  if [[ "$verify_kind" == repo && "${gh_args[0]}" == git-release-tag &&
        "${#gh_args[@]}" == 3 && "${gh_args[1]}" =~ $version_tag &&
        "${gh_args[2]}" =~ ^[0-9a-f]{40}$ ]]; then
    git_tag_write=1
  elif [[ "$verify_kind" == repo && "${gh_args[0]}" == release &&
          "${gh_args[1]:-}" == create && "${gh_args[2]:-}" =~ $version_tag ]]; then
    [[ " ${gh_args[*]} " == *" --verify-tag "* && " ${gh_args[*]} " == *" --draft "* ]] ||
      { echo 'UsageBar release creation requires an existing tag and a draft.' >&2; exit 3; }
  elif [[ "$verify_kind" == release && "$target" =~ $version_tag &&
          "${gh_args[0]}" == release && "${gh_args[1]:-}" =~ ^(upload|edit)$ ]]; then
    :
  else
    echo 'UsageBar only permits writes for tagged releases.' >&2
    exit 3
  fi
fi

for arg in "${gh_args[@]}"; do
  case "$arg" in --repo|-R|--repo=*) echo 'Forwarded gh args may not override the repository.' >&2; exit 3 ;; esac
done

if [[ "$verify_kind" != repo ]]; then
  [[ -n "$target" ]] || { echo "--target is required for verify kind '$verify_kind'." >&2; exit 2; }
  [[ "${gh_args[0]}" == "$verify_kind" ]] || { echo "Forwarded command must target '$verify_kind'." >&2; exit 3; }
  ((${#gh_args[@]} >= 3)) || { echo "Forwarded command must carry its object as the third token (gh <object> <verb> <number>)." >&2; exit 3; }
  [[ "${gh_args[2]}" == "$target" ]] || { echo "Forwarded command object '${gh_args[2]:-}' is not the verified target '$target'." >&2; exit 3; }
fi
api_passthrough=0
if [[ "$verify_kind" == repo && "${gh_args[0]}" == api ]]; then
  ((${#gh_args[@]} >= 2)) || { echo 'gh api requires a repository-scoped REST path.' >&2; exit 3; }
  api_path="${gh_args[1]}"
  expected_api_prefix="repos/$repo/"
  shopt -s nocasematch
  [[ "$api_path" == "$expected_api_prefix"* ]] || {
    shopt -u nocasematch
    echo "Repository API write path '$api_path' is outside '$expected_api_prefix'." >&2
    exit 3
  }
  shopt -u nocasematch
  [[ "$api_path" != *'..'* ]] || { echo "Repository API write path may not contain '..'." >&2; exit 3; }
  api_passthrough=1
fi

case "$verify_kind" in
  repo)
    readback="$(gh repo view "$repo" --json url,nameWithOwner --jq '.nameWithOwner + "|" + .url')"
    readback_repo="${readback%%|*}"
    verified_url="${readback#*|}/"
    [[ "${readback_repo,,}" == "${repo,,}" ]] || { echo "Repository read-back mismatch: '$readback_repo' != '$repo'." >&2; exit 4; }
    ;;
  pr) verified_url="$(gh pr view "$target" --repo "$repo" --json url --jq .url)" ;;
  issue) verified_url="$(gh issue view "$target" --repo "$repo" --json url --jq .url)" ;;
  release)
    if [[ "${repo,,}" == "yumineko-game/usage-bar" ]]; then
      # The by-tag endpoint is published-only. Read the exact tag from the
      # repository-scoped list, which uses an untagged URL for some drafts.
      readback="$(gh api "repos/$repo/releases?per_page=100" --paginate --jq ".[] | select(.tag_name == \"$target\") | [.html_url, .draft] | join(\"|\")")"
      [[ "$readback" != *$'\n'* && "$readback" == *'|'* ]] ||
        { echo 'Release read-back did not identify exactly one object.' >&2; exit 4; }
      verified_url="${readback%|*}"
      if [[ "${readback##*|}" == true && "$verified_url" =~ ^https://github\.com/yumineko-game/usage-bar/releases/tag/untagged-[a-zA-Z0-9]+$ ]]; then
        verified_url="https://github.com/$repo/releases/tag/$target"
      fi
    else
      verified_url="$(gh api "repos/$repo/releases/tags/$target" --jq .html_url)"
    fi
    ;;
esac

expected_prefix="https://github.com/$repo/"
shopt -s nocasematch
[[ "$verified_url" == "$expected_prefix"* ]] || { echo "GitHub target mismatch: '$verified_url' is not under '$expected_prefix'." >&2; exit 4; }
case "$verify_kind" in
  pr) [[ "$verified_url" == *"/pull/$target" ]] || { echo "GitHub target mismatch: '$verified_url' does not end with '/pull/$target'." >&2; exit 4; } ;;
  issue) [[ "$verified_url" == *"/issues/$target" ]] || { echo "GitHub target mismatch: '$verified_url' does not end with '/issues/$target'." >&2; exit 4; } ;;
  release) [[ "$verified_url" == *"/releases/tag/$target" ]] || { echo "GitHub target mismatch: '$verified_url' does not end with '/releases/tag/$target'." >&2; exit 4; } ;;
esac
shopt -u nocasematch

echo "Verified GitHub write target: $verified_url"
if ((git_tag_write == 1)); then
  tag_ref="refs/tags/${gh_args[1]}"
  commit="${gh_args[2]}"
  remote_url="https://github.com/$repo.git"
  previous="$(git ls-remote --refs "$remote_url" "$tag_ref")"
  if [[ -n "$previous" && "$previous" != "$commit"$'\t'"$tag_ref" ]]; then
    echo "Remote tag '$tag_ref' does not point to the release commit." >&2
    exit 4
  fi
  if [[ -z "$previous" ]]; then
    if ((what_if == 1)); then
      printf 'WhatIf: git push %q %q\n' "$remote_url" "$commit:$tag_ref"
    else
      git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
        push "$remote_url" "$commit:$tag_ref"
    fi
  fi
  exit 0
fi
if ((what_if == 1)); then
  printf 'WhatIf: gh'
  printf ' %q' "${gh_args[@]}"
  if ((api_passthrough == 0)); then
    printf ' --repo %q' "$repo"
  fi
  printf '\n'
  exit 0
fi

if ((api_passthrough == 1)); then
  gh "${gh_args[@]}"
else
  gh "${gh_args[@]}" --repo "$repo"
fi
