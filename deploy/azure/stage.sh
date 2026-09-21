#!/usr/bin/env bash
# Stage a source snapshot on a bootstrapped NEW VM. No app/browser/Pi session starts.
set -euo pipefail
umask 077
[[ $(id -u) == 0 && $(hostname) =~ ^cvent-ego-[123]$ ]] || { echo 'Unexpected deployment host/user'; exit 1; }
[[ $# == 2 && $2 =~ ^[a-f0-9]{64}$ ]] || { echo 'Expected source archive and approved SHA256'; exit 1; }
[[ -f /var/lib/cvent-ego-bootstrap.json ]] || { echo 'Dependency bootstrap not complete'; exit 1; }
[[ ! -e /home/egorunner/cvent-ego-runner && ! -e /var/lib/cvent-ego-stage.started ]] || { echo 'Existing stage; reconcile rather than replay'; exit 1; }
printf '%s  %s\n' "$2" "$1" | sha256sum --check --strict
(set -o noclobber; printf '%s\n' "$(date -u +%FT%TZ) $2" > /var/lib/cvent-ego-stage.started)
export SOURCE_ARCHIVE=$1
python3 - <<'PY'
import hashlib, json, os, pathlib, tarfile
root = pathlib.Path('/home/egorunner/cvent-ego-runner')
with tarfile.open(os.environ['SOURCE_ARCHIVE']) as archive:
    members = archive.getmembers()
    names = [m.name for m in members]
    assert len(names) == len(set(names)), 'Duplicate archive paths'
    for m in members:
        p = pathlib.PurePosixPath(m.name)
        assert m.isfile() and not p.is_absolute() and '..' not in p.parts, 'Unsafe archive member'
        assert 0 <= m.size <= 100_000_000, 'Oversized archive member'
    manifest = json.load(archive.extractfile('source-manifest.json'))
    assert set(names) == set(manifest['files']) | {'source-manifest.json'}, 'Unexpected archive content'
    assert manifest['egoRevision'] == 'dca7003349c5f7132189ba00547cbbd7ff8e597e'
    for name, sha in manifest['files'].items():
        assert hashlib.sha256(archive.extractfile(name).read()).hexdigest() == sha, 'Source hash mismatch'
    root.mkdir(mode=0o700)
    archive.extractall(root, filter='data')
PY
chown -R egorunner:egorunner /home/egorunner/cvent-ego-runner
runuser -u egorunner -- bash <<'USER_INSTALL'
set -euo pipefail
umask 077
cd /home/egorunner/cvent-ego-runner
npm ci --ignore-scripts --no-audit --no-fund
python3 -m venv .venv
.venv/bin/pip install --disable-pip-version-check -r requirements.txt
npm --prefix external/cvent-agent install --ignore-scripts --no-audit --no-fund --save-exact tsx@4.23.12
mkdir -p vendor/ego-lite
git -C vendor/ego-lite init --quiet
git -C vendor/ego-lite remote add origin https://github.com/citrolabs/ego-lite.git
git -C vendor/ego-lite fetch --quiet --depth 1 origin dca7003349c5f7132189ba00547cbbd7ff8e597e
git -C vendor/ego-lite checkout --quiet --detach FETCH_HEAD
# Check the freshly fetched commit's tracked content against the exported snapshot.
python3 - <<'PY'
import pathlib, tarfile
root = pathlib.Path('vendor/ego-lite')
with tarfile.open('ego-upstream.tar') as archive:
    for m in archive:
        p = pathlib.PurePosixPath(m.name)
        assert not p.is_absolute() and '..' not in p.parts
        if m.isfile():
            assert (root / m.name).read_bytes() == archive.extractfile(m).read(), 'Upstream source drift'
PY
git -C vendor/ego-lite apply ../../ego-bridge/patches/steel-session-ledger.patch
npm --prefix vendor/ego-lite/package/ego-browser ci --ignore-scripts --no-audit --no-fund
npm --prefix vendor/ego-lite/package/ego-browser run build
mkdir -p data/current data/jobs data/workbooks "$HOME/.pi/agent"
python3 - <<'PY'
import json, pathlib
for name, value in {
    'runtime.json': {'ownership': 'USER', 'identityVerified': False, 'deploymentStatus': 'AWAITING_ACTIVATION'},
    'state.json': {'status': 'IDLE', 'currentAction': 'Deployment staged; credentials and concurrency safeguards pending', 'completed': [], 'pending': [], 'activity': []}
}.items():
    with (pathlib.Path('data/current') / name).open('x') as f: json.dump(value, f, indent=2)
PY
USER_INSTALL
python3 - <<'PY'
from pathlib import Path
unit = '''[Unit]
Description=Cvent Ego isolated runner (manual activation only)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
ConditionPathExists=/etc/cvent-ego/activation-approved

[Service]
Type=simple
User=egorunner
Group=egorunner
SupplementaryGroups=docker
WorkingDirectory=/home/egorunner/cvent-ego-runner
Environment=HOME=/home/egorunner
Environment=PATH=/home/egorunner/cvent-ego-runner/.venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PORT=8788
Environment=PI_CODING_AGENT_DIR=/home/egorunner/.pi/agent
Environment=PI_SKIP_VERSION_CHECK=1
Environment=PI_TELEMETRY=0
Environment=CVENT_AGENT_ROOT=/home/egorunner/cvent-ego-runner/external/cvent-agent
Environment=CVENT_UI_AUTOMATION_ROOT=/home/egorunner/cvent-ego-runner/external/cvent-ui-automation
EnvironmentFile=/etc/cvent-ego/runner.env
ExecStart=/usr/local/bin/node app/server.mjs
Restart=no
KillMode=control-group
TimeoutStopSec=120
UMask=0077
LimitCORE=0

[Install]
WantedBy=multi-user.target
'''
with Path('/etc/systemd/system/cvent-ego.service').open('x') as f: f.write(unit)
PY
systemctl daemon-reload
# Do NOT enable/start the service or create activation-approved/credentials.
python3 - <<'PY'
import datetime, json, pathlib
receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status': 'SOURCE_STAGED_APP_DISABLED', 'appStarted': False, 'credentialsCopied': False,
 'paidPrompts': 0, 'browserLaunches': 0, 'activationRequired': True}
with pathlib.Path('/var/lib/cvent-ego-stage.json').open('x') as f: json.dump(receipt, f, indent=2)
print(json.dumps(receipt))
PY
