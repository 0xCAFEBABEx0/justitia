#!/usr/bin/env bash
# Uploads the data the pages fetch in the browser to the R2 bucket behind https://data.anisotro.pics:
# amendments/, laws/, history/, feeds/ and pagefind/ from the extractor's output directory.
#
#   CLOUDFLARE_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... scripts/upload-data.sh [--check | PART...]
#
# PART is "data" (amendments/, laws/ and history/), "feeds" (the calendars and RSS feeds written by scripts/feeds.ts)
# or "pagefind"; without one, all three are uploaded.
# The workflow uploads only the parts it rebuilt.
# With --check, it only writes, reads back and deletes one small object (_publish/check.txt), so that a
# wrong key or an rclone problem shows up in seconds, before the build (the workflow runs this first),
# and checks that the data domain serves a Brotli-compressed object correctly (see below).
# Needs rclone (the workflow uses 1.68.2), curl and Node.js 22.23.4, 24.22.1, 26.12.1 or later (see
# scripts/compress-data.ts). Only files whose content changed are uploaded (rclone compares MD5
# checksums with R2's ETags), and files that are no longer in the output are deleted from the bucket
# (pagefind/ files once they have been unused for a week; see below).
#
# amendments/, laws/ and history/ are stored Brotli-compressed (scripts/compress-data.ts, over 10 times
# smaller), with `Content-Encoding: br`. Cloudflare passes such a response on as it is to a client that
# accepts br and decompresses it for one that does not (Cloudflare docs, Cache → ETag headers), and the
# browser decompresses it before the page reads it. Not `Cache-Control: no-transform`: that would stop
# Cloudflare from decompressing it for a client that does not accept br.
# Optional: JUSTITIA_DATA (default ./data), R2_BUCKET (default justitia-data-prod),
# PUBLIC_DATA_BASE (default https://data.anisotro.pics, the public URL of the bucket, for --check).
set -euo pipefail

data="${JUSTITIA_DATA:-data}"
bucket="${R2_BUCKET:-justitia-data-prod}"
public="${PUBLIC_DATA_BASE:-https://data.anisotro.pics}"
public="${public%/}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Written after the data version in _publish/data-version.txt. The workflow reuses its cached data only when
# R2 holds that version stored this way, so a change of encoding uploads everything again.
encoding=br
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"

