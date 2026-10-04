#!/usr/bin/env bash
# Deploy the race room relay to the VPS. Needs: SSH alias racknerd-vps,
# Debian `nodejs` on the server, and deploy/cyber-cat-race.service installed
# once (see docs/DEPLOYMENT.md). Uses tar + scp so it also works without rsync.

set -euo pipefail

readonly SSH_HOST="racknerd-vps"
readonly APP_ROOT="/opt/cyber-cat-race"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "部署前工作区必须干净；请先提交当前改动。" >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse '@{upstream}')" ]]; then
  echo "部署前当前提交必须已经推送到上游分支。" >&2
  exit 1
fi

npm test
rm -rf build
npm run build:server

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R build/server build/shared "$stage/"
mkdir -p "$stage/node_modules"
cp -R node_modules/ws "$stage/node_modules/ws"
printf '{ "private": true, "type": "module" }\n' > "$stage/package.json"
tar -C "$stage" -czf "$stage.tgz" .
sum="$(sha256sum "$stage.tgz" | cut -d' ' -f1)"

commit="$(git rev-parse --short=12 HEAD)"
release="$(date -u +%Y%m%dT%H%M%SZ)-${commit}"
scp -q "$stage.tgz" "${SSH_HOST}:/tmp/race-${release}.tgz"
rm -f "$stage.tgz"

ssh "${SSH_HOST}" "set -eu
  echo '${sum}  /tmp/race-${release}.tgz' | sha256sum -c -
  dir='${APP_ROOT}/releases/${release}'
  install -d -m 0755 \"\$dir\"
  tar -xzf '/tmp/race-${release}.tgz' -C \"\$dir\" --no-same-owner
  rm '/tmp/race-${release}.tgz'
  find \"\$dir\" -type d -exec chmod 0755 {} +
  find \"\$dir\" -type f -exec chmod 0644 {} +
  ln -sfn \"\$dir\" '${APP_ROOT}/current.next'
  mv -Tf '${APP_ROOT}/current.next' '${APP_ROOT}/current'
  systemctl restart cyber-cat-race
  sleep 1
  systemctl is-active --quiet cyber-cat-race
  find '${APP_ROOT}/releases' -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | sort -r | tail -n +6 | xargs -r -I{} rm -rf '${APP_ROOT}/releases/{}'
"

echo "已部署竞速服务 ${commit} 到 ${APP_ROOT}/releases/${release}"
