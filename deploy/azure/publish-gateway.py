#!/usr/bin/env python3
"""One authorized root cutover. Preserve auth/evidence; never replay or roll back."""
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

HOST='staging.app-chartsdarts-dashboard.com'
STATE=Path('/var/lib/cvent-ego-root-cutover')
ROOT=Path('/opt/cvent-one-shot/current')

def command(*args): return subprocess.check_output(args,text=True).strip()

def request(path, method='GET', body=None):
    conn=http.client.HTTPConnection('127.0.0.1',8890,timeout=30)
    conn.request(method,path,body=body,headers={'Host':HOST,'X-Cvent-Staging-User':'approved-local-maintenance','Origin':'https://'+HOST,'Content-Type':'application/json'})
    response=conn.getresponse(); data=response.read(); conn.close()
    return response.status,data

def candidate_caddy(original):
    proxy='reverse_proxy 127.0.0.1:8877 {\n\t\t\theader_up -Authorization\n\t\t}'
    assert original.count(proxy)==2, 'Unexpected Caddy routing; inspect rather than broad replacement'
    first=original.replace(proxy,'respond "Retired dashboard viewer" 410',1)
    return first.replace(proxy,'reverse_proxy 127.0.0.1:8890 {\n\t\t\theader_up -Authorization\n\t\t\theader_up X-Cvent-Staging-User {http.auth.user.id}\n\t\t}',1)

def publish():
    assert os.geteuid()==0
    os.umask(0o077)
    expires=next(l.split('=',1)[1] for l in Path('/etc/cvent-ego-gateway.env').read_text().splitlines() if l.startswith('CVENT_STAGING_EXPIRES='))
    assert datetime.datetime.fromisoformat(expires)>datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)
    assert command('systemctl','is-active','cvent-one-shot')=='active'
    runtimes=[]
    for n in [1,2,3]:
        status,body=request(f'/workspaces/{n}/api/runtime'); assert status==200
        runtime=json.loads(body)
        assert runtime['executionEnabled'] is False and runtime['ownership']=='USER' and runtime['browserStopped'] is False and runtime['budget']['spentUSD']==0
        runtimes.append(runtime)
    for key in ['runtimeId','steelSessionId']:
        assert len({r[key] for r in runtimes})==3
    pid=int(command('systemctl','show','cvent-one-shot','--property=MainPID','--value'))
    env=dict(v.split('=',1) for v in Path(f'/proc/{pid}/environ').read_bytes().decode().split('\0') if '=' in v)
    assert env.get('CVENT_STAGING_RESTRICTED_ACCESS')=='1'
    data_root=Path(env['CVENT_DATA_ROOT']); database=data_root/'control.db'
    child=subprocess.run(['pgrep','-P',str(pid)],capture_output=True,text=True)
    assert child.returncode==1, 'Legacy app has children; inspect before cutover'
    def idle():
        with sqlite3.connect(f'file:{database}?mode=ro',uri=True) as conn:
            conn.row_factory=sqlite3.Row
            rows=[dict(r) for r in conn.execute("SELECT * FROM jobs WHERE state IN ('starting','running','login_required','stopping')")]
            assert len(rows)==6 and all(r['state']=='login_required' and not r.get('pid') for r in rows), 'Legacy job state changed'
            for table in ['worker_leases','event_leases']: assert conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]==0
            return rows
    rows=idle()
    caddy=Path('/etc/caddy/Caddyfile'); original=caddy.read_text(); info=caddy.stat()
    candidate=candidate_caddy(original)
    # Preserve the exact existing Basic authentication block, without printing it.
    auth=lambda text: re.findall(r'(?:basic_auth|basicauth)[^{}]*\{[^{}]*\}',text)
    assert len(auth(original))==1 and auth(original)==auth(candidate)
    STATE.mkdir(mode=0o700)
    (STATE/'intent.json').write_text(json.dumps({'status':'STARTED_DO_NOT_REPLAY','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'waitingJobs':6,'expiresAt':expires}))
    (STATE/'Caddyfile.before').write_text(original)
    proposed=STATE/'Caddyfile.candidate'; proposed.write_text(candidate)
    subprocess.run(['caddy','validate','--config',str(proposed),'--adapter','caddyfile'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    idle()
    subprocess.run(['systemctl','stop','cvent-one-shot'],check=True)
    assert command('systemctl','show','cvent-one-shot','--property=MainPID','--value')=='0'
    rows=idle()
    with sqlite3.connect(database) as source, sqlite3.connect(STATE/'control.before.db') as target: source.backup(target)
    def artifacts():
        return {str(p.relative_to(data_root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (data_root/'workspaces').glob('*/jobs/**/*') if p.is_file() and not p.is_symlink()}
    before=artifacts()
    sys.path.insert(0,str(ROOT))
    from control_store import ControlStore
    store=ControlStore(database)
    settled=[]
    for row in rows:
        outcome=store._mutation_outcome(row['workspace_id'],row['id'])
        uncertain=bool(row.get('uncertain')) or outcome['unresolved']
        state='failed_uncertain' if uncertain else ('failed_recoverable' if outcome['hasAttempts'] else 'failed_prewrite')
        error=(row.get('error') or '')+'; Explicit operator Stop for staging dashboard replacement; all artifacts retained, no execution replay.'
        store.finish(row['id'],None,state,error,uncertain,actor='operator:approved-staging-cutover')
        settled.append({'id':row['id'],'state':state,'uncertaintyPreserved':uncertain})
    assert artifacts()==before, 'Historical job artifacts changed'
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('starting','running','login_required','stopping')").fetchone()[0]==0
    subprocess.run(['systemctl','disable','cvent-one-shot'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    # Atomic config replacement retains original permissions and owner.
    replacement=caddy.with_name('Caddyfile.ego-cutover')
    with replacement.open('x') as f: f.write(candidate); f.flush(); os.fsync(f.fileno())
    replacement.chmod(info.st_mode & 0o777); os.chown(replacement,info.st_uid,info.st_gid)
    assert caddy.read_text()==original
    os.replace(replacement,caddy)
    subprocess.run(['systemctl','reload','caddy'],check=True)
    assert command('systemctl','is-active','caddy')=='active'
    # Real TLS/Caddy anonymous checks, never synthesize or bypass public login.
    checks={}
    for path in ['/','/workspaces/1/','/workspaces/2/api/runtime','/workspaces/3/viewer']:
        result=command('curl','--silent','--show-error','--max-time','15','--resolve',HOST+':443:127.0.0.1','--output','/dev/null','--write-out','%{http_code}','https://'+HOST+path)
        assert result=='401', 'Public authentication boundary failed'
        checks[path]=result
    receipt={'status':'PUBLISHED_AI_DISABLED','origin':'https://'+HOST,'expiresAt':expires,'legacyJobsSettled':settled,'legacyJobArtifactsPreserved':len(before),'legacyDatabaseBackupRetained':True,'basicAuthUnchanged':True,'anonymousTLSChecks':checks,'paidPrompts':0,'humanAuthenticatedBrowserAcceptance':'PENDING_EXISTING_LOGIN'}
    (STATE/'receipt.json').write_text(json.dumps(receipt,indent=2))
    return receipt

if __name__=='__main__': print(json.dumps(publish(),indent=2))