usage() { echo "usage: $0 [--check | data | feeds | pagefind ...]" >&2; exit 2; }
check=false upload_data=false upload_feeds=false upload_pagefind=false
case "${1:-}" in
  --check) check=true; (($# == 1)) || usage ;;
  "") (($# == 0)) || usage; upload_data=true upload_feeds=true upload_pagefind=true ;;
  *)
    for part in "$@"; do
      case "$part" in
        data) upload_data=true ;;
        feeds) upload_feeds=true ;;
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
if $upload_feeds; then
  for f in all.ics all.xml; do
    [[ -s "$data/feeds/$f" ]] || { echo "upload-data: $data/feeds/$f is missing; run npm run feeds first" >&2; exit 1; }
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

  # A Brotli-compressed object, as the data files are stored, fetched through the data domain the way
  # browsers do (with br), the way a client without br does (gzip only), and without compression.
  # no-store keeps the responses out of the cache. Any other answer stops the run before the build.
  # The key ends in .txt although the content is JSON: the zone's Bot Fight Mode answers requests from
  # the runner (a bot) with a challenge (403, cf-mitigated: challenge) except for static resources, which
  # it recognises by extension, and .txt is one of them but .json is not (Cloudflare docs, Bots →
  # Static resource protection). Browsers, which fetch the data files, are not challenged.
  printf '{"check":"%s","text":"%s"}\n' "$(date -u +%FT%TZ)" "$(printf '第一条　この法律は、%.0s' {1..40})" >"$work/check.json"
  node "$here/compress-data.ts" --file "$work/check.json" "$work/check.json.br"
  rclone copyto "$work/check.json.br" "r2:$bucket/_publish/check-br.txt" --header-upload "Content-Type: application/json" \
    --header-upload "Content-Encoding: br" --header-upload "Cache-Control: no-store"
  for accept in br gzip identity; do
    curl -sS --max-time 30 -H "Accept-Encoding: $accept" -D "$work/headers-$accept" -o "$work/body-$accept" \
      -w '%{http_code}' "$public/_publish/check-br.txt?ts=$(date +%s%N)" >"$work/status-$accept" || echo 000 >"$work/status-$accept"
  done
  # Also removes _publish/check-br.json, left behind by the first version of this check.
  rclone delete "r2:$bucket/_publish" --include "/check-br.*"
  failed=0
  for accept in br gzip identity; do
    status=$(cat "$work/status-$accept")
    got=$(tr -d '\r' <"$work/headers-$accept" 2>/dev/null | awk -F': *' 'tolower($1) == "content-encoding" { e = tolower($2) } END { print e }')
    mitigated=$(tr -d '\r' <"$work/headers-$accept" 2>/dev/null | awk -F': *' 'tolower($1) == "cf-mitigated" { m = $2 } END { print m }')
    [[ "$status" == 200 ]] && case "$accept/$got" in
      br/br) cmp -s "$work/body-$accept" "$work/check.json.br" ;;
      gzip/gzip) gzip -dc <"$work/body-$accept" | cmp -s - "$work/check.json" ;;
      gzip/ | identity/ | identity/identity) cmp -s "$work/body-$accept" "$work/check.json" ;;
      *) false ;;
    esac || {
      echo "upload-data: $public answered Accept-Encoding: $accept with HTTP $status${mitigated:+ (cf-mitigated: $mitigated)}, Content-Encoding: ${got:-none}, not the expected content" >&2
      failed=1
    }
  done
  ((failed == 0)) || exit 1
  echo "upload-data: $public serves Brotli-compressed objects as br, and decompressed to clients without br"
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
# _publish/data-version.txt records which data R2 holds ("<data version> br"); the workflow uses its cached
# data only when that matches. It says "incomplete" while the data is being synced, so an upload that fails halfway
# makes the next run extract and upload again.
# Its second line, "<source version> <updated at>" from meta.json, is the data date and the houritsu content it
# belongs to; the next extraction keeps that date when houritsu's content is the same (scripts/extract/source-version.ts).
# The "incomplete" marker carries it too, so an upload that fails halfway does not lose the date.
if $upload_data; then
  meta="$(cd "$data" && pwd)/meta.json"
  version=$(node -p 'require(process.argv[1]).dataVersion' "$meta" | grep -Ex '[0-9a-f]{16}') ||
    { echo "upload-data: $data/meta.json has no dataVersion" >&2; exit 1; }
  # Empty for output from before meta.json had them.
  dated=$(node -p 'const m = require(process.argv[1]); m.sourceVersion && m.updatedAt ? `${m.sourceVersion} ${m.updatedAt}` : ""' "$meta")
  printf '%s %s\n%s\n' "$version" "$encoding" "$dated" >"$work/data-version.txt"
  node "$here/compress-data.ts" "$data" "$work/$encoding"
  printf 'incomplete\n%s\n' "$dated" >"$work/incomplete.txt"
  rclone copyto "$work/incomplete.txt" "r2:$bucket/_publish/data-version.txt" --header-upload "Cache-Control: no-store"
  for dir in amendments laws history; do
    echo "upload-data: $dir/"
    rclone sync "$work/$encoding/$dir" "r2:$bucket/$dir" "${upload[@]}" --header-upload "Content-Encoding: $encoding"
  done
  rclone copyto "$work/data-version.txt" "r2:$bucket/_publish/data-version.txt" --header-upload "Cache-Control: no-store"
fi

# feeds/: calendars and RSS feeds that calendar apps and feed readers fetch again every few hours,
# at URLs that never change (no ?v=), so the hour of Cache-Control is how late a change can reach
# them. Stored uncompressed: some of those clients' servers may not accept br. One sync per type,
# each with its Content-Type; a sync with --include deletes only the files of its own type.
if $upload_feeds; then
  echo "upload-data: feeds/"
  rclone sync "$data/feeds" "r2:$bucket/feeds" --include "/*.ics" "${upload[@]}" \
    --header-upload "Content-Type: text/calendar; charset=utf-8"
  rclone sync "$data/feeds" "r2:$bucket/feeds" --include "/*.xml" "${upload[@]}" \
    --header-upload "Content-Type: application/rss+xml; charset=utf-8"
