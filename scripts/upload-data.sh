#!/usr/bin/env bash
# Uploads the data the pages fetch in the browser to the R2 bucket behind https://data.anisotro.pics:
# amendments/, laws/, history/ and pagefind/ from the extractor's output directory.
#
#   CLOUDFLARE_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... scripts/upload-data.sh [--check | PART...]
#
# PART is "data" (amendments/, laws/ and history/) or "pagefind"; without one, both are uploaded.
# The workflow uploads only the parts it rebuilt.
# With --check, it only writes, reads back and deletes one small object (_publish/check.txt), so that a
# wrong key or an rclone problem shows up in seconds, before the build (the workflow runs this first).
# Needs rclone (the workflow uses 1.68.2) and Node.js. Only files whose content changed are uploaded (rclone compares MD5
# checksums with R2's ETags), and files that are no longer in the output are deleted from the bucket
# (pagefind/ files one run later; see below).
# Optional: JUSTITIA_DATA (default ./data), R2_BUCKET (default justitia-data-prod).
set -euo pipefail

data="${JUSTITIA_DATA:-data}"
bucket="${R2_BUCKET:-justitia-data-prod}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"

usage() { echo "usage: $0 [--check | data | pagefind ...]" >&2; exit 2; }
check=false upload_data=false upload_pagefind=false
case "${1:-}" in
  --check) check=true; (($# == 1)) || usage ;;
  "") upload_data=true upload_pagefind=true ;;
  *)
    for part in "$@"; do
      case "$part" in
        data) upload_data=true ;;
        pagefind) upload_pagefind=true ;;
        *) usage ;;
      esac
    done
    ;;
esac

# A sync deletes what is not in the source, so refuse to run on incomplete output.
if $upload_data; then
  [[ -s "$data/meta.json" ]] || { echo "upload-data: $data/meta.json is missing; run the extractor first" >&2; exit 1; }
  for dir in amendments laws history; do
    [[ -n "$(find "$data/$dir" -maxdepth 1 -name '*.json' -print -quit 2>/dev/null)" ]] ||
      { echo "upload-data: $data/$dir is empty" >&2; exit 1; }
  done
fi
if $upload_pagefind; then
  [[ -s "$data/pagefind/shards.json" ]] ||
    { echo "upload-data: $data/pagefind/shards.json is missing; run the search index first" >&2; exit 1; }
fi

# rclone remote "r2", configured from the environment.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if $check; then
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
if $upload_data; then
  for dir in amendments laws history; do
    echo "upload-data: $dir/"
    rclone sync "$data/$dir" "r2:$bucket/$dir" "${upload[@]}"
  done
  # Records which data R2 now holds; the workflow uses its cached data only when that matches.
  node -p 'require(process.argv[1]).dataVersion' "$(cd "$data" && pwd)/meta.json" | grep -Ex '[0-9a-f]{16}' >"$work/data-version.txt" ||
    { echo "upload-data: $data/meta.json has no dataVersion" >&2; exit 1; }
  rclone copyto "$work/data-version.txt" "r2:$bucket/_publish/data-version.txt" --header-upload "Cache-Control: no-store"
fi

$upload_pagefind || exit 0

# pagefind/ goes last. shards.json, which lists the shards to load and records what the index was
# built from (the workflow skips the indexing when that has not changed), is uploaded after all the
# other files, so it never points to an index that is only partly uploaded.
# A search page that is already open keeps using the index it loaded and fetches that index's
# (content-hashed) chunks as it goes, so the files a new index no longer uses are deleted one run
# later, not right away. _publish/pagefind-unused.txt lists the files that the previous run found
# unused.
echo "upload-data: pagefind/"
rclone copy "$data/pagefind" "r2:$bucket/pagefind" --exclude /shards.json "${upload[@]}"
rclone copyto "$data/pagefind/shards.json" "r2:$bucket/pagefind/shards.json" "${upload[@]}"
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
