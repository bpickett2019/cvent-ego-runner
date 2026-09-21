#!/usr/bin/env bash
# New, dedicated ARM VM only. Dependencies only: no credentials or app/browser start.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo 'Run as root on the assigned NEW Azure VM'; exit 1; }
[[ $(hostname) =~ ^cvent-ego-[123]$ ]] || { echo 'Unexpected VM hostname'; exit 1; }
[[ $(uname -m) == aarch64 ]] || { echo 'Pinned Steel image requires ARM64'; exit 1; }
[[ ! -e /var/lib/cvent-ego-bootstrap.started ]] || { echo 'Prior bootstrap exists; reconcile rather than automatically replay'; exit 1; }
[[ ! -e /home/egorunner && ! -e /etc/systemd/system/cvent-ego.service ]] || { echo 'Existing installation; refusing to replace it'; exit 1; }
(set -o noclobber; printf '%s\n' "$(date -u +%FT%TZ) $(hostname)" > /var/lib/cvent-ego-bootstrap.started)
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils git docker.io python3 python3-venv
work=$(mktemp -d /var/tmp/cvent-ego-node.XXXXXX)
curl --fail --silent --show-error --location --max-time 180 \
  https://nodejs.org/dist/v24.13.0/node-v24.13.0-linux-arm64.tar.xz -o "$work/node.tar.xz"
printf '%s  %s\n' aa881151bd0f9f154a0424dd60a72e9ce10672619121658c278a24327ef46831 "$work/node.tar.xz" | sha256sum --check --strict
tar -xJf "$work/node.tar.xz" --strip-components=1 -C /usr/local
npm install --global --ignore-scripts --no-audit --no-fund @earendil-works/pi-coding-agent@0.85.1
# Root umask protects receipts, but installed public package code must be readable by the service user.
chmod -R go+rX /usr/local/lib/node_modules
useradd --create-home --user-group --shell /bin/bash egorunner
chmod 700 /home/egorunner
usermod -aG docker egorunner
systemctl enable --now docker
# Pull only; never start a browser during dependency provisioning.
docker pull ghcr.io/steel-dev/steel-browser@sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02
[[ $(docker image inspect sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02 --format '{{.Architecture}}') == arm64 ]]
install -d -m 700 /etc/cvent-ego
python3 - <<'PY'
import json, pathlib, subprocess, datetime
receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status': 'DEPENDENCIES_INSTALLED_APP_NOT_STARTED',
 'node': subprocess.check_output(['node','--version'],text=True).strip(),
 'piPackage': json.loads(pathlib.Path('/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/package.json').read_text())['version'],
 'credentialsCopied': False, 'paidPrompts': 0, 'browserLaunches': 0}
with pathlib.Path('/var/lib/cvent-ego-bootstrap.json').open('x') as f: json.dump(receipt,f,indent=2)
print(json.dumps(receipt))
PY
