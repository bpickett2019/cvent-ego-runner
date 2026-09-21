#!/usr/bin/env python3
"""One-time preview activation on a verified dedicated VM. Never enables paid AI."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path('/home/egorunner/cvent-ego-runner')

def request(path, body=None, content_type='application/json'):
    req = urllib.request.Request('http://127.0.0.1:8788'+path, data=body, headers={'Content-Type': content_type})
    with urllib.request.urlopen(req, timeout=150) as response: return json.load(response)

def activate(public_key, workbook):
    from importlib.util import module_from_spec, spec_from_file_location
    spec = spec_from_file_location('verifier', Path(__file__).with_name('verify-stage.py'))
    verifier = module_from_spec(spec); spec.loader.exec_module(verifier)
    verifier.verify()
    assert os.geteuid() == 0 and socket.gethostname() in {'cvent-ego-1','cvent-ego-2','cvent-ego-3'}
    key = Path(public_key).read_text().strip()
    assert re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+ cvent-ego-staging-forward-only', key)
    os.umask(0o077)
    with Path('/var/lib/cvent-ego-preview-activation.started').open('x') as f: f.write(datetime.datetime.now(datetime.timezone.utc).isoformat())
    subprocess.run(['useradd','--system','--create-home','--home-dir','/home/egoproxy','--shell','/usr/sbin/nologin','egoproxy'], check=True)
    account = pwd.getpwnam('egoproxy')
    ssh = Path('/home/egoproxy/.ssh'); ssh.mkdir(mode=0o700); os.chown(ssh,account.pw_uid,account.pw_gid)
    auth = ssh/'authorized_keys'
    auth.write_text('restrict,port-forwarding,permitopen="127.0.0.1:8788",command="/usr/bin/false" '+key+'\n')
    os.chown(auth,account.pw_uid,account.pw_gid)
    Path('/etc/ssh/sshd_config.d/60-cvent-ego-proxy.conf').write_text('''Match User egoproxy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:8788
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
Match all
''')
    subprocess.run(['/usr/sbin/sshd','-t'],check=True)
    subprocess.run(['systemctl','reload','ssh'],check=True)
    config = Path('/etc/cvent-ego'); config.mkdir(mode=0o700,exist_ok=True)
    with (config/'runner.env').open('x') as f: f.write('CVENT_EXECUTION_ENABLED=false\nPI_PROVIDER=anthropic\n# Model ID and team Key Vault credential await operator configuration.\n')
    with (config/'activation-approved').open('x') as f: f.write('PREVIEW_ONLY_AI_DISABLED\n')
    subprocess.run(['systemctl','enable','--now','cvent-ego'],check=True)
    for attempt in range(50):
        try: runtime=request('/api/runtime'); break
        except Exception:
            if attempt==49: raise
            time.sleep(.2)
    assert runtime['executionEnabled'] is False and runtime['budget']['spentUSD']==0
    assert request('/api/jobs')==[]
    boundary='staging-'+uuid.uuid4().hex
    number=socket.gethostname().rsplit('-',1)[1]
    fields=(f'--{boundary}\r\nContent-Disposition: form-data; name="eventName"\r\n\r\nSTAGING PREVIEW USER {number} - NO BUILD\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="rr"; filename="staging-preview.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n').encode()
    body=fields+Path(workbook).read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
    job=request('/api/jobs',body,'multipart/form-data; boundary='+boundary)
    # Preserve identity before the single real browser-start dispatch. Never replay.
    Path('/var/lib/cvent-ego-preview-job.json').write_text(json.dumps({'id':job['id'],'workspace':job['workspace'],'status':'BROWSER_START_DISPATCH_ONCE'},indent=2))
    result=request('/api/jobs/'+job['id']+'/read',b'{}')
    assert result['aiStarted'] is False
    runtime=request('/api/runtime'); saved=request('/api/jobs/'+job['id'])
    assert runtime['ownership']=='USER' and runtime['browserStopped'] is False and runtime['executionEnabled'] is False
    assert saved['waitingFor']=='setup' and saved['piCostUSD']==0 and not saved.get('ownedPid') and not saved.get('sessionId')
    receipt={'status':'PREVIEW_READY_AI_DISABLED','host':socket.gethostname(),'jobId':job['id'],'runtimeId':runtime['runtimeId'],'steelSessionId':runtime['steelSessionId'],'activeTargetId':runtime['activeTargetId'],'sourceManifestSha256':hashlib.sha256((ROOT/'source-manifest.json').read_bytes()).hexdigest(),'modelCostUSD':0,'modelCredentialsPresent':False}
    Path('/var/lib/cvent-ego-preview-ready.json').write_text(json.dumps(receipt,indent=2))
    return receipt

if __name__=='__main__': print(json.dumps(activate(sys.argv[1],sys.argv[2]),indent=2))
