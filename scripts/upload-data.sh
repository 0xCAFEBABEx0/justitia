#!/usr/bin/env bash
# Uploads the data the pages fetch in the browser to the R2 bucket behind https://data.anisotro.pics:
# amendments/, laws/, history/ and pagefind/ from the extractor's output directory.
#
#   CLOUDFLARE_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... scripts/upload-data.sh
#
# Needs rclone (1.59 or later). Only files whose content changed are uploaded (rclone compares MD5
# checksums with R2's ETags), and files that are no longer in the output are deleted from the bucket.
# Optional: JUSTITIA_DATA (default ./data), R2_BUCKET (default justitia-data).
set -euo pipefail

data="${JUSTITIA_DATA:-data}"
bucket="${R2_BUCKET:-justitia-data}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"

# A sync deletes what is not in the source, so refuse to run on incomplete output.
for f in meta.json pagefind/shards.json; do
  [[ -s "$data/$f" ]] || { echo "upload-data: $data/$f is missing; run the extractor and the search index first" >&2; exit 1; }
done
for dir in amendments laws history; do
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

# The data domain's cache keeps files for up to an hour (see README, "Publishing").
# pagefind/ goes last: its shards.json lists the shards to load.
for dir in amendments laws history pagefind; do
  echo "upload-data: $dir/"
  rclone sync "$data/$dir" "r2:$bucket/$dir" \
    --checksum --fast-list --transfers 32 --checkers 32 \
    --header-upload "Cache-Control: public, max-age=3600" \
    --stats 60s --stats-one-line
done
