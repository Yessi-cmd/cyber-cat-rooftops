#!/usr/bin/env bash

set -euo pipefail

readonly SSH_HOST="racknerd-vps"
readonly APP_ROOT="/var/www/cyber-cat-rooftops"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "部署前工作区必须干净；请先提交当前改动。" >&2
  exit 1
fi

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse '@{upstream}')" ]]; then
  echo "部署前当前提交必须已经推送到上游分支。" >&2
  exit 1
fi

npm test
npm run build

commit="$(git rev-parse --short=12 HEAD)"
release="$(date -u +%Y%m%dT%H%M%SZ)-${commit}"
release_dir="${APP_ROOT}/releases/${release}"

ssh "${SSH_HOST}" "install -d -o caddy -g caddy -m 0755 '${release_dir}'"
rsync --archive --delete dist/ "${SSH_HOST}:${release_dir}/"

ssh "${SSH_HOST}" "set -eu
  find '${release_dir}' -type d -exec chmod 0755 {} +
  find '${release_dir}' -type f -exec chmod 0644 {} +
  chown -R caddy:caddy '${release_dir}'
  ln -s '${release_dir}' '${APP_ROOT}/current.next'
  mv -Tf '${APP_ROOT}/current.next' '${APP_ROOT}/current'
  find '${APP_ROOT}/releases' -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | sort -r \
    | tail -n +6 \
    | xargs -r -I{} rm -rf '${APP_ROOT}/releases/{}'
"

echo "已部署 ${commit} 到 ${release_dir}"