fi

$upload_pagefind || exit 0

# pagefind/ goes last. shards.json, which lists the shards to load, is uploaded after all the
# other files, so it never points to shards that are not uploaded yet.
# A search page that is already open keeps using the index it loaded and fetches that index's
# (content-hashed) chunks as it goes, for as long as the page stays open. So a file that a new index
# no longer uses is deleted only once it has been unused for keep_days, by the first index upload
# after that. _publish/pagefind-unused.txt lists the unused files, each with the time it was
# first found unused (seconds since 1970, UTC). A full index is about 260 MiB, so even an index that
# changed every file every day would keep under 2 GB of old files.
# _publish/pagefind-input.txt holds the input hash of the published index (the workflow skips the
# indexing when it is unchanged). Like data-version.txt, it says "incomplete" during the upload, so
# an upload that fails halfway gets the index rebuilt and uploaded again on the next run.
echo "upload-data: pagefind/"
node -p 'require(process.argv[1]).input' "$(cd "$data" && pwd)/pagefind/shards.json" | grep -Ex '[0-9a-f]{16}' >"$work/pagefind-input.txt" ||
  { echo "upload-data: $data/pagefind/shards.json has no input hash" >&2; exit 1; }
echo incomplete >"$work/incomplete.txt"
rclone copyto "$work/incomplete.txt" "r2:$bucket/_publish/pagefind-input.txt" --header-upload "Cache-Control: no-store"
rclone copy "$data/pagefind" "r2:$bucket/pagefind" --exclude /shards.json "${upload[@]}"
rclone copyto "$data/pagefind/shards.json" "r2:$bucket/pagefind/shards.json" "${upload[@]}"
rclone copyto "$work/pagefind-input.txt" "r2:$bucket/_publish/pagefind-input.txt" --header-upload "Cache-Control: no-store"
export LC_ALL=C
(cd "$data/pagefind" && find . -type f | sed 's|^\./||' | sort) >"$work/local"
rclone lsf -R --files-only --fast-list "r2:$bucket/pagefind" | sort >"$work/remote"
comm -23 "$work/remote" "$work/local" >"$work/unused"
rclone cat "r2:$bucket/_publish/pagefind-unused.txt" >"$work/before" 2>/dev/null || : >"$work/before"
keep_days=7
now=$(date -u +%s)
# Lists written before the times were recorded hold bare paths under a header with the upload time;
# those files count as unused since then.
listed=$(sed -n 's/^# Pagefind files unused by the index uploaded at \([0-9TZ:-]*\).*/\1/p' "$work/before" | head -n 1)
listed=$([[ -n "$listed" ]] && date -u -d "$listed" +%s 2>/dev/null || echo "$now")
awk -v now="$now" -v keep_s="$((keep_days * 86400))" -v listed="$listed" \
  -v delete_file="$work/delete" -v keep_file="$work/keep" '
  FILENAME == ARGV[1] {
    if ($0 ~ /^#/ || NF == 0) next
    if (NF == 2 && $1 ~ /^[0-9]+$/) since[$2] = $1; else if (NF == 1) since[$1] = listed
    next
  }
  {
    t = ($0 in since) ? since[$0] : now
    if (now - t >= keep_s) print $0 >delete_file; else print t, $0 >keep_file
  }' "$work/before" "$work/unused"
touch "$work/delete" "$work/keep"
echo "upload-data: deleting $(wc -l <"$work/delete") pagefind files unused for $keep_days days or more, keeping $(wc -l <"$work/keep") unused for less"
if [[ -s "$work/delete" ]]; then
  rclone delete "r2:$bucket/pagefind" --files-from-raw "$work/delete" --fast-list
fi
# Uploaded from a file (not streamed), with a comment line so that it is never empty.
{
  echo "# Pagefind files unused by the index uploaded at $(date -u +%FT%TZ): <first found unused, seconds since 1970 UTC> <path>"
  cat "$work/keep"
} >"$work/unused.txt"
rclone copyto "$work/unused.txt" "r2:$bucket/_publish/pagefind-unused.txt" --header-upload "Cache-Control: no-store"
