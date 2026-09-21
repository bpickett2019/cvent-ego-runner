#!/usr/bin/env python3
"""Explicit one-time upgrade of the published preview. Never starts an AI job.
Transport source payload over pinned SSH (backends) / authenticated Run Command
(gateway). No credentials in the payload. Existing private env stays on host.
"""
import datetime,hashlib,json,os,pwd,socket,subprocess,sys,time,urllib.request
from pathlib import Path

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def run(*args): return subprocess.check_output(args,text=True,stderr=subprocess.PIPE).strip()
def get(port,path,body=None,headers=None):
    req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=body,headers=headers or {})
    with urllib.request.urlopen(req,timeout=120) as r:return json.load(r)
def private_write(path,body,mode=0o600,owner=None):
    tmp=path.with_name(path.name+'.ai-activation-new')
    with tmp.open('xb') as f:f.write(body);f.flush();os.fsync(f.fileno())
    tmp.chmod(mode)
    if owner:os.chown(tmp,owner.pw_uid,owner.pw_gid)
    os.replace(tmp,path)
def disabled_preview(port):
    runtime=get(port,'/api/runtime');assert runtime['executionEnabled'] is False and runtime['ownership']=='USER' and runtime['budget']['spentUSD']==0
    summaries=get(port,'/api/jobs');assert len(summaries)==1
    job=get(port,'/api/jobs/'+summaries[0]['id'])
    assert job['requestedEventName'].startswith('STAGING PREVIEW USER ') and job['originalName']=='staging-preview.xlsx'
    assert job['status']=='RUNNING' and job['phase']=='AWAITING_INPUT' and job['waitingFor']=='setup'
    assert not job.get('sessionId') and not job.get('ownedPid') and job['piCostUSD']==0
    return runtime,job

