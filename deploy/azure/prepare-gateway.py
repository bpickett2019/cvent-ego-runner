#!/usr/bin/env python3
"""One-time preparation on the existing staging gateway; no public cutover."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys

HOST = 'staging.app-chartsdarts-dashboard.com'
BASE = Path('/var/lib/cvent-ego-gateway')

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def prepare(gateway, inventory):
    assert os.geteuid() == 0 and HOST in Path('/etc/caddy/Caddyfile').read_text()
    os.umask(0o077)
    intent = Path('/var/lib/cvent-ego-gateway-prepare.started')
    with intent.open('x') as f: f.write(datetime.datetime.now(datetime.timezone.utc).isoformat())
    assert not BASE.exists(), 'Gateway account/home already exists; inspect, never replay'
    subprocess.run(['useradd', '--system', '--create-home', '--home-dir', str(BASE), '--shell', '/usr/sbin/nologin', 'cvent-ego-gateway'], check=True)
    account = pwd.getpwnam('cvent-ego-gateway')
    run('runuser', '-u', account.pw_name, '--', 'ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(BASE/'forward-key'), '-C', 'cvent-ego-staging-forward-only')
    hosts = json.loads(Path(inventory).read_text())
    assert [h['name'] for h in hosts] == ['cvent-ego-1', 'cvent-ego-2', 'cvent-ego-3']
    config = Path('/etc/cvent-ego-gateway'); config.mkdir(mode=0o755); config.chmod(0o755)
    (config/'known_hosts').write_text(''.join(h['ip']+' '+h['hostKey']+'\n' for h in hosts))
    (config/'known_hosts').chmod(0o644)
    app = Path('/opt/cvent-ego-gateway'); app.mkdir(mode=0o755); app.chmod(0o755)
    body = Path(gateway).read_bytes(); (app/'gateway.mjs').write_bytes(body); (app/'gateway.mjs').chmod(0o644)
    expiry = (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=24)).isoformat()
    env = Path('/etc/cvent-ego-gateway.env')
    env.write_text(f'CVENT_PUBLIC_ORIGIN=https://{HOST}\nCVENT_STAGING_EXPIRES={expiry}\n')
    for n, h in enumerate(hosts, 1):
        port = 18780+n
        command = f'/usr/bin/ssh -F /dev/null -N -i {BASE}/forward-key -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile={config}/known_hosts -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o LogLevel=ERROR -L 127.0.0.1:{port}:127.0.0.1:8788 egoproxy@{h["ip"]}'
        unit = f'''[Unit]
Description=Private SSH forward to Cvent workspace {n}
After=network-online.target
Wants=network-online.target
[Service]
User=cvent-ego-gateway
Group=cvent-ego-gateway
ExecStart={command}
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
'''
        Path(f'/etc/systemd/system/cvent-ego-forward-{n}.service').write_text(unit)
    Path('/etc/systemd/system/cvent-ego-gateway.service').write_text('''[Unit]
Description=Authenticated expiring three-workspace staging gateway
After=network-online.target cvent-ego-forward-1.service cvent-ego-forward-2.service cvent-ego-forward-3.service
[Service]
User=cvent-ego-gateway
Group=cvent-ego-gateway
EnvironmentFile=/etc/cvent-ego-gateway.env
ExecStart=/usr/local/bin/node /opt/cvent-ego-gateway/gateway.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
UMask=0077
[Install]
WantedBy=multi-user.target
''')
    run('systemctl', 'daemon-reload')
    receipt = {'status': 'GATEWAY_PREPARED_NOT_PUBLISHED', 'expiresAt': expiry, 'gatewaySha256': hashlib.sha256(body).hexdigest(), 'publicKey': (BASE/'forward-key.pub').read_text().strip(), 'privateKeyExported': False}
    Path('/var/lib/cvent-ego-gateway-prepared.json').write_text(json.dumps(receipt, indent=2))
    return receipt

if __name__ == '__main__':
    print(json.dumps(prepare(sys.argv[1], sys.argv[2]), indent=2))
