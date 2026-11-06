#!/usr/bin/env bash
# Uploads the data the pages fetch in the browser to the R2 bucket behind https://data.anisotro.pics:
# amendments/, laws/, history/ and pagefind/ from the extractor's output directory.
#
#   CLOUDFLARE_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... scripts/upload-data.sh [--check]
#
# With --check, it only writes, reads back and deletes one small object (_publish/check.txt), so that a
# wrong key or an rclone problem shows up in seconds, before the build (the workflow runs this first).
# Needs rclone (the workflow uses 1.68.2). Only files whose content changed are uploaded (rclone compares MD5
# checksums with R2's ETags), and files that are no longer in the output are deleted from the bucket
# (pagefind/ files one run later; see below).
# Optional: JUSTITIA_DATA (default ./data), R2_BUCKET (default justitia-data-prod).
set -euo pipefail

data="${JUSTITIA_DATA:-data}"
bucket="${R2_BUCKET:-justitia-data-prod}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"

check=false
case "${1:-}" in
  --check) check=true ;;
  "") ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

# A sync deletes what is not in the source, so refuse to run on incomplete output.
$check || for f in meta.json pagefind/shards.json; do
  [[ -s "$data/$f" ]] || { echo "upload-data: $data/$f is missing; run the extractor and the search index first" >&2; exit 1; }
done
$check || for dir in amendments laws history; do
  [[ -n "$(find "$data/$dir" -maxdepth 1 -name '*.json' -print -quit 2>/dev/null)" ]] ||
    { echo "upload-data: $data/$dir is empty" >&2; exit 1; }
done

# rclone remote "r2", configured from the environment.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

if $check; then
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  echo "upload-data check $(date -u +%FT%TZ)" >"$work/check.txt"
  rclone copyto "$work/check.txt" "r2:$bucket/_publish/check.txt" --header-upload "Cache-Control: no-store"
  rclone cat "r2:$bucket/_publish/check.txt" | cmp -s - "$work/check.txt" ||
    { echo "upload-data: _publish/check.txt read back differently" >&2; exit 1; }
  rclone deletefile "r2:$bucket/_publish/check.txt"
  echo "upload-data: R2 bucket $bucket is writable"
  exit 0
fi

# The data domain's cache keeps files for up to an hour (see README, "Publishing"). The pages ask
# for amendments/, laws/ and history/ files with the data version in the query string (a hash of
# those files, so it changes only when one of them does), so a page never mixes files from two
# builds; files that are gone can be deleted right away.
upload=(--checksum --fast-list --transfers 32 --checkers 32
  --header-upload "Cache-Control: public, max-age=3600"
  # Print the counts (files checked, uploaded, deleted) every minute and at the end. Stats are
  # logged at INFO by default, which the default NOTICE level hides.
  --stats 60s --stats-log-level NOTICE)
for dir in amendments laws history; do
  echo "upload-data: $dir/"
  rclone sync "$data/$dir" "r2:$bucket/$dir" "${upload[@]}"
done

# pagefind/ goes last: its shards.json lists the shards to load. A search page that is already
# open keeps using the index it loaded and fetches that index's (content-hashed) chunks as it
# goes, so the files a new index no longer uses are deleted one run later, not right away.
# _publish/pagefind-unused.txt lists the files that the previous run found unused.
echo "upload-data: pagefind/"
rclone copy "$data/pagefind" "r2:$bucket/pagefind" "${upload[@]}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export LC_ALL=C
(cd "$data/pagefind" && find . -type f | sed 's|^\./||' | sort) >"$work/local"
rclone lsf -R --files-only --fast-list "r2:$bucket/pagefind" | sort >"$work/remote"
comm -23 "$work/remote" "$work/local" >"$work/unused"
rclone cat "r2:$bucket/_publish/pagefind-unused.txt" 2>/dev/null | { grep -v '^#' || :; } | sort >"$work/before" ||
  : >"$work/before"
comm -12 "$work/unused" "$work/before" >"$work/delete"
comm -23 "$work/unused" "$work/before" >"$work/keep"
echo "upload-data: deleting $(wc -l <"$work/delete") unused pagefind files, keeping $(wc -l <"$work/keep") for one more run"
if [[ -s "$work/delete" ]]; then
  rclone delete "r2:$bucket/pagefind" --files-from-raw "$work/delete" --fast-list
fi
# Uploaded from a file (not streamed), with a comment line so that it is never empty.
{ echo "# Pagefind files unused by the index uploaded at $(date -u +%FT%TZ)"; cat "$work/keep"; } >"$work/unused.txt"
rclone copyto "$work/unused.txt" "r2:$bucket/_publish/pagefind-unused.txt" --header-upload "Cache-Control: no-store"
