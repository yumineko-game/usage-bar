#!/usr/bin/env bash
set -euo pipefail

repo=""
verify_kind=""
target=""
what_if=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/gh-safe.sh --repo owner/repo --verify-kind repo|release [--target tag] [--what-if] -- <gh args...>

Examples:
  bash scripts/gh-safe.sh --repo yumineko-game/usage-bar --verify-kind release --target v1.2.3 --what-if -- release upload v1.2.3 dist/UsageBar-1.2.3-Setup.exe
EOF
}

while (($#)); do
  case "$1" in
    --repo) repo="${2:-}"; shift 2 ;;
    --verify-kind) verify_kind="${2:-}"; shift 2 ;;
    --target) target="${2:-}"; shift 2 ;;
    --what-if) what_if=1; shift ;;
    --) shift; break ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown wrapper argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

gh_args=("$@")

[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid --repo '$repo'; expected owner/repo." >&2; exit 2; }
case "$verify_kind" in repo|release) ;; *) echo "Invalid --verify-kind '$verify_kind'." >&2; exit 2 ;; esac
((${#gh_args[@]} > 0)) || { echo 'No gh command supplied after --.' >&2; exit 2; }

[[ "${repo,,}" == "yumineko-game/usage-bar" ]] || { echo "GitHub writes are limited to yumineko-game/usage-bar." >&2; exit 3; }

git_tag_write=0
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
        "${gh_args[0]}" == release && "${gh_args[1]:-}" =~ ^(upload|edit)$ &&
        "${gh_args[2]:-}" == "$target" ]]; then
  :
else
  echo 'UsageBar only permits writes for tagged releases.' >&2
  exit 3
fi

for arg in "${gh_args[@]}"; do
  case "$arg" in --repo|--repo=*|-R*) echo 'Forwarded gh args may not override the repository.' >&2; exit 3 ;; esac
done
case "$verify_kind" in
  repo)
    readback="$(gh repo view "$repo" --json url,nameWithOwner --jq '.nameWithOwner + "|" + .url')"
    readback_repo="${readback%%|*}"
    verified_url="${readback#*|}/"
    [[ "${readback_repo,,}" == "${repo,,}" ]] || { echo "Repository read-back mismatch: '$readback_repo' != '$repo'." >&2; exit 4; }
    ;;
  release)
    # The by-tag endpoint is published-only. Read the exact tag from the
    # repository-scoped list, which uses an untagged URL for some drafts.
    readback="$(gh api "repos/$repo/releases?per_page=100" --paginate --jq ".[] | select(.tag_name == \"$target\") | [.html_url, .draft] | join(\"|\")")"
    [[ "$readback" != *$'\n'* && "$readback" == *'|'* ]] ||
      { echo 'Release read-back did not identify exactly one object.' >&2; exit 4; }
    verified_url="${readback%|*}"
    if [[ "${readback##*|}" == true && "$verified_url" =~ ^https://github\.com/yumineko-game/usage-bar/releases/tag/untagged-[a-zA-Z0-9]+$ ]]; then
      verified_url="https://github.com/$repo/releases/tag/$target"
    fi
    ;;
esac

expected_prefix="https://github.com/$repo/"
shopt -s nocasematch
[[ "$verified_url" == "$expected_prefix"* ]] || { echo "GitHub target mismatch: '$verified_url' is not under '$expected_prefix'." >&2; exit 4; }
case "$verify_kind" in
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
  printf ' --repo %q' "$repo"
  printf '\n'
  exit 0
fi

gh "${gh_args[@]}" --repo "$repo"
