#!/usr/bin/env python3
"""Read-only verification of a newly staged VM. No agent/browser/API calls."""
import hashlib
import json
import pathlib
import re
import socket
import subprocess

ROOT = pathlib.Path('/home/egorunner/cvent-ego-runner')
IMAGE = 'sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02'


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=25, **kwargs)


def allowed_listener(line):
    fields = line.split()
    if len(fields) < 4:
        return False
    address = fields[3]
    port = address.rsplit(':', 1)[-1]
    owners = set(re.findall(r'\("([^"]+)",pid=', line))
    if port == '22':
        return bool(owners) and owners <= {'sshd', 'systemd'}
    if port == '53' and address.startswith('127.0.0.'):
        return owners == {'systemd-resolve'}
    # Ubuntu's containerd exposes an ephemeral loopback listener, not Docker's API.
    return address.startswith('127.0.0.1:') and owners == {'containerd'}


def verify():
    assert socket.gethostname() in {'cvent-ego-1', 'cvent-ego-2', 'cvent-ego-3'}
    manifest = json.loads((ROOT/'source-manifest.json').read_text())
    for name, sha in manifest['files'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == sha, 'Staged source hash mismatch'
    env = ['HOME=/home/egorunner',
           'PATH='+str(ROOT/'.venv/bin')+':/usr/local/bin:/usr/bin:/bin',
           'CVENT_AGENT_ROOT='+str(ROOT/'external/cvent-agent'),
           'CVENT_UI_AUTOMATION_ROOT='+str(ROOT/'external/cvent-ui-automation')]
    result = run(['runuser', '-u', 'egorunner', '--', 'env', '-i', *env,
                  '/usr/local/bin/node', 'scripts/check-installation.mjs'], cwd=ROOT)
    assert result.returncode == 1, 'Installation check should await configuration'
    check = json.loads(result.stdout)
    blocked = [c['name'] for c in check['checks'] if c['status'] != 'PASS']
    assert set(blocked) == {'Pi provider/model selected (authentication not tested)',
                           'Cvent credential source present (contents/authentication not tested)'}, 'Unexpected dependency blocker'
    for path in ('/etc/cvent-ego/runner.env', '/etc/cvent-ego/activation-approved',
                 '/home/egorunner/.pi/agent/auth.json'):
        assert not pathlib.Path(path).exists(), 'Unexpected credential or activation file'
    assert run(['systemctl', 'is-active', 'cvent-ego']).stdout.strip() == 'inactive'
    assert run(['systemctl', 'is-enabled', 'cvent-ego']).stdout.strip() == 'disabled'
    ps = run(['docker', 'ps', '-a', '--format', '{{.Names}}'])
    assert ps.returncode == 0 and not ps.stdout.strip(), 'Unexpected container on new VM'
    image_result = run(['docker', 'image', 'inspect', IMAGE, '--format', '{{json .}}'])
    assert image_result.returncode == 0
    image = json.loads(image_result.stdout)
    assert image['Id'] == IMAGE and image['Architecture'] == 'arm64'
    assert not list((ROOT/'data/jobs').iterdir()), 'Unexpected historical or live jobs'
    assert not list((ROOT/'data/workbooks').iterdir()), 'Unexpected workbook transfer'
    assert json.loads((ROOT/'data/current/runtime.json').read_text())['ownership'] == 'USER'
    assert not (ROOT/'data/rr-connection.lock').exists(), 'App lock unexpectedly present'
    vendor = run(['runuser', '-u', 'egorunner', '--', 'git', '-C', str(ROOT/'vendor/ego-lite'),
                  'diff', 'HEAD', '--', 'package/ego-browser/src/page-ledger.ts'])
    assert vendor.returncode == 0 and vendor.stdout == (ROOT/'ego-bridge/patches/steel-session-ledger.patch').read_text()
    listener_result = run(['ss', '-H', '-ltnp'])
    assert listener_result.returncode == 0, 'Cannot inspect listeners'
    listeners = listener_result.stdout.splitlines()
    assert listeners and all(allowed_listener(line) for line in listeners), 'Unexpected TCP listener'
    return {'host': socket.gethostname(), 'status': 'STAGED_AND_VERIFIED_NOT_ACTIVATED',
            'dependencyChecksPassed': len(check['checks'])-len(blocked), 'configurationBlockers': blocked,
            'sourceHashesMatch': True, 'vendorPatchMatches': True, 'steelImageMatches': True,
            'appInactiveAndDisabled': True, 'noContainersOrJobs': True, 'noCredentialsOrActivation': True,
            'onlySSHAndExpectedLoopbackServices': True, 'paidPrompts': 0, 'browserLaunches': 0}


if __name__ == '__main__':
    print(json.dumps(verify(), indent=2))
