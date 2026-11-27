#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/bin"
export GH_SAFE_TEST_LOG="$test_root/gh.log"

cat > "$test_root/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "$GH_SAFE_TEST_LOG"
printf '\n' >> "$GH_SAFE_TEST_LOG"
if [[ "${FAKE_GH_MODE:-ok}" == cross ]]; then
  printf '%s\n' 'other/repo|https://github.com/other/repo'
elif [[ "$1 $2" == 'repo view' ]]; then
  printf '%s\n' "$3|https://github.com/$3"
elif [[ "$1 $2" == 'api repos/yumineko-game/usage-bar/releases?per_page=100' ]]; then
  printf '%s\n' 'https://github.com/yumineko-game/usage-bar/releases/tag/untagged-abc123|true'
fi
EOF
chmod +x "$test_root/bin/gh"
export PATH="$test_root/bin:$PATH"

expect_fail() {
  if "$@" >/dev/null 2>&1; then
    echo "Expected failure: $*" >&2
    exit 1
  fi
}

bash -n "$repo_root/scripts/gh-safe.sh"
safe=(bash "$repo_root/scripts/gh-safe.sh")
repo=yumineko-game/usage-bar
tag=v1.2.3
create=(--verify-kind repo -- release create "$tag" --verify-tag --draft)
upload=(--verify-kind release --target "$tag" -- release upload "$tag" dist/app.exe)

expect_fail "${safe[@]}" --repo other/repo "${create[@]}"
expect_fail "${safe[@]}" --repo "$repo" --verify-kind repo -- release create "$tag" --draft
expect_fail "${safe[@]}" --repo "$repo" --verify-kind repo -- release create "$tag" --verify-tag
expect_fail "${safe[@]}" --repo "$repo" --verify-kind repo -- pr create
expect_fail "${safe[@]}" --repo "$repo" --verify-kind release --target "$tag" -- release upload v1.2.4 dist/app.exe
expect_fail "${safe[@]}" --repo "$repo" "${upload[@]}" --repo other/repo
FAKE_GH_MODE=cross expect_fail "${safe[@]}" --repo "$repo" "${create[@]}"

"${safe[@]}" --repo "$repo" "${create[@]}" >/dev/null
"${safe[@]}" --repo "$repo" "${upload[@]}" >/dev/null
grep -Fq "release create $tag --verify-tag --draft --repo $repo" "$GH_SAFE_TEST_LOG"
grep -Fq "release upload $tag dist/app.exe --repo $repo" "$GH_SAFE_TEST_LOG"

echo 'GitHub release write-safety tests passed.'