def activate(payload):
    assert os.geteuid()==0;os.umask(0o077)
    mode=payload['mode'];assert mode in ['gateway','backend']
    state=Path('/var/lib/cvent-ego-ai-activation');assert not state.exists(),'Existing activation intent; no replay'
    files=payload['files'];old=payload['oldHashes']
    assert set(files)==({'gateway.mjs','execution-slot.mjs'} if mode=='gateway' else {'app/server.mjs','app/execution-clearance.mjs'})
    if mode=='gateway':
        root=Path('/opt/cvent-ego-gateway');envpath=Path('/etc/cvent-ego-gateway.env')
        env=dict(l.split('=',1) for l in envpath.read_text().splitlines() if '=' in l)
        assert datetime.datetime.fromisoformat(env['CVENT_STAGING_EXPIRES'])>datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=15)
        assert run('systemctl','is-active','cvent-ego-gateway')=='active'
        assert subprocess.run(['systemctl','is-active','--quiet','cvent-one-shot']).returncode!=0
        for port in [18781,18782,18783]:disabled_preview(port)
        assert not Path('/var/lib/cvent-ego-gateway/execution-slot').exists()
        caddy_hash=digest(Path('/etc/caddy/Caddyfile'))
    else:
        assert socket.gethostname() in ['cvent-ego-1','cvent-ego-2','cvent-ego-3']
        root=Path('/home/egorunner/cvent-ego-runner');envpath=Path('/etc/cvent-ego/runner.env')
        before,job=disabled_preview(8788)
        values=dict((k,json.loads(v)) for k,v in (l.split('=',1) for l in envpath.read_text().splitlines() if '=' in l))
        assert values['CVENT_EXECUTION_ENABLED']=='false' and values['PI_MODEL']=='claude-sonnet-5' and values['PI_PROVIDER']=='anthropic'
        assert all(values.get(k) for k in ['ANTHROPIC_API_KEY','CVENT_CLIENT_ID','CVENT_CLIENT_SECRET','CVENT_API_BASE_URL'])
        assert envpath.stat().st_mode & 0o777 == 0o600
        assert json.loads(Path('/var/lib/cvent-ego-ai-preparation/receipt.json').read_text())['cventOAuthVerified'] is True
    for name,body in files.items():
        assert isinstance(body,str)
        path=root/name
        if name in old:assert digest(path)==old[name],'Source drift'
        else:assert not path.exists(),'Unexpected existing new module'
    state.mkdir(mode=0o700)
    def receipt(phase,**extra):
        value={'host':socket.gethostname(),'mode':mode,'phase':phase,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'paidBuildsStarted':0,**extra}
        private_write(state/'receipt.json',json.dumps(value,indent=2).encode());return value
    receipt('INTENT_NO_REPLAY')
    (state/'env.before').write_bytes(envpath.read_bytes())
    for name in old:(state/(name.replace('/','_')+'.before')).write_bytes((root/name).read_bytes())
    if mode=='gateway':
        (state/'gateway-unit.before').write_bytes(Path('/etc/systemd/system/cvent-ego-gateway.service').read_bytes())
        run('systemctl','stop','cvent-ego-gateway')
        for name,body in files.items():private_write(root/name,body.encode(),0o644)
        account=pwd.getpwnam('cvent-ego-gateway');slot=Path('/var/lib/cvent-ego-gateway/execution-slot')
        slot.mkdir(mode=0o700);os.chown(slot,account.pw_uid,account.pw_gid)
        private_write(envpath,(envpath.read_text()+f'\nCVENT_EXECUTION_SLOT_DIR={slot}\n').encode())
        drop=Path('/etc/systemd/system/cvent-ego-gateway.service.d');drop.mkdir(mode=0o755,exist_ok=True)
        assert not (drop/'ai-slot.conf').exists()
        private_write(drop/'ai-slot.conf',b'[Service]\nReadWritePaths=/var/lib/cvent-ego-gateway/execution-slot\n',0o644)
        run('systemctl','daemon-reload')
        assert digest(Path('/etc/caddy/Caddyfile'))==caddy_hash
        return receipt('GATEWAY_STAGED_STOPPED_FOR_BACKEND_ACTIVATION',expiresAt=env['CVENT_STAGING_EXPIRES'],caddyHash=caddy_hash,sourceHashes={name:digest(root/name) for name in files})
    # Stop only the positively identified demo through its own controller first.
    disabled_preview(8788)
    stopped=get(8788,'/api/jobs/'+job['id']+'/stop',b'{}',{'Content-Type':'application/json'})
    assert stopped['status']=='STOPPED' and not stopped['stopFailures'] and stopped['piCostUSD']==0
    assert get(8788,'/api/runtime')['browserStopped'] is True
    receipt('PREVIEW_STOPPED',previewJobId=job['id'])
    run('systemctl','stop','cvent-ego')
    assert not (root/'data/rr-connection.lock').exists(),'Retained controller lock; no takeover'
    protected={str(p.relative_to(root)):digest(p) for p in (root/'data').rglob('*') if p.is_file() and not p.is_symlink() and 'browser-profiles' not in p.parts}
    (state/'protected-files.json').write_text(json.dumps(protected))
    account=pwd.getpwnam('egorunner')
    for name,body in files.items():private_write(root/name,body.encode(),0o644,account)
    values['CVENT_EXECUTION_ENABLED']='true'
    private_write(envpath,''.join(k+'='+json.dumps(v)+'\n' for k,v in values.items()).encode())
    receipt('SOURCE_CONFIG_READY_NO_BUILD',previewJobId=job['id'])
    run('systemctl','start','cvent-ego')
    after=None
    for _ in range(60):
        try:after=get(8788,'/api/runtime');break
        except Exception:time.sleep(.25)
    assert after and after['executionEnabled'] is True and after['ownership']=='USER' and after['browserStopped'] is True
    assert after['budget']==before['budget']
    assert all(digest(root/name)==value for name,value in protected.items()),'Protected artifacts changed'
    assert get(8788,'/api/execution-clearance/'+job['id'])=={'cleared':True}
    pid=run('systemctl','show','cvent-ego','-p','MainPID','--value')
    loaded=dict(v.split('=',1) for v in Path('/proc/'+pid+'/environ').read_bytes().decode().split('\0') if '=' in v)
    assert all(loaded.get(k)==v for k,v in values.items()),'Runtime config mismatch'
    return receipt('AI_ENABLED_IDLE_NO_BUILD',previewJobId=job['id'],pid=int(pid),model=values['PI_MODEL'],sourceHashes={name:digest(root/name) for name in files},protectedFileCount=len(protected),modelCostUSD=0)

if __name__=='__main__':
    try:print(json.dumps(activate(json.load(sys.stdin)),indent=2))
    except Exception as error:
        print(json.dumps({'status':'ACTIVATION_NOT_CONFIRMED_INSPECT_STATE_NO_REPLAY','errorType':type(error).__name__}),file=sys.stderr);sys.exit(1)
